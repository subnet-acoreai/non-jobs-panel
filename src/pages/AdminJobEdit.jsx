import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import HtmlEditor from '../components/HtmlEditor'
import { useApp } from '../context/AppContext'
import { defaultQuestions } from '../../shared/applyQuestions.js'

const input =
  'w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand dark:border-night-line dark:bg-night-card'
const label = 'mb-1.5 block text-[13px] font-medium text-ink dark:text-white'

function toDateInput(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const empty = {
  title: '',
  company: '',
  description: '',
  location: '',
  remote: true,
  salaryMin: '',
  salaryMax: '',
  currency: 'USD',
  period: 'Year',
  hideSalary: false,
  type: 'Full Time',
  tags: '',
  calendlyUrl: '',
  email: '',
  status: 'published',
  publishedAt: toDateInput(new Date().toISOString()),
  applicants: '0',
  questions: defaultQuestions('this company'),
}

async function adminJson(url, options = {}) {
  const res = await fetch(url, { credentials: 'include', ...options })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(payload.message || 'Request failed')
  return payload
}

function toForm(job) {
  return {
    title: job.title || '',
    company: job.company || '',
    description: job.description || '',
    location: job.location || '',
    remote: Boolean(job.remote),
    salaryMin: job.salaryMin || '',
    salaryMax: job.salaryMax || '',
    currency: job.currency || 'USD',
    period: job.period || 'Year',
    hideSalary: Boolean(job.hideSalary),
    type: job.type || 'Full Time',
    tags: Array.isArray(job.tags) ? job.tags.join(', ') : '',
    calendlyUrl: job.calendlyUrl || '',
    email: job.email || '',
    status: job.status || 'draft',
    publishedAt: toDateInput(job.publishedAt || job.createdAt),
    applicants: job.applicants != null ? String(job.applicants) : '0',
    questions: questionsForForm(job),
  }
}

function questionsForForm(job) {
  if (!Array.isArray(job.questions)) return defaultQuestions(job.company)
  return job.questions.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 3)
}

export default function AdminJobEdit() {
  const { user } = useApp()
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = id === 'new'
  const [form, setForm] = useState(empty)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (user?.role !== 'admin' || isNew) return undefined
    adminJson(`/api/admin/jobs/${id}`)
      .then((payload) => setForm(toForm(payload.job)))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [user, id, isNew])

  if (user?.role !== 'admin') {
    return <Navigate to="/login" replace state={{ from: `/admin/jobs/${id}` }} />
  }

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
    setSaved(false)
  }

  async function onSubmit(event) {
    event.preventDefault()
    const descriptionText = String(form.description || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .trim()
    if (!descriptionText) {
      setError('Job description is required')
      return
    }
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const body = {
        ...form,
        remote: form.remote || /remote/i.test(form.location),
        applicants: Number(form.applicants || 0),
        publishedAt: form.publishedAt,
        questions: form.questions,
      }
      const payload = isNew
        ? await adminJson('/api/admin/jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await adminJson(`/api/admin/jobs/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
      if (isNew) navigate(`/admin/jobs/${payload.job.id}`, { replace: true })
      else setForm(toForm(payload.job))
      setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function copyJob() {
    setSaving(true)
    setError('')
    try {
      const payload = await adminJson('/api/admin/jobs/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromId: id }),
      })
      navigate(`/admin/jobs/${payload.job.id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="px-4 py-16 text-center text-sm text-gray-500">Loading job…</p>

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link to="/admin/jobs" className="text-sm text-gray-500 hover:text-brand">
        ← Additional jobs
      </Link>
      <h1 className="mt-3 text-[26px] font-extrabold tracking-tight sm:text-3xl">
        {isNew ? 'Add additional job' : 'Edit additional job'}
      </h1>
      <p className="mt-2 text-sm text-gray-500">
        Publish to show it at the top of the public jobs list. Drafts stay admin-only. Applicants see the Calendly link after they submit.
      </p>

      <form className="mt-6 space-y-5" onSubmit={onSubmit}>
        <label className="block">
          <span className={label}>Job title *</span>
          <input required className={input} value={form.title} onChange={(e) => set('title', e.target.value)} />
        </label>
        <label className="block">
          <span className={label}>Company *</span>
          <input required className={input} value={form.company} onChange={(e) => set('company', e.target.value)} />
        </label>
        <div>
          <span className={label}>Job description *</span>
          <HtmlEditor value={form.description} onChange={(html) => set('description', html)} />
          <span className="mt-1 block text-[12px] text-gray-400">
            Format as HTML: headings, lists, links, and pasted job posts keep their markup.
          </span>
        </div>
        <div>
          <span className={label}>Apply questions</span>
          <p className="mb-2 text-[12px] text-gray-400">
            Applicants see only these questions.
          </p>
          <div className="space-y-2">
            {form.questions.map((question, index) => (
              <div key={index} className="flex items-start gap-2">
                <textarea
                  className={`${input} min-h-[72px] resize-y`}
                  placeholder={`Question ${index + 1}`}
                  value={question}
                  onChange={(event) => {
                    const next = [...form.questions]
                    next[index] = event.target.value
                    set('questions', next)
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    set(
                      'questions',
                      form.questions.filter((_, item) => item !== index),
                    )
                  }}
                  className="mt-1 shrink-0 rounded-md px-2 py-1 text-sm text-gray-400 hover:text-red-500"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          {form.questions.length < 3 ? (
            <button
              type="button"
              onClick={() => set('questions', [...form.questions, ''])}
              className="mt-2 text-sm font-medium text-brand"
            >
              Add question
            </button>
          ) : null}
        </div>
        <label className="block">
          <span className={label}>Location</span>
          <input className={input} placeholder="Leave blank if remote" value={form.location} onChange={(e) => set('location', e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.remote} onChange={(e) => set('remote', e.target.checked)} />
          Remote
        </label>
        <div>
          <span className={label}>Salary</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input className={input} placeholder="Min" value={form.salaryMin} onChange={(e) => set('salaryMin', e.target.value)} />
            <input className={input} placeholder="Max" value={form.salaryMax} onChange={(e) => set('salaryMax', e.target.value)} />
            <select className={input} value={form.currency} onChange={(e) => set('currency', e.target.value)}>
              <option>USD</option>
              <option>EUR</option>
              <option>GBP</option>
            </select>
            <select className={input} value={form.period} onChange={(e) => set('period', e.target.value)}>
              <option>Year</option>
              <option>Month</option>
              <option>Hour</option>
            </select>
          </div>
          <label className="mt-2 flex items-center gap-2 text-[13px] text-gray-500">
            <input type="checkbox" checked={form.hideSalary} onChange={(e) => set('hideSalary', e.target.checked)} />
            Hide salary
          </label>
        </div>
        <label className="block">
          <span className={label}>Tags</span>
          <input className={input} placeholder="Solidity, DeFi, Remote" value={form.tags} onChange={(e) => set('tags', e.target.value)} />
        </label>
        <label className="block">
          <span className={label}>Calendly link</span>
          <input
            className={input}
            type="url"
            placeholder="https://calendly.com/your-name/intro"
            value={form.calendlyUrl}
            onChange={(e) => set('calendlyUrl', e.target.value)}
          />
          <span className="mt-1 block text-[12px] text-gray-400">Shown after an applicant submits this job.</span>
        </label>
        <label className="block">
          <span className={label}>Notification email</span>
          <input className={input} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={label}>Posted date</span>
            <input
              className={input}
              type="date"
              value={form.publishedAt}
              onChange={(e) => set('publishedAt', e.target.value)}
            />
            <span className="mt-1 block text-[12px] text-gray-400">Shown as Today, 2d, or 1w on the jobs list.</span>
          </label>
          <label className="block">
            <span className={label}>Applicants</span>
            <input
              className={input}
              type="number"
              min="0"
              step="1"
              value={form.applicants}
              onChange={(e) => set('applicants', e.target.value)}
            />
            <span className="mt-1 block text-[12px] text-gray-400">Display count only — it does not change when people apply.</span>
          </label>
        </div>
        <label className="block">
          <span className={label}>Status</span>
          <select className={input} value={form.status} onChange={(e) => set('status', e.target.value)}>
            <option value="published">Published — visible on the site</option>
            <option value="draft">Draft — admin only</option>
          </select>
        </label>

        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        {saved ? <p className="text-sm text-brand">Saved.</p> : null}

        <div className="flex flex-wrap gap-3">
          <button disabled={saving} className="min-h-11 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? 'Saving…' : isNew ? 'Create job' : 'Save job'}
          </button>
          {!isNew ? (
            <button type="button" disabled={saving} onClick={copyJob} className="min-h-11 rounded-full border border-gray-200 px-5 py-2.5 text-sm font-medium dark:border-night-line">
              Copy to edit
            </button>
          ) : null}
        </div>
      </form>
    </div>
  )
}
