import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'

function fileLink(appId, kind, file, label) {
  if (!file) return null
  return (
    <a
      href={`/api/applications/${appId}/files/${kind}`}
      target="_blank"
      rel="noreferrer"
      className="text-sm font-medium text-brand hover:underline"
    >
      {label}
    </a>
  )
}

function ClientMeta({ client }) {
  if (!client) {
    return (
      <div className="mt-3 text-xs text-gray-400">OS / IP not collected on this application.</div>
    )
  }
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
      {client.os ? <span>OS: {client.os}</span> : null}
      {client.ip ? <span>IP: {client.ip}</span> : null}
      {client.geo?.label ? <span>Location: {client.geo.label}</span> : null}
    </div>
  )
}

function WalletSnapshot({ wallets }) {
  if (!wallets) {
    return (
      <div className="mt-4">
        <p className="text-[13px] font-medium text-ink dark:text-white">Wallet extensions</p>
        <p className="mt-1 text-sm text-gray-400">Not collected on this application.</p>
      </div>
    )
  }

  const list = wallets.wallets || []
  const chains = (wallets.chains || []).filter((chain) => chain !== 'EVM')

  return (
    <div className="mt-4">
      <p className="text-[13px] font-medium text-ink dark:text-white">Wallet extensions</p>
      {list.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {list.map((wallet) => {
            const chainLabel = wallet.activeChain || (wallet.chains || []).filter((chain) => chain !== 'EVM').slice(0, 2).join(', ')
            return (
              <span
                key={wallet.rdns || wallet.name}
                className="rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-medium text-brand dark:bg-brand/20 dark:text-white"
              >
                {wallet.name}
                {chainLabel ? ` · ${chainLabel}` : ''}
              </span>
            )
          })}
        </div>
      ) : (
        <p className="mt-1 text-sm text-gray-400">No wallet extensions detected in the applicant’s browser.</p>
      )}
      {wallets.activeEvmChain ? (
        <p className="mt-2 text-xs text-gray-500">Active EVM network: {wallets.activeEvmChain}</p>
      ) : null}
      {chains.length ? <p className="mt-1 text-xs text-gray-500">Chains: {chains.join(' · ')}</p> : null}
    </div>
  )
}

function Answer({ question, answer }) {
  if (!String(answer || '').trim()) return null
  return (
    <div className="mt-4">
      <p className="text-[13px] font-medium text-ink dark:text-white">{question}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-600 dark:text-gray-300">{answer}</p>
    </div>
  )
}

export default function Applications() {
  const { user } = useApp()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (user?.role !== 'admin') return undefined
    fetch('/api/applications', { credentials: 'include' })
      .then(async (res) => {
        const payload = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(payload.message || 'Failed to load applications')
        setItems(payload.applications || [])
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [user])

  if (user?.role !== 'admin') {
    return <Navigate to="/login" replace state={{ from: '/applications' }} />
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-[26px] font-extrabold tracking-tight sm:text-3xl">Applications</h1>
      <p className="mt-2 text-sm text-gray-500">Admin inbox. Saved locally on the backend server.</p>
      <Link to="/admin/jobs" className="mt-3 inline-block text-sm font-medium text-brand">
        Manage additional jobs
      </Link>

      {loading ? <p className="mt-8 text-sm text-gray-500">Loading…</p> : null}
      {error ? <p className="mt-8 text-sm text-red-500">{error}</p> : null}

      {!loading && !error && items.length === 0 ? (
        <p className="mt-8 text-sm text-gray-500">No applications yet. Apply from a job listing to see them here.</p>
      ) : null}

      <div className="mt-6 space-y-4">
        {items.map((app) => (
          <article key={app.id} className="rounded-2xl border border-gray-200 p-5 dark:border-night-line">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">
                  {app.firstName} {app.lastName}
                </p>
                <p className="text-sm text-gray-500">
                  {app.jobTitle || 'Untitled role'}
                  {app.company ? ` · ${app.company}` : ''}
                </p>
              </div>
              <p className="text-xs text-gray-400">{new Date(app.createdAt).toLocaleString()}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              <span>{app.yearsExperience} yrs experience</span>
              {app.currentSalary ? <span>Salary: {app.currentSalary}</span> : null}
              {app.location ? <span>{app.location}</span> : null}
              {app.phone ? <span>{app.phone}</span> : null}
            </div>
            <ClientMeta client={app.client} />
            <WalletSnapshot wallets={app.wallets} />
            {(app.answers?.length
              ? app.answers
              : [
                  { question: `Why would you like to work at ${app.company || 'this company'}?`, answer: app.whyCompany },
                  { question: 'Why do you think you are a good fit for this role?', answer: app.whyFit },
                  { question: 'Additional question', answer: app.aiTools },
                ].filter((item) => item.answer)
            ).map((item) => (
              <Answer key={item.question} question={item.question} answer={item.answer} />
            ))}
            {app.coverLetter ? (
              <Answer question="Why are you a great fit for this job? (Cover Letter)" answer={app.coverLetter} />
            ) : null}
            {app.github || app.linkedin || app.telegram ? (
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {app.github ? (
                  <a href={app.github} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                    GitHub
                  </a>
                ) : null}
                {app.linkedin ? (
                  <a href={app.linkedin} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                    LinkedIn
                  </a>
                ) : null}
                {app.telegram ? <span className="text-gray-500">{app.telegram}</span> : null}
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-4">
              {fileLink(app.id, 'resume', app.files?.resume, 'Resume')}
              {fileLink(app.id, 'photo', app.files?.photo, 'Photo')}
              {fileLink(app.id, 'video', app.files?.video, 'Video')}
              {app.jobSlug ? (
                <Link to={`/jobs/${app.jobSlug}`} className="text-sm text-gray-500 hover:text-brand">
                  View job
                </Link>
              ) : null}
              {app.calendlyUrl ? (
                <a href={app.calendlyUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand hover:underline">
                  Calendly
                </a>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
