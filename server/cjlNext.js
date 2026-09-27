import './env.js'
import { stripEmptyBlocks } from '../shared/cleanHtml.js'

const SITE = 'https://cryptojobslist.com'
const DEFAULT_BUILD = process.env.CJL_NEXT_BUILD_ID || '4UyKDg-aO127lMM1fuvxe'
const CACHE_MS = 3 * 60 * 1000
const CATALOG_CACHE_MS = 5 * 60 * 1000
const BROWSER_UA =
  process.env.CJL_USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36'
const SKIP_TAGS = new Set([
  'web3',
  'jobs',
  'pay-in-crypto',
  'pay-in-fiat',
  'pay-in-bitcoin',
  'pay-in-stablecoins',
])

const cache = new Map()
const jobIndex = new Map()
let buildId = DEFAULT_BUILD
let buildAt = 0
let catalogPromise = null
let cookieWarned = false

export function cjlCookie() {
  const full = String(process.env.CJL_COOKIE || '').trim()
  if (full) return full
  const clearance = String(process.env.CF_CLEARANCE || process.env.CJL_CF_CLEARANCE || '').trim()
  if (!clearance) return ''
  return clearance.includes('=') ? clearance : `cf_clearance=${clearance}`
}

export function browserHeaders(extra = {}) {
  const cookie = cjlCookie()
  if (!cookie && !cookieWarned) {
    cookieWarned = true
    console.warn(
      '[cjl] No CJL_COOKIE / CF_CLEARANCE in .env — Cloudflare will likely return 403. Paste cf_clearance from a browser session on cryptojobslist.com',
    )
  }
  return {
    accept: '*/*',
    'accept-language': 'en-US,en;q=0.9',
    'user-agent': BROWSER_UA,
    referer: `${SITE}/`,
    'sec-ch-ua': '"Google Chrome";v="153", "Not_A Brand";v="8", "Chromium";v="153"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'x-nextjs-data': '1',
    ...(cookie ? { cookie } : {}),
    ...extra,
  }
}

function prettyTag(slug) {
  const special = {
    'full-time': 'Full Time',
    'part-time': 'Part Time',
    'ui-ux': 'UI/UX',
    'c-plus-plus': 'C++',
    'lead-level': 'Lead Level',
    'entry-level': 'Entry Level',
    'human-resources': 'Human Resources',
    'smart-contract': 'Smart Contract',
    'product-manager': 'Product Manager',
    'project-manager': 'Project Manager',
    'data-analyst': 'Data Analyst',
    'customer-support': 'Customer Support',
  }
  if (special[slug]) return special[slug]
  return String(slug || '')
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatSalary(raw) {
  if (!raw || typeof raw !== 'object') return ''
    const unit =
    raw.unitText === 'HOUR' ? '/hour' : raw.unitText === 'MONTH' ? '/month' : raw.unitText === 'YEAR' ? '/year' : raw.unitText === 'WEEK' ? '/week' : ''
  const fmt = (n) => {
    const num = Number(n)
    if (!Number.isFinite(num)) return ''
    if (raw.unitText === 'HOUR' || raw.unitText === 'MONTH') return String(num)
    if (num >= 1000) return `${Math.round(num / 1000)}k`
    return String(num)
  }
  const min = fmt(raw.minValue)
  const max = fmt(raw.maxValue)
  if (min && max && min !== max) return `${min}-${max}${unit}`
  if (min) return `${min}${unit}`
  return ''
}

function salaryDisplay(job) {
  if (job.salaryString) return String(job.salaryString).replace(/^\$/, '')
  return formatSalary(job.salary)
}

function daysAgo(dateValue) {
  if (!dateValue) return null
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) return null
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 86400000))
}

function employmentType(tags = []) {
  if (tags.includes('part-time')) return 'Part Time'
  if (tags.includes('contract') || tags.includes('freelance')) return 'Contract'
  if (tags.includes('internship')) return 'Intern'
  return 'Full Time'
}

export function normalizeNextJob(raw, extras = {}) {
  const tags = (raw.tags || []).filter((tag) => !SKIP_TAGS.has(tag)).map(prettyTag)
  const salary = salaryDisplay(raw)
  const company = raw.companyName || raw.company?.name || 'Unknown'
  const slug = raw.seoSlug || extras.slug || ''
  const html = stripEmptyBlocks(extras.html || raw.jobDescription || '')
  const job = {
    id: raw.id || slug,
    slug,
    title: raw.jobTitle || raw.title || '',
    company,
    companySlug: raw.company?.[0]?.slug || raw.company?.slug || company.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    salary,
    salaryMin: Number(raw.salary?.minValue || raw.estimatedSalary?.value?.minValue || 0),
    location: raw.jobLocation || (raw.remote ? 'Remote' : ''),
    remote: Boolean(raw.remote) || /remote/i.test(raw.jobLocation || ''),
    tags: tags.slice(0, 8),
    tagSlugs: raw.tags || [],
    category: raw.category || '',
    postedDaysAgo: daysAgo(raw.publishedAt),
    postedAgo: raw.timeSinceJobCreation || '',
    featured: Boolean(raw.isFeatured),
    applicants: Number(raw.directApplicationsQty || 0),
    views: Number(raw.applicationLinkClicks || 0),
    type: employmentType(raw.tags || []),
    postedOn: raw.publishedAt ? new Date(raw.publishedAt).toLocaleDateString() : '',
    summary: '',
    html,
    logo: raw.companyLogo || raw.company?.logo || '',
    canonicalURL: slug ? `${SITE}/jobs/${slug}` : SITE,
    source: 'next',
    publishedAt: raw.publishedAt || '',
  }
  if (slug) jobIndex.set(slug, { ...jobIndex.get(slug), ...job })
  return job
}

async function parseMaybeJson(text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) throw new Error('Empty response')
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return JSON.parse(trimmed)
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence?.[1]) {
    const inner = fence[1].trim()
    if (inner.startsWith('{') || inner.startsWith('[')) return JSON.parse(inner)
  }
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1))
    } catch {
      // fall through
    }
  }
  throw new Error('Not JSON')
}

function unwrapPayload(payload) {
  if (payload?.props?.pageProps) return payload.props.pageProps
  if (payload?.pageProps) return payload.pageProps
  return payload
}

function extractNextData(html) {
  const idx = String(html || '').indexOf('__NEXT_DATA__')
  if (idx < 0) throw new Error('No NEXT_DATA')
  const start = html.indexOf('{', idx)
  const end = html.indexOf('</script>', start)
  if (start < 0 || end < 0) throw new Error('NEXT_DATA truncated')
  return JSON.parse(html.slice(start, end))
}

async function fetchDirect(url) {
  const res = await fetch(url, {
    headers: browserHeaders(),
    signal: AbortSignal.timeout(15000),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Next data ${res.status}`)
  if (text.trim().startsWith('<')) throw new Error('Next data HTML challenge')
  return JSON.parse(text)
}

async function fetchHtmlPage(url) {
  const res = await fetch(url, {
    headers: browserHeaders({
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'none',
      'sec-fetch-user': '?1',
    }),
    signal: AbortSignal.timeout(20000),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTML ${res.status}`)
  if (/just a moment|cf-browser-verification|challenge-platform/i.test(text) && !text.includes('__NEXT_DATA__')) {
    throw new Error('Cloudflare challenge — refresh CF_CLEARANCE cookie')
  }
  return text
}

async function fetchViaJina(url) {
  const res = await fetch(`https://r.jina.ai/${url}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`Jina ${res.status}`)
  const payload = await res.json()
  const content = payload?.data?.content || payload?.content || ''
  return parseMaybeJson(content)
}

async function fetchViaTranslate(url) {
  const target = `https://translate.google.com/translate?sl=auto&tl=en&u=${encodeURIComponent(url)}`
  const res = await fetch(target, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': BROWSER_UA,
      Referer: 'https://translate.google.com/',
    },
    signal: AbortSignal.timeout(25000),
  })
  if (!res.ok) throw new Error(`Translate ${res.status}`)
  return extractNextData(await res.text())
}

function isRetryable(error) {
  return /429|timeout|aborted|fetch failed|Translate 5|Jina 429|Next data 5|Proxy 5/i.test(error?.message || '')
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withRetry(fn, attempts = 4) {
  let last
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (error) {
      last = error
      if (!isRetryable(error) || i === attempts - 1) throw error
      const wait = /429/.test(error.message) ? 5000 * (i + 1) : 1500 * (i + 1)
      await sleep(wait)
    }
  }
  throw last
}

function pageUrl(params = {}) {
  const tag = String(params.tag || params.category || params.topic || '').replace(/^\//, '')
  const location = slugify(params.location)
  const hasTag = Boolean(tag && !['for-you', 'web3', 'all'].includes(tag))
  const remote = Boolean(params.remote) && !hasTag
  const search = new URLSearchParams()
  const page = Math.max(1, Number(params.page || 1))
  if (page > 1) search.set('page', String(page))
  if (hasTag || remote || location) {
    const tagPart = remote ? 'remote' : hasTag ? tag : 'all'
    const locPart = location || 'all'
    const qs = search.toString()
    return `${SITE}/tags/${encodeURIComponent(tagPart)}/${encodeURIComponent(locPart)}${qs ? `?${qs}` : ''}`
  }
  const qs = search.toString()
  return `${SITE}/${qs ? `?${qs}` : ''}`
}

async function fetchViaProxy(url) {
  const target = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
  const res = await fetch(target, {
    headers: { Accept: 'application/json,text/html', 'User-Agent': BROWSER_UA },
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`Proxy ${res.status}`)
  const text = await res.text()
  if (text.trim().startsWith('{') || text.trim().startsWith('[')) return parseMaybeJson(text)
  return extractNextData(text)
}

async function fetchNextPayload(params = {}) {
  const html = pageUrl(params)
  const cached = cache.get(html)
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.data
  const id = await resolveBuildId()
  const jsonUrl = `${SITE}/_next/data/${id}/${nextRoute({ ...params, query: '' })}`
  let data
  let lastError

  // With Cloudflare clearance, browser-like direct fetch is the reliable path.
  const attempts = cjlCookie()
    ? [() => fetchDirect(jsonUrl), () => fetchHtmlThenNext(html)]
    : [
        () => fetchDirect(jsonUrl),
        () => fetchViaJina(jsonUrl),
        () => fetchViaProxy(jsonUrl),
        () => fetchViaTranslate(html),
        () => fetchViaProxy(html),
        () => fetchHtmlThenNext(html),
      ]

  for (const attempt of attempts) {
    try {
      data = unwrapPayload(await withRetry(attempt, cjlCookie() ? 3 : 2))
      break
    } catch (error) {
      lastError = error
    }
  }
  if (!data) throw lastError || new Error('Next data unavailable')
  if (data?.notFound) throw new Error('Next page not found')
  if (data?.buildId) {
    buildId = data.buildId
    buildAt = Date.now()
  }
  cache.set(html, { at: Date.now(), data })
  return data
}

async function fetchHtmlThenNext(url) {
  const html = await fetchHtmlPage(url)
  const payload = extractNextData(html)
  if (payload?.buildId) {
    buildId = payload.buildId
    buildAt = Date.now()
  }
  return unwrapPayload(payload)
}

export async function resolveBuildId() {
  if (buildId && Date.now() - buildAt < 60 * 60 * 1000) return buildId
  try {
    const html = await fetchHtmlPage(SITE)
    const payload = extractNextData(html)
    if (payload?.buildId) {
      buildId = payload.buildId
      buildAt = Date.now()
      return buildId
    }
  } catch {
    try {
      const data = await fetchViaTranslate(SITE)
      if (data.buildId) {
        buildId = data.buildId
        buildAt = Date.now()
        return buildId
      }
    } catch {
      try {
        const html = await fetchViaJina(SITE)
        const blob = typeof html === 'string' ? html : JSON.stringify(html)
        const match = blob.match(/\/_next\/data\/([A-Za-z0-9_-]+)\//) || blob.match(/"buildId":"([^"]+)"/)
        if (match?.[1]) {
          buildId = match[1]
          buildAt = Date.now()
          return buildId
        }
      } catch {
        // keep previous
      }
    }
  }
  buildAt = Date.now()
  return buildId
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function nextRoute(params = {}) {
  const tag = String(params.tag || params.category || params.topic || '').replace(/^\//, '')
  const location = slugify(params.location)
  const hasTag = Boolean(tag && !['for-you', 'web3', 'all'].includes(tag))
  const remote = Boolean(params.remote) && !hasTag
  if (hasTag || remote || location) {
    const tagPart = remote ? 'remote' : hasTag ? tag : 'all'
    const locPart = location || 'all'
    const search = new URLSearchParams()
    search.set('page', String(Math.max(1, Number(params.page || 1))))
    search.set('tag', tagPart)
    search.set('location', locPart)
    if (params.query) search.set('q', params.query)
    return `tags/${encodeURIComponent(tagPart)}/${encodeURIComponent(locPart)}.json?${search.toString()}`
  }
  const search = new URLSearchParams()
  search.set('page', String(Math.max(1, Number(params.page || 1))))
  if (params.query) search.set('q', params.query)
  if (params.location) search.set('location', params.location)
  return `index.json?${search.toString()}`
}

function payloadFromProps(props, page) {
  const jobs = (props.jobs || []).map((job) => normalizeNextJob(job))
  const meta = props.meta || {}
  const first = props.firstJob?.job
  if (first?.seoSlug) {
    const detailed = normalizeNextJob(first, { html: first.jobDescription, slug: first.seoSlug })
    const idx = jobs.findIndex((job) => job.slug === detailed.slug)
    if (idx >= 0) jobs[idx] = { ...jobs[idx], ...detailed }
  }
  return {
    jobs,
    companies: jobs.reduce((list, job) => {
      if (!list.some((item) => item.slug === job.companySlug)) {
        list.push({
          slug: job.companySlug,
          name: job.company,
          logo: job.logo,
          letter: job.company?.[0] || 'C',
          color: '#0084FF',
          location: job.remote ? 'Remote' : job.location,
          open: 1,
        })
      } else {
        const found = list.find((item) => item.slug === job.companySlug)
        found.open += 1
      }
      return list
    }, []),
    meta: {
      totalCount: meta.totalCount || jobs.length,
      page: meta.page || page,
      totalPages: meta.totalPages || 1,
      limit: meta.limit || 8,
      updatedAt: meta.updatedAt,
      keyword: props.page?.keyword || 'Crypto',
    },
    source: 'next',
    blogPosts: props.blogPosts || [],
  }
}

export async function listNextJobs(params = {}) {
  const page = Math.max(1, Number(params.page || 1))
  const props = await fetchNextPayload({ ...params, query: '' })
  return payloadFromProps(props, page)
}

async function mapPool(items, size, fn, gap = 0) {
  const out = []
  for (let i = 0; i < items.length; i += size) {
    if (i && gap) await sleep(gap)
    const batch = items.slice(i, i + size)
    out.push(...(await Promise.all(batch.map(fn))))
  }
  return out
}

export async function listAllNextJobs(params = {}) {
  const key = `all:${params.tag || params.topic || ''}:${params.remote ? 1 : 0}:${params.location || ''}`
  const cached = cache.get(key)
  if (cached && Date.now() - cached.at < CATALOG_CACHE_MS) return cached.data
  if (catalogPromise && catalogPromise.key === key) return catalogPromise.run

  const run = (async () => {
    const first = await listNextJobs({ ...params, query: '', page: 1 })
    const totalPages = Math.min(24, Number(first.meta.totalPages || 1))
    const jobs = [...(first.jobs || [])]
    if (totalPages > 1) {
      const pages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2)
      const loadPage = async (page) => {
        try {
          return { page, ...(await withRetry(() => listNextJobs({ ...params, query: '', page }))) }
        } catch (error) {
          console.warn('[cjl] Next page', page, 'failed:', error.message)
          return { page, jobs: [] }
        }
      }
      const rest = await mapPool(pages, 2, loadPage, 900)
      const missing = rest.filter((payload) => !(payload.jobs || []).length).map((payload) => payload.page)
      const recovered = missing.length
        ? await mapPool(missing, 1, async (page) => {
            await sleep(2500)
            return loadPage(page)
          })
        : []
      for (const payload of [...rest, ...recovered]) {
        for (const job of payload.jobs || []) {
          if (!jobs.some((item) => item.slug === job.slug)) jobs.push(job)
        }
      }
    }
    const data = {
      ...first,
      jobs,
      meta: {
        ...first.meta,
        totalCount: jobs.length,
        page: 1,
        totalPages: 1,
        limit: jobs.length,
      },
    }
    cache.set(key, { at: Date.now(), data })
    return data
  })()

  catalogPromise = { key, run }
  try {
    return await run
  } finally {
    if (catalogPromise?.key === key) catalogPromise = null
  }
}

function locationLabel(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  return value.formatted || value.name || value.city || value.country || ''
}

function timeAgo(iso) {
  const at = new Date(iso || '').getTime()
  if (!Number.isFinite(at)) return ''
  const hours = Math.max(1, Math.round((Date.now() - at) / 3_600_000))
  if (hours < 24) return `Active ${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  return `Active ${days} day${days === 1 ? '' : 's'} ago`
}

export function normalizeNextCompany(raw, extras = {}) {
  const about = String(raw.about || '').trim()
  return {
    slug: raw.slug || extras.slug || '',
    name: raw.name || 'Unknown',
    logo: raw.logo || '',
    letter: (raw.name || 'C')[0],
    color: '#0084FF',
    location: locationLabel(raw.location) || extras.location || '',
    about,
    html: raw.markedAbout || (about ? `<p>${about}</p>` : ''),
    website: raw.url || '',
    twitter: raw.twitter || '',
    discord: raw.discord || '',
    github: raw.github || '',
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    culture: raw.culture || '',
    interviewProcess: raw.interviewProcess || '',
    currentTeam: raw.currentTeam || '',
    techStack: raw.techStack || '',
    funding: raw.funding || '',
    vacationPolicy: raw.vacationPolicy || '',
    founded: raw.foundedDate || '',
    lastActiveAt: raw.lastActiveAt || '',
    lastActive: timeAgo(raw.lastActiveAt),
    verified: Boolean(raw.verified),
    reviewCount: Number(extras.reviewCount || 0),
    open: Number(extras.open || 0),
    tagline: extras.tagline || about.slice(0, 180),
  }
}

export async function getNextCompany(slug) {
  const key = `company:${slug}`
  const cached = cache.get(key)
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.data

  const id = await resolveBuildId()
  const jsonUrl = `${SITE}/_next/data/${id}/companies/${encodeURIComponent(slug)}.json`
  const page = `${SITE}/companies/${encodeURIComponent(slug)}`
  let payload
  let lastError
  const attempts = cjlCookie()
    ? [() => fetchDirect(jsonUrl), () => fetchHtmlThenNext(page)]
    : [
        () => fetchDirect(jsonUrl),
        () => fetchViaJina(jsonUrl),
        () => fetchViaTranslate(page),
        () => fetchHtmlThenNext(page),
      ]
  for (const attempt of attempts) {
    try {
      payload = unwrapPayload(await withRetry(attempt, 2))
      break
    } catch (error) {
      lastError = error
    }
  }
  if (!payload?.company) {
    if (lastError) console.warn('[cjl] company fetch failed:', lastError.message)
    return null
  }

  const jobs = (payload.jobs || []).map((job) => normalizeNextJob(job))
  const company = normalizeNextCompany(payload.company, {
    slug,
    open: jobs.length,
    reviewCount: payload.reviewCount,
    location: locationLabel(payload.location),
    tagline: payload.companies?.find((item) => item.slug === slug)?.tagline || '',
  })
  const related = (payload.companies || [])
    .filter((item) => item.slug && item.slug !== slug)
    .slice(0, 6)
    .map((item) => ({
      slug: item.slug,
      name: item.name,
      logo: item.logo || '',
      tagline: item.tagline || '',
      tags: item.tags || [],
      open: item.activeJobs || 0,
      verified: Boolean(item.verified),
    }))
  const data = { company, jobs, related }
  cache.set(key, { at: Date.now(), data })
  return data
}

export async function getNextJob(slug) {
  if (jobIndex.has(slug) && jobIndex.get(slug).html) return jobIndex.get(slug)
  try {
    const id = await resolveBuildId()
    const url = `${SITE}/_next/data/${id}/jobs/${encodeURIComponent(slug)}.json`
    const page = `${SITE}/jobs/${encodeURIComponent(slug)}`
    let payload
    const attempts = cjlCookie()
      ? [() => fetchDirect(url), () => fetchHtmlThenNext(page)]
      : [() => fetchDirect(url), () => fetchViaJina(url), () => fetchViaTranslate(page), () => fetchHtmlThenNext(page)]
    for (const attempt of attempts) {
      try {
        payload = unwrapPayload(await withRetry(attempt, 2))
        break
      } catch {
        // try next
      }
    }
    const raw = payload?.firstJob?.job || payload?.job
    if (!raw) return jobIndex.get(slug) || null
    return normalizeNextJob(raw, { html: raw.jobDescription, slug: raw.seoSlug || slug })
  } catch {
    return jobIndex.get(slug) || null
  }
}
