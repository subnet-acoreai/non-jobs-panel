import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { requireAdmin } from './auth.js'
import { getExtraCalendly, getPublishedExtraBySlug } from './extraJobs.js'
import { createApplication, getApplication, listApplications } from './store.js'
import { sanitizeClientMeta } from '../shared/clientMeta.js'
import { sanitizeWalletSnapshot } from '../shared/wallets.js'
import { lookupIp } from './geoip.js'
import { parseAnswers } from '../shared/applyQuestions.js'

const uploadDir = path.join(process.cwd(), 'data', 'uploads')
fs.mkdirSync(uploadDir, { recursive: true })

function extFor(file) {
  const fromName = path.extname(file.originalname || '')
  if (fromName) return fromName.toLowerCase()
  if (file.mimetype?.includes('pdf')) return '.pdf'
  if (file.mimetype?.includes('png')) return '.png'
  if (file.mimetype?.includes('jpeg')) return '.jpg'
  if (file.mimetype?.includes('webm')) return '.webm'
  if (file.mimetype?.includes('mp4')) return '.mp4'
  if (file.mimetype?.includes('word')) return '.docx'
  return ''
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    cb(null, `${stamp}-${file.fieldname}${extFor(file)}`)
  },
})

function allowFile(file) {
  if (file.fieldname === 'resume') {
    return /pdf|msword|officedocument/.test(file.mimetype) || /\.(pdf|doc|docx)$/i.test(file.originalname)
  }
  if (file.fieldname === 'photo') return file.mimetype.startsWith('image/')
  if (file.fieldname === 'video') return file.mimetype.startsWith('video/')
  return false
}

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (allowFile(file)) cb(null, true)
    else cb(new Error(`Unsupported ${file.fieldname} file type`))
  },
})

function fileMeta(file) {
  return {
    filename: file.filename,
    originalName: file.originalname,
    mime: file.mimetype,
    size: file.size,
    url: '',
  }
}

function withFileUrls(application) {
  const files = {}
  for (const [kind, file] of Object.entries(application.files || {})) {
    files[kind] = { ...file, url: `/api/applications/${application.id}/files/${kind}` }
  }
  return { ...application, files }
}

export const applicationsRouter = Router()

applicationsRouter.get('/', requireAdmin, async (_req, res) => {
  const applications = (await listApplications()).map(withFileUrls)
  res.json({ applications })
})

applicationsRouter.get('/:id/files/:kind', requireAdmin, async (req, res) => {
  const application = await getApplication(req.params.id)
  const file = application?.files?.[req.params.kind]
  if (!file) return res.status(404).json({ message: 'File not found' })
  const absolute = path.join(uploadDir, file.filename)
  if (!fs.existsSync(absolute)) return res.status(404).json({ message: 'File not found' })
  res.setHeader('Content-Type', file.mime || 'application/octet-stream')
  res.setHeader('Content-Disposition', `inline; filename="${file.originalName || file.filename}"`)
  res.sendFile(absolute)
})

applicationsRouter.get('/:id', requireAdmin, async (req, res) => {
  const application = await getApplication(req.params.id)
  if (!application) return res.status(404).json({ message: 'Application not found' })
  res.json({ application: withFileUrls(application) })
})

applicationsRouter.post(
  '/',
  upload.fields([
    { name: 'resume', maxCount: 1 },
    { name: 'photo', maxCount: 1 },
    { name: 'video', maxCount: 1 },
  ]),
  async (req, res, next) => {
    const body = req.body || {}
    const required = ['firstName', 'lastName', 'yearsExperience', 'currentSalary']
    const missing = required.filter((key) => !String(body[key] || '').trim())
    const answers = parseAnswers(body)
    if (missing.length) {
      return res.status(400).json({ message: `Missing required fields: ${missing.join(', ')}` })
    }
    const extraJob = getPublishedExtraBySlug(String(body.jobSlug || '').trim())
    const expected = Array.isArray(extraJob?.questions) ? extraJob.questions.filter(Boolean) : null
    if ((expected ? expected.length : 1) > answers.length) {
      return res.status(400).json({ message: 'Answer the screening questions' })
    }
    if (!req.files?.resume?.[0]) {
      return res.status(400).json({ message: 'Resume is required' })
    }

    const files = {}
    for (const key of ['resume', 'photo', 'video']) {
      const file = req.files?.[key]?.[0]
      if (file) files[key] = fileMeta(file)
    }

    try {
      const calendlyUrl = getExtraCalendly(String(body.jobSlug || '').trim())
      const client = sanitizeClientMeta(body.client, req)
      const application = await createApplication({
        jobSlug: String(body.jobSlug || '').trim(),
        jobTitle: String(body.jobTitle || '').trim(),
        company: String(body.company || '').trim(),
        firstName: String(body.firstName).trim(),
        lastName: String(body.lastName).trim(),
        yearsExperience: Number(body.yearsExperience),
        answers,
        whyCompany: answers[0]?.answer || '',
        whyFit: answers[1]?.answer || '',
        aiTools: answers[2]?.answer || '',
        coverLetter: String(body.coverLetter).trim(),
        github: String(body.github || '').trim(),
        linkedin: String(body.linkedin || '').trim(),
        telegram: String(body.telegram || '').trim(),
        currentSalary: String(body.currentSalary).trim(),
        phone: String(body.phone || '').trim(),
        location: String(body.location || '').trim(),
        wallets: sanitizeWalletSnapshot(body.wallets),
        client: {
          ...client,
          geo: await lookupIp(client.ip),
        },
        calendlyUrl,
        files,
      })
      res.status(201).json({ application, calendlyUrl })
    } catch (error) {
      next(error)
    }
  },
)
