import fs from 'node:fs'
import path from 'node:path'

const FILE = path.join(process.cwd(), 'data', 'cjl-catalog.json')

let memory = null
let memoryMtime = 0

function emptyCatalog() {
  return {
    scrapedAt: '',
    status: 'empty',
    error: '',
    jobs: [],
    companies: {},
    meta: { totalCount: 0 },
  }
}

function fileMtimeMs() {
  try {
    return fs.statSync(FILE).mtimeMs
  } catch {
    return 0
  }
}

export function catalogPath() {
  return FILE
}

export function invalidateCatalogCache() {
  memory = null
  memoryMtime = 0
}

export function readCatalog() {
  const mtime = fileMtimeMs()
  if (memory && mtime && mtime === memoryMtime) return memory

  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'))
    memory = {
      scrapedAt: raw.scrapedAt || '',
      status: raw.status || 'ready',
      error: raw.error || '',
      jobs: Array.isArray(raw.jobs) ? raw.jobs : [],
      companies: raw.companies && typeof raw.companies === 'object' ? raw.companies : {},
      meta: raw.meta || { totalCount: Array.isArray(raw.jobs) ? raw.jobs.length : 0 },
    }
    memoryMtime = mtime
    return memory
  } catch (error) {
    if (!memory) {
      console.warn('[cjl] catalog read failed:', FILE, error.message)
    }
    memory = emptyCatalog()
    memoryMtime = mtime
    return memory
  }
}

export function writeCatalog(next) {
  const catalog = {
    scrapedAt: next.scrapedAt || new Date().toISOString(),
    status: next.status || 'ready',
    error: next.error || '',
    jobs: Array.isArray(next.jobs) ? next.jobs : [],
    companies: next.companies && typeof next.companies === 'object' ? next.companies : {},
    meta: {
      ...(next.meta || {}),
      totalCount: Array.isArray(next.jobs) ? next.jobs.length : 0,
    },
  }
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify(catalog))
  memory = catalog
  memoryMtime = fileMtimeMs()
  return catalog
}

export function catalogStatus() {
  const catalog = readCatalog()
  return {
    status: catalog.status,
    scrapedAt: catalog.scrapedAt,
    jobCount: catalog.jobs.length,
    companyCount: Object.keys(catalog.companies || {}).length,
    error: catalog.error || '',
    withHtml: catalog.jobs.filter((job) => job.html).length,
  }
}

export function getCatalogJobs() {
  return readCatalog().jobs
}

export function getCatalogJob(slug) {
  return readCatalog().jobs.find((job) => job.slug === slug) || null
}

export function getCatalogCompany(slug) {
  return readCatalog().companies?.[slug] || null
}

export function upsertCatalogJobs(incoming, { scrapedAt, status = 'ready', error = '' } = {}) {
  const catalog = readCatalog()
  const map = new Map(catalog.jobs.map((job) => [job.slug, job]))
  for (const job of incoming || []) {
    if (!job?.slug) continue
    const prev = map.get(job.slug)
    map.set(job.slug, {
      ...prev,
      ...job,
      html: job.html || prev?.html || '',
      plain: job.plain || prev?.plain || '',
      summary: job.summary || prev?.summary || '',
    })
  }
  const jobs = [...map.values()]
  return writeCatalog({
    ...catalog,
    scrapedAt: scrapedAt || catalog.scrapedAt || new Date().toISOString(),
    status,
    error,
    jobs,
    meta: { ...(catalog.meta || {}), totalCount: jobs.length, source: 'scrape' },
  })
}

export function upsertCatalogCompanies(entries) {
  const catalog = readCatalog()
  const companies = { ...(catalog.companies || {}) }
  for (const company of entries || []) {
    if (!company?.slug) continue
    companies[company.slug] = { ...(companies[company.slug] || {}), ...company }
  }
  return writeCatalog({ ...catalog, companies })
}

export function setCatalogStatus(status, error = '') {
  const catalog = readCatalog()
  return writeCatalog({ ...catalog, status, error })
}
