import cors from 'cors'
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { applicationsRouter } from './applications.js'
import {
  clearSession,
  createSession,
  getSession,
  loginUser,
  requireAdmin,
  requireUser,
  signupUser,
} from './auth.js'
import { getCompany, getJob, listCompanies, listJobs } from './cjlApi.js'
import { extraJobsRouter } from './extraJobs.js'
import { telegramConfigured } from './telegram.js'
import { visitsRouter } from './visits.js'
import { getScraperState, runScrapeCycle, startScraper } from './scraper.js'
import { catalogStatus } from './catalogStore.js'
import { cjlCookie } from './cjlNext.js'
import { events, layoffs, posts, researchReports, talent, talentMeta } from './cjlPublic.js'
import { estimateSalary, getHiringTrends, getSalaryReport } from './insights.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 3001)
const app = express()
app.set('trust proxy', 1)

app.use(
  cors({
    origin: ['http://127.0.0.1:5173', 'http://localhost:5173'],
    credentials: true,
  }),
)
app.use(express.json({ limit: '2mb' }))

app.post('/api/auth/signup', async (req, res) => {
  try {
    const user = await signupUser(req.body || {})
    res.json(createSession(res, user))
  } catch (error) {
    res.status(400).json({ message: error.message || 'Could not create account' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  const user = await loginUser(req.body?.email, req.body?.password)
  if (!user) return res.status(401).json({ message: 'Invalid email or password' })
  res.json(createSession(res, user))
})

app.post('/api/auth/logout', (req, res) => {
  clearSession(req, res)
  res.json({ ok: true })
})

app.get('/api/auth/me', (req, res) => {
  const session = getSession(req)
  if (!session) return res.status(401).json({ user: null })
  res.json({ user: { name: session.name, email: session.email, role: session.role } })
})

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

const IMAGE_HOSTS = [
  'cryptojobslist.com',
  'ashbyhq.com',
  'googleapis.com',
  'googleusercontent.com',
]

function allowedImageHost(hostname) {
  return IMAGE_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`))
}

app.get('/api/img', async (req, res) => {
  let target
  try {
    target = new URL(String(req.query.u || ''))
  } catch {
    return res.status(400).json({ message: 'Invalid image URL' })
  }
  if (target.protocol !== 'https:' || !allowedImageHost(target.hostname)) {
    return res.status(400).json({ message: 'Image host not allowed' })
  }
  try {
    let upstream = await fetch(target.toString())
    if (!upstream.ok) {
      upstream = await fetch(`https://images.weserv.nl/?url=${encodeURIComponent(target.toString())}&w=80&h=80&fit=contain`)
    }
    if (!upstream.ok) return res.status(502).json({ message: 'Image unavailable' })
    const type = upstream.headers.get('content-type') || 'image/png'
    if (!type.startsWith('image/')) return res.status(502).json({ message: 'Not an image' })
    res.setHeader('Content-Type', type)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.end(Buffer.from(await upstream.arrayBuffer()))
  } catch (error) {
    res.status(502).json({ message: error.message || 'Image proxy failed' })
  }
})

app.get('/api/jobs', async (req, res) => {
  try {
    const payload = await listJobs({
      query: req.query.query || req.query.q || '',
      location: req.query.location || '',
      category: req.query.category || '',
      topic: req.query.topic || req.query.tags || '',
      tag: req.query.tag || req.query.topic || req.query.category || '',
      remote: req.query.remote === '1' || req.query.remote === 'true',
      sort: req.query.sort || 'recent',
      page: Number(req.query.page || 1),
      limit: Number(req.query.limit || 8),
    })
    res.json(payload)
  } catch (error) {
    res.status(502).json({ message: error.message || 'Upstream error' })
  }
})

app.get('/api/jobs/:slug', async (req, res) => {
  try {
    const job = await getJob(req.params.slug)
    if (!job) return res.status(404).json({ message: 'Job not found' })
    res.json({ job })
  } catch (error) {
    res.status(502).json({ message: error.message || 'Upstream error' })
  }
})

app.get('/api/companies', async (_req, res) => {
  try {
    res.json(await listCompanies())
  } catch (error) {
    res.status(502).json({ message: error.message || 'Upstream error' })
  }
})

app.get('/api/companies/:slug', async (req, res) => {
  try {
    const payload = await getCompany(req.params.slug)
    if (!payload) return res.status(404).json({ message: 'Company not found' })
    res.json(payload)
  } catch (error) {
    res.status(502).json({ message: error.message || 'Upstream error' })
  }
})

app.use('/api/visits', visitsRouter)
app.use('/api/applications', applicationsRouter)
app.use('/api/admin/jobs', extraJobsRouter)

app.get('/api/scrape/status', (_req, res) => {
  res.json(getScraperState())
})

app.post('/api/admin/scrape', requireAdmin, async (_req, res) => {
  try {
    const state = await runScrapeCycle('admin')
    res.json(state)
  } catch (error) {
    res.status(500).json({ message: error.message || 'Scrape failed' })
  }
})

const LISTINGS_FILE = path.join(process.cwd(), 'data', 'listings.json')

function readListings() {
  try {
    const parsed = JSON.parse(fs.readFileSync(LISTINGS_FILE, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

app.post('/api/listings', requireUser, (req, res) => {
  const body = req.body || {}
  const listing = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    status: 'pending_payment',
    userEmail: req.user.email,
    job: body.job || {},
    payment: {
      chain: body.chain || '',
      amountUsd: Number(body.amountUsd || 199),
      txNote: body.txNote || '',
    },
  }
  const listings = readListings()
  listings.push(listing)
  fs.mkdirSync(path.dirname(LISTINGS_FILE), { recursive: true })
  fs.writeFileSync(LISTINGS_FILE, JSON.stringify(listings, null, 2))
  res.json({ listing })
})

app.post('/api/listings/:id/paid', requireUser, (req, res) => {
  const listings = readListings()
  const listing = listings.find((item) => item.id === req.params.id && item.userEmail === req.user.email)
  if (!listing) return res.status(404).json({ message: 'Listing not found' })
  listing.status = 'paid_pending_review'
  listing.paidAt = new Date().toISOString()
  listing.payment = { ...listing.payment, chain: req.body?.chain || listing.payment?.chain }
  fs.writeFileSync(LISTINGS_FILE, JSON.stringify(listings, null, 2))
  res.json({ listing })
})

app.get('/api/salaries', async (_req, res) => {
  try {
    res.json(await getSalaryReport())
  } catch (error) {
    res.status(502).json({ message: error.message || 'Upstream error' })
  }
})

app.post('/api/salaries/estimate', (req, res) => {
  res.json({ estimate: estimateSalary(req.body || {}) })
})

app.get('/api/insights', async (_req, res) => {
  try {
    res.json(await getHiringTrends())
  } catch (error) {
    res.status(502).json({ message: error.message || 'Upstream error' })
  }
})

app.get('/api/talent', (req, res) => {
  const query = String(req.query.query || req.query.q || '').trim().toLowerCase()
  const remote = req.query.remote === '1' || req.query.remote === 'true'
  let list = talent
  if (remote) list = list.filter((person) => person.remote)
  if (query) {
    list = list.filter((person) =>
      `${person.role} ${person.location} ${(person.skills || []).join(' ')} ${(person.languages || []).join(' ')}`.toLowerCase().includes(query),
    )
  }
  res.json({ meta: talentMeta, talent: list })
})

app.get('/api/layoffs', (req, res) => {
  const year = Number(req.query.year || 2026)
  const reason = String(req.query.reason || '')
  let list = layoffs.filter((row) => new Date(row.date).getFullYear() === year)
  if (reason && reason !== 'All reasons') list = list.filter((row) => row.reason === reason)
  const jobsCut = list.reduce((sum, row) => sum + (row.jobs || 0), 0)
  const biggest = [...list].sort((a, b) => (b.jobs || 0) - (a.jobs || 0))[0]
  const reasons = {}
  for (const row of list) reasons[row.reason] = (reasons[row.reason] || 0) + 1
  const primary = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'
  res.json({
    year,
    source: 'https://cryptojobslist.com/crypto-layoffs',
    summary: {
      jobsCut,
      companies: new Set(list.map((row) => row.company)).size,
      biggest: biggest ? { company: biggest.company, jobs: biggest.jobs, date: biggest.date } : null,
      primaryReason: primary,
    },
    layoffs: list,
  })
})

app.get('/api/events', (_req, res) => {
  res.json({ source: 'https://cryptojobslist.com/crypto-events', events })
})

app.get('/api/research', async (_req, res) => {
  try {
    const trends = await getHiringTrends()
    res.json({ source: 'https://cryptojobslist.com/research', reports: researchReports, trends })
  } catch (error) {
    res.status(502).json({ message: error.message || 'Upstream error' })
  }
})

app.get('/api/blog', (_req, res) => {
  res.json({
    source: 'https://cryptojobslist.com/blog',
    posts: posts.map((post) => ({ ...post, url: `https://cryptojobslist.com/blog/${post.slug}` })),
  })
})

app.use((error, _req, res, _next) => {
  const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400
  res.status(status).json({ message: error.message || 'Request failed' })
})

if (1) {
  const dist = path.join(__dirname, '..', 'dist')
  app.use(express.static(dist))
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(dist, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`[server] listening on http://127.0.0.1:${PORT}`)
  if (telegramConfigured()) console.log('[telegram] visit alerts enabled')
  else console.log('[telegram] visit alerts off — set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env')
  const status = catalogStatus()
  console.log(
    `[cjl] catalog ${status.status || 'empty'} — ${status.jobCount} jobs` +
      (status.scrapedAt ? ` (scraped ${status.scrapedAt})` : ''),
  )
  if (cjlCookie()) console.log('[cjl] Cloudflare cookie loaded')
  else console.log('[cjl] set CF_CLEARANCE or CJL_COOKIE in .env so the scraper can run')
  startScraper()
})
