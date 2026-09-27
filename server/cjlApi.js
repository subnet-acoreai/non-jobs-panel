import { getCatalogCompany, getCatalogJob, getCatalogJobs, readCatalog } from './catalogStore.js'
import { getPublishedExtraBySlug, listPublishedExtraJobs } from './extraJobs.js'
import { filterAndSortJobs } from '../shared/jobSearch.js'
import { XMLParser } from 'fast-xml-parser'
import { stripEmptyBlocks } from '../shared/cleanHtml.js'
import { browserHeaders, cjlCookie } from './cjlNext.js'

const API_BASE = 'https://api.cryptojobslist.com'
const CACHE_MS = 5 * 60 * 1000
export const JOBS_PAGE_SIZE = 8
const UPSTREAM_PAGE_SIZE = 25

const FEEDS = {
  all: 'web3',
  engineering: 'engineering',
  design: 'designer',
  trading: 'trading',
  community: 'community',
  content: 'content',
  marketing: 'marketing',
  legal: 'legal',
  sales: 'sales',
  executive: 'executive',
  remote: 'remote',
  research: 'research',
}

const TAG_TO_CATEGORY = [
  ['engineering', ['engineering', 'developer', 'solidity', 'golang', 'rust', 'devops', 'smart-contract', 'ethereum']],
  ['design', ['designer', 'ui-ux', 'product-designer', 'product-manager', 'product']],
  ['trading', ['trading', 'trader', 'research', 'quant']],
  ['community', ['community']],
  ['content', ['content', 'technical-writer']],
  ['marketing', ['marketing', 'growth']],
  ['legal', ['legal', 'compliance', 'kyc']],
  ['sales', ['sales', 'business-development']],
  ['executive', ['executive', 'director', 'lead-level']],
]

const SKIP_TAGS = new Set(['', 'jobs'])

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
})

const cache = new Map()
const jobIndex = new Map()

function text(value) {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return text(value[0])
  if (typeof value === 'object') {
    if (typeof value['#text'] === 'string') return value['#text']
    if (typeof value.__cdata === 'string') return value.__cdata
  }
  return ''
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function prettyTag(slug) {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function extractTags(html) {
  const tags = []
  const seen = new Set()
  const re = /href="https:\/\/cryptojobslist\.com\/([a-z0-9-]+)"/gi
  let match
  while ((match = re.exec(html))) {
    const slug = match[1]
    if (SKIP_TAGS.has(slug) || seen.has(slug)) continue
    seen.add(slug)
    tags.push(prettyTag(slug))
  }
  return tags.slice(0, 8)
}

function categoryFromTags(tagSlugs, prettyTags) {
  const hay = `${tagSlugs.join(' ')} ${prettyTags.join(' ')}`.toLowerCase()
  for (const [category, keys] of TAG_TO_CATEGORY) {
    if (keys.some((key) => hay.includes(key))) return category
  }
  return ''
}

function extractSalary(html) {
  const plain = html.replace(/<[^>]+>/g, ' ')
  const match = plain.match(
    /\$[\d,]{2,}k(?:\s*[-–]\s*\$?[\d,]+k)?(?:\s*(?:\/|per)\s*(?:year|yr|month|mo|hour|hr))?|\d{2,3}k\s*[-–]\s*\d{2,3}k(?:\s*\/\s*(?:year|month))?|\$[\d,]{3,}\s*[-–]\s*\$[\d,]{3,}(?:\s*(?:\/|per)\s*(?:year|month))?/i,
  )
  return match ? match[0].replace(/\s+/g, ' ').trim() : ''
}

function salaryMin(salary) {
  const match = String(salary).replace(/,/g, '').match(/(\d+)/)
  return match ? Number(match[1]) : 0
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function sanitizeHtml(html) {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<img[^>]*webfeedsFeaturedVisual[^>]*>/gi, '')
    .replace(/<p>\s*Tags:[\s\S]*?(?=<h[1-6]|<p>|$)/i, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '')
  return stripEmptyBlocks(cleaned)
}

function daysAgo(dateValue) {
  if (!dateValue) return null
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return null
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 86400000))
}

function attr(node, name) {
  if (!node || typeof node !== 'object') return ''
  return text(node[name] || node[`@_${name.replace(/^@_/, '')}`])
}

function normalizeRssItem(item) {
  const html = text(item.description)
  const canonical =
    text(item['media:canonical']) ||
    text(item.link) ||
    text(item.guid)
  const slug =
    canonical.split('/jobs/')[1]?.split('?')[0]?.replace(/\/$/, '') || slugify(text(item.title))
  const company = text(item['dc:creator']) || 'Unknown'
  const location = text(item['media:location'])
  const tags = extractTags(html)
  const tagSlugs = tags.map((t) => slugify(t))
  const remote =
    /remote/i.test(location) ||
    tagSlugs.includes('remote') ||
    /cryptojobslist\.com\/remote/i.test(html)
  const type = tagSlugs.includes('full-time')
    ? 'Full Time'
    : tagSlugs.includes('contract')
      ? 'Contractor'
      : tagSlugs.includes('intern')
        ? 'Intern'
        : 'Full Time'
  const salary = extractSalary(html)
  const media = item['media:content']
  const logo = attr(media, '@_url') || text(item['media:ogImage'])
  const published = item.pubDate || item.published || item['dc:date']
  const htmlClean = sanitizeHtml(html)
  const summary = stripHtml(htmlClean).slice(0, 280)

  return {
    id: slug,
    slug,
    title: text(item.title),
    company,
    companySlug: slugify(company),
    salary,
    salaryMin: salaryMin(salary),
    location: location || (remote ? 'Remote' : ''),
    remote,
    tags: tags.filter((t) => !['Web3', 'Remote', 'Full Time'].includes(t)).slice(0, 6),
    category: categoryFromTags(tagSlugs, tags),
    postedDaysAgo: daysAgo(published),
    featured: tagSlugs.includes('featured') || tagSlugs.includes('executive'),
    applicants: 0,
    views: 0,
    type,
    postedOn: published ? new Date(published).toLocaleDateString() : '',
    publishedAt: published ? new Date(published).toISOString() : '',
    summary,
    plain: stripHtml(htmlClean).slice(0, 2500),
    html: htmlClean,
    logo,
    canonicalURL: canonical.replace(/\?utm_medium=RSS.*$/, ''),
    source: 'rss',
  }
}

function normalizeJsonJob(raw) {
  const title = raw.jobTitle || raw.title || ''
  const company = raw.companyName || raw.company || 'Unknown'
  const canonical = raw.canonicalURL || raw.url || raw.link || ''
  const slug =
    canonical.split('/jobs/')[1]?.split('?')[0]?.replace(/\/$/, '') ||
    slugify(`${title}-at-${company}`)
  const html = raw.description || raw.jobDescription || ''
  const tags = Array.isArray(raw.tags)
    ? raw.tags.map((t) => prettyTag(String(t).replace(/^#/, '')))
    : extractTags(html)
  const location = raw.jobLocation || raw.location || ''
  const remote = Boolean(raw.remote) || /remote/i.test(location)
  const employment = Array.isArray(raw.employmentType) ? raw.employmentType[0] : raw.employmentType
  const type =
    employment === 'FULL_TIME' || /full/i.test(String(employment || ''))
      ? 'Full Time'
      : employment === 'CONTRACTOR'
        ? 'Contractor'
        : employment || 'Full Time'
  const salary = raw.salary || raw.salaryRange || extractSalary(html)
  const published = raw.publishedAt || raw.published || raw.datePosted

  return {
    id: slug,
    slug,
    title,
    company,
    companySlug: slugify(company),
    salary,
    salaryMin: salaryMin(salary),
    location: location || (remote ? 'Remote' : ''),
    remote,
    tags: tags.slice(0, 6),
    category: categoryFromTags(tags.map((t) => slugify(t)), tags),
    postedDaysAgo: daysAgo(published),
    featured: Boolean(raw.featured),
    applicants: Number(raw.applicants || 0),
    views: Number(raw.views || 0),
    type,
    postedOn: published ? new Date(published).toLocaleDateString() : '',
    publishedAt: published ? new Date(published).toISOString() : '',
    summary: stripHtml(html).slice(0, 280) || raw.summary || '',
    plain: stripHtml(html).slice(0, 2500),
    html: sanitizeHtml(html),
    logo: raw.logo || raw.companyLogo || raw.company?.logo || '',
    canonicalURL: canonical,
    source: 'api',
  }
}

function remember(jobs) {
  for (const job of jobs) jobIndex.set(job.slug, job)
}

async function fetchRss(feed) {
  const cached = cache.get(`rss:${feed}`)
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.jobs

  const res = await fetch(`${API_BASE}/rss/${feed}.xml`, {
    headers: {
      accept: 'application/rss+xml, application/xml, text/xml,*/*',
      'accept-language': 'en-US,en;q=0.9',
      'user-agent': browserHeaders()['user-agent'],
      ...(cjlCookie() ? { cookie: cjlCookie() } : {}),
    },
  })
  if (!res.ok) throw new Error(`RSS ${feed} returned ${res.status}`)
  const xml = await res.text()
  const parsed = parser.parse(xml)
  const items = parsed?.rss?.channel?.item || []
  const list = (Array.isArray(items) ? items : [items]).map(normalizeRssItem).filter((j) => j.title)
  const feedCategory = Object.entries(FEEDS).find(([, name]) => name === feed)?.[0]
  if (feedCategory && feedCategory !== 'all' && feedCategory !== 'remote') {
    for (const job of list) {
      if (!job.category) job.category = feedCategory
    }
  }
  cache.set(`rss:${feed}`, { at: Date.now(), jobs: list })
  remember(list)
  return list
}

function apiKey() {
  return process.env.CJL_API_KEY || process.env.VITE_CJL_API_KEY || ''
}

async function fetchJsonJobs(params) {
  const key = apiKey()
  if (!key) return null
  const url = new URL(`${API_BASE}/public/jobs`)
  if (params.query) url.searchParams.set('query', params.query)
  if (params.location) url.searchParams.set('location', params.location)
  if (params.remote) url.searchParams.set('remote', 'true')
  if (params.tags) url.searchParams.set('tags', params.tags)
  url.searchParams.set('limit', String(params.limit || 100))
  url.searchParams.set('page', String(params.page || 1))

  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'x-api-key': key,
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`JSON API ${res.status}: ${body.slice(0, 180)}`)
  }
  const data = await res.json()
  const jobs = (data.jobs || data.results || []).map(normalizeJsonJob)
  remember(jobs)
  return {
    jobs,
    meta: data.meta || { totalCount: jobs.length, page: 1, totalPages: 1 },
    source: 'api',
  }
}

async function fetchAllRss() {
  const cached = cache.get('rss:merged')
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.jobs

  const feeds = [...new Set(Object.values(FEEDS))]
  const results = await Promise.allSettled(feeds.map((feed) => fetchRss(feed)))
  const map = new Map()
  for (const result of results) {
    if (result.status !== 'fulfilled') {
      console.warn('[cjl] RSS feed failed:', result.reason?.message || result.reason)
      continue
    }
    for (const job of result.value) map.set(job.slug, job)
  }
  const jobs = [...map.values()]
  cache.set('rss:merged', { at: Date.now(), jobs })
  return jobs
}

export function companiesFrom(jobs) {
  const map = new Map()
  for (const job of jobs) {
    const current = map.get(job.companySlug) || {
      slug: job.companySlug,
      name: job.company,
      logo: job.logo,
      letter: job.company?.[0] || 'C',
      color: '#0084FF',
      location: job.remote ? 'Remote' : job.location,
      tags: [],
      tagline: job.summary,
      about: job.summary,
      open: 0,
    }
    current.open += 1
    if (!current.logo && job.logo) current.logo = job.logo
    if (job.location && !current.location) current.location = job.location
    map.set(job.companySlug, current)
  }
  return [...map.values()].sort((a, b) => b.open - a.open)
}

function pageSize(params = {}) {
  if (params.paginate === false) return 0
  const raw = Number(params.limit)
  return Math.min(50, Math.max(1, Number.isFinite(raw) && raw > 0 ? raw : JOBS_PAGE_SIZE))
}

function extraJobsFor(params = {}) {
  return filterAndSortJobs(listPublishedExtraJobs(), {
    ...params,
    topic: params.topic || params.tag || '',
  })
}

function prependExtras(jobs, extra) {
  if (!extra.length) return jobs
  const seen = new Set(extra.map((job) => job.slug))
  return [...extra, ...jobs.filter((job) => !seen.has(job.slug))]
}

function paginateJobs(jobs, params = {}, meta = {}) {
  const limit = pageSize(params)
  const totalCount = jobs.length
  if (!limit) {
    return {
      jobs,
      meta: {
        ...meta,
        totalCount,
        catalogSize: meta.catalogSize || totalCount,
        page: 1,
        totalPages: 1,
        limit: totalCount || JOBS_PAGE_SIZE,
      },
    }
  }
  const totalPages = Math.max(1, Math.ceil(totalCount / limit))
  const page = Math.min(totalPages, Math.max(1, Number(params.page || 1)))
  const start = (page - 1) * limit
  return {
    jobs: jobs.slice(start, start + limit),
    meta: {
      ...meta,
      totalCount,
      catalogSize: meta.catalogSize || totalCount,
      page,
      totalPages,
      limit,
    },
  }
}

function finalizeJobs(payload, params = {}) {
  const extra = extraJobsFor(params)
  const incoming = payload.jobs || []
  const limit = pageSize(params)

  // Local catalog already contains the full result set for this query.
  // Never use the "upstream already paginated" shortcut.
  if (payload.source === 'catalog' || payload.source === 'none') {
    const merged = prependExtras(incoming, extra)
    if (!limit) {
      return {
        ...payload,
        jobs: merged,
        companies: companiesFrom(merged),
        meta: {
          ...(payload.meta || {}),
          totalCount: merged.length,
          page: 1,
          totalPages: 1,
          limit: merged.length || JOBS_PAGE_SIZE,
        },
      }
    }
    const paged = paginateJobs(merged, params, payload.meta || {})
    return {
      ...payload,
      ...paged,
      companies: companiesFrom(merged),
    }
  }

  const upstreamCount = Number(payload.meta?.totalCount || 0)
  const upstreamPages = Number(payload.meta?.totalPages || 0)
  const upstreamPaged =
    Boolean(limit) &&
    incoming.length <= limit &&
    (upstreamCount > incoming.length || upstreamPages > 1)

  if (upstreamPaged) {
    const page = Math.max(1, Number(params.page || payload.meta?.page || 1))
    const jobs = (page <= 1 ? prependExtras(incoming, extra) : incoming).slice(0, limit)
    const totalCount = upstreamCount + extra.length
    return {
      ...payload,
      jobs,
      companies: companiesFrom(jobs),
      meta: {
        ...(payload.meta || {}),
        totalCount,
        page,
        totalPages: Math.max(1, Math.ceil(totalCount / limit)),
        limit,
      },
    }
  }

  const merged = prependExtras(incoming, extra)
  const paged = paginateJobs(merged, params, payload.meta || {})
  return {
    ...payload,
    ...paged,
    companies: companiesFrom(limit ? merged : paged.jobs),
  }
}

export async function listJobs(params = {}) {
  const catalog = readCatalog()
  const filtered = filterAndSortJobs(getCatalogJobs(), params)
  return finalizeJobs(
    {
      jobs: filtered,
      companies: companiesFrom(filtered),
      meta: {
        totalCount: filtered.length,
        catalogSize: catalog.jobs.length,
        scrapedAt: catalog.scrapedAt || '',
        scrapeStatus: catalog.status || 'empty',
      },
      source: catalog.jobs.length ? 'catalog' : 'none',
    },
    {
      ...params,
      // Full catalog is local — always paginate here, never treat as upstream-paged.
      paginate: params.paginate,
    },
  )
}

export async function getJob(slug) {
  const extra = getPublishedExtraBySlug(slug)
  if (extra) return extra
  return getCatalogJob(slug) || null
}

export async function listCompanies() {
  const jobs = getCatalogJobs()
  const catalog = readCatalog()
  const fromJobs = companiesFrom(jobs)
  const enriched = fromJobs.map((company) => ({
    ...(catalog.companies?.[company.slug] || {}),
    ...company,
    open: company.open,
  }))
  return { companies: enriched, totalJobs: jobs.length, source: 'catalog' }
}

function jobMatchesCompany(job, slug, name) {
  if (job.companySlug === slug) return true
  if (slugify(job.company) === slug) return true
  if (name && String(job.company).toLowerCase() === String(name).toLowerCase()) return true
  return false
}

export async function getCompany(slug) {
  const key = String(slug || '').trim()
  if (!key) return null

  const stored = getCatalogCompany(key)
  const extras = listPublishedExtraJobs().filter((job) => jobMatchesCompany(job, key, stored?.name))
  const catalogJobs = getCatalogJobs().filter((job) => jobMatchesCompany(job, key, stored?.name))

  const merged = []
  const seen = new Set()
  for (const job of [...extras, ...catalogJobs]) {
    if (!job.slug || seen.has(job.slug)) continue
    seen.add(job.slug)
    merged.push(job)
  }

  const fallback = companiesFrom(merged)[0]
  const company = stored || fallback
  if (!company) return null
  return {
    company: { ...company, open: merged.length, logo: company.logo || fallback?.logo || '' },
    jobs: merged,
    related: [],
    source: 'catalog',
  }
}

function readUrl(req) {
  return new URL(req.url, 'http://localhost')
}

function send(res, status, data) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=60')
  res.end(JSON.stringify(data))
}

export function createCjlMiddleware() {
  return async function cjlMiddleware(req, res, next) {
    if (req.method !== 'GET' || !req.url?.startsWith('/api/')) return next()
    try {
      const url = readUrl(req)
      const path = url.pathname

      if (path === '/api/jobs') {
        const payload = await listJobs({
          query: url.searchParams.get('query') || '',
          location: url.searchParams.get('location') || '',
          category: url.searchParams.get('category') || '',
          remote: url.searchParams.get('remote') === '1' || url.searchParams.get('remote') === 'true',
          page: Number(url.searchParams.get('page') || 1),
          limit: Number(url.searchParams.get('limit') || 100),
        })
        return send(res, 200, payload)
      }

      const jobMatch = path.match(/^\/api\/jobs\/([^/]+)$/)
      if (jobMatch) {
        const job = await getJob(decodeURIComponent(jobMatch[1]))
        if (!job) return send(res, 404, { message: 'Job not found' })
        return send(res, 200, { job })
      }

      if (path === '/api/companies') {
        return send(res, 200, await listCompanies())
      }

      const companyMatch = path.match(/^\/api\/companies\/([^/]+)$/)
      if (companyMatch) {
        const company = await getCompany(decodeURIComponent(companyMatch[1]))
        if (!company) return send(res, 404, { message: 'Company not found' })
        return send(res, 200, company)
      }

      return next()
    } catch (error) {
      console.error('[cjl]', error)
      return send(res, 502, { message: error.message || 'Upstream error' })
    }
  }
}

export function cjlApiPlugin() {
  return {
    name: 'cjl-api',
    configureServer(server) {
      server.middlewares.use(createCjlMiddleware())
    },
    configurePreviewServer(server) {
      server.middlewares.use(createCjlMiddleware())
    },
  }
}
