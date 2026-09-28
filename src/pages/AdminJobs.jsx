import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'

async function adminJson(url, options = {}) {
  const res = await fetch(url, { credentials: 'include', ...options })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(payload.message || 'Request failed')
  return payload
}

export default function AdminJobs() {
  const { user } = useApp()
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')

  useEffect(() => {
    if (user?.role !== 'admin') return undefined
    adminJson('/api/admin/jobs')
      .then((payload) => setJobs(payload.jobs || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [user])

  if (user?.role !== 'admin') {
    return <Navigate to="/login" replace state={{ from: '/admin/jobs' }} />
  }

  async function copyJob(id) {
    setBusyId(id)
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
      setBusyId('')
    }
  }

  async function removeJob(id) {
    if (!window.confirm('Delete this additional job?')) return
    setBusyId(id)
    setError('')
    try {
      await adminJson(`/api/admin/jobs/${id}`, { method: 'DELETE' })
      setJobs((current) => current.filter((job) => job.id !== id))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId('')
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight sm:text-3xl">Additional jobs</h1>
          <p className="mt-2 text-sm text-gray-500">
            Published roles appear at the top of the public jobs list. Drafts are hidden until you publish them.
          </p>
        </div>
        <Link
          to="/admin/jobs/new"
          className="inline-flex min-h-11 items-center rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
        >
          Add job
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        <Link to="/applications" className="font-medium text-brand">
          Applications inbox
        </Link>
      </div>

      {loading ? <p className="mt-8 text-sm text-gray-500">Loading…</p> : null}
      {error ? <p className="mt-8 text-sm text-red-500">{error}</p> : null}

      {!loading && jobs.length === 0 ? (
        <p className="mt-8 text-sm text-gray-500">No additional jobs yet. Add one, or copy a live listing from a job page.</p>
      ) : null}

      <div className="mt-6 space-y-3">
        {jobs.map((job) => (
          <article key={job.id} className="rounded-2xl border border-gray-200 p-4 dark:border-night-line">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{job.title}</p>
                <p className="text-sm text-gray-500">
                  {job.company}
                  {job.location ? ` · ${job.location}` : ''}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  Posted {job.publishedAt ? new Date(job.publishedAt).toLocaleDateString() : '—'}
                  {' · '}
                  {Number(job.applicants || 0) === 1 ? '1 applicant' : `${Number(job.applicants || 0).toLocaleString()} applicants`}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  job.status === 'published' ? 'bg-brand-soft text-brand' : 'bg-gray-100 text-gray-500 dark:bg-white/10'
                }`}
              >
                {job.status === 'published' ? 'Published' : 'Draft'}
              </span>
            </div>
            <p className="mt-2 break-all text-xs text-gray-400">
              {job.calendlyUrl ? `Calendly: ${job.calendlyUrl}` : 'No Calendly link'}
              {' · '}
              {Array.isArray(job.questions)
                ? job.questions.length
                  ? `${job.questions.length} apply question${job.questions.length === 1 ? '' : 's'}`
                  : 'No apply questions'
                : 'Default apply questions'}
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <Link to={`/admin/jobs/${job.id}`} className="font-medium text-brand">
                Edit
              </Link>
              {job.status === 'published' ? (
                <Link to={`/jobs/${job.slug}`} className="text-gray-500 hover:text-brand">
                  View live
                </Link>
              ) : null}
              <button
                type="button"
                disabled={busyId === job.id}
                onClick={() => copyJob(job.id)}
                className="text-gray-500 hover:text-brand disabled:opacity-50"
              >
                Copy to edit
              </button>
              <button
                type="button"
                disabled={busyId === job.id}
                onClick={() => removeJob(job.id)}
                className="text-red-500 hover:text-red-600 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
