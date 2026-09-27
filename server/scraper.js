import {
  catalogStatus,
  getCatalogJobs,
  setCatalogStatus,
  upsertCatalogCompanies,
  upsertCatalogJobs,
} from './catalogStore.js'
import { cjlCookie, getNextCompany, getNextJob, listAllNextJobs } from './cjlNext.js'

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000
const DETAIL_BATCH = 20
const DETAIL_GAP_MS = 700
const COMPANY_BATCH = 10
const COMPANY_GAP_MS = 900

let timer = null
let running = false
let lastRun = null

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function scrapeIntervalMs() {
  const raw = Number(process.env.CJL_SCRAPE_INTERVAL_MS || DEFAULT_INTERVAL_MS)
  return Number.isFinite(raw) && raw >= 60_000 ? raw : DEFAULT_INTERVAL_MS
}

function companiesFromJobs(jobs) {
  const map = new Map()
  for (const job of jobs) {
    if (!job.companySlug) continue
    const current = map.get(job.companySlug)
    if (!current) {
      map.set(job.companySlug, {
        slug: job.companySlug,
        name: job.company,
        logo: job.logo || '',
        letter: job.company?.[0] || 'C',
        color: '#0084FF',
        location: job.remote ? 'Remote' : job.location || '',
        open: 1,
        tagline: job.summary || '',
      })
    } else {
      current.open += 1
      if (!current.logo && job.logo) current.logo = job.logo
    }
  }
  return [...map.values()]
}

async function scrapeListings() {
  const payload = await listAllNextJobs({})
  const jobs = payload.jobs || []
  if (!jobs.length) throw new Error('Scrape returned 0 jobs')
  const catalog = upsertCatalogJobs(jobs, {
    scrapedAt: new Date().toISOString(),
    status: 'ready',
    error: '',
  })
  upsertCatalogCompanies(companiesFromJobs(catalog.jobs))
  return catalog
}

async function enrichJobDetails() {
  const jobs = getCatalogJobs().filter((job) => job.slug && !job.html)
  if (!jobs.length) return 0
  const batch = jobs.slice(0, DETAIL_BATCH)
  let filled = 0
  const updates = []
  for (const job of batch) {
    try {
      const detailed = await getNextJob(job.slug)
      if (detailed?.html || detailed?.title) {
        updates.push(detailed)
        filled += 1
      }
    } catch (error) {
      console.warn('[scraper] detail failed', job.slug, error.message)
    }
    await sleep(DETAIL_GAP_MS)
  }
  if (updates.length) upsertCatalogJobs(updates)
  return filled
}

async function enrichCompanies() {
  const { readCatalog } = await import('./catalogStore.js')
  const catalog = readCatalog()
  const have = catalog.companies || {}
  const slugs = [
    ...new Set(
      catalog.jobs
        .map((job) => job.companySlug)
        .filter((slug) => slug && (!have[slug] || !have[slug].about)),
    ),
  ].slice(0, COMPANY_BATCH)

  let filled = 0
  for (const slug of slugs) {
    try {
      const payload = await getNextCompany(slug)
      if (payload?.company) {
        upsertCatalogCompanies([payload.company])
        if (payload.jobs?.length) upsertCatalogJobs(payload.jobs)
        filled += 1
      }
    } catch (error) {
      console.warn('[scraper] company failed', slug, error.message)
    }
    await sleep(COMPANY_GAP_MS)
  }
  return filled
}

export function getScraperState() {
  return {
    running,
    lastRun,
    intervalMs: scrapeIntervalMs(),
    hasCookie: Boolean(cjlCookie()),
    catalog: catalogStatus(),
  }
}

export async function runScrapeCycle(reason = 'manual') {
  if (running) {
    console.log('[scraper] skip — already running (', reason, ')')
    return getScraperState()
  }
  running = true
  setCatalogStatus('scraping')
  const started = Date.now()
  console.log('[scraper] start', reason, cjlCookie() ? '(cookie ok)' : '(no cookie)')
  try {
    const catalog = await scrapeListings()
    console.log('[scraper] listings', catalog.jobs.length)
    const details = await enrichJobDetails()
    if (details) console.log('[scraper] enriched job details', details)
    const companies = await enrichCompanies()
    if (companies) console.log('[scraper] enriched companies', companies)
    setCatalogStatus('ready')
    lastRun = {
      at: new Date().toISOString(),
      ok: true,
      jobs: catalog.jobs.length,
      ms: Date.now() - started,
      reason,
    }
    console.log('[scraper] done', lastRun)
  } catch (error) {
    setCatalogStatus('error', error.message)
    lastRun = {
      at: new Date().toISOString(),
      ok: false,
      error: error.message,
      ms: Date.now() - started,
      reason,
    }
    console.warn('[scraper] failed:', error.message)
  } finally {
    running = false
  }
  return getScraperState()
}

export function startScraper() {
  if (timer) return
  const interval = scrapeIntervalMs()
  const boot = () => {
    runScrapeCycle('boot').catch(() => {})
  }
  // slight delay so listen log prints first
  setTimeout(boot, 1500)
  timer = setInterval(() => {
    runScrapeCycle('interval').catch(() => {})
  }, interval)
  console.log(`[scraper] scheduled every ${Math.round(interval / 60000)}m`)
}

export function stopScraper() {
  if (timer) clearInterval(timer)
  timer = null
}
