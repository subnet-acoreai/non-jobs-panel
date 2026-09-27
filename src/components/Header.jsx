import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Logo } from './Brand'
import { useApp } from '../context/AppContext'

const nav = [
  { to: '/', label: 'Jobs' },
  { to: '/talent', label: 'Talent' },
  { to: '/salaries', label: 'Salaries' },
  { to: '/layoffs', label: 'Layoffs' },
  { to: '/research', label: 'Research' },
  { to: '/events', label: 'Events' },
  { to: '/blog', label: 'Blog' },
]

export default function Header() {
  const { theme, setTheme, user } = useApp()
  const [open, setOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!open) return undefined
    document.body.classList.add('lock-scroll')
    return () => document.body.classList.remove('lock-scroll')
  }, [open])

  const isDark =
    theme === 'dark' ||
    (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <header className="sticky top-0 z-40 w-full min-w-0 px-2 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-3">
      <div className="mx-auto flex h-14 w-full min-w-0 max-w-[1200px] items-center justify-between gap-1.5 rounded-2xl border border-black/5 bg-white/80 px-2 shadow-[0_8px_30px_rgba(16,35,28,0.06)] backdrop-blur-xl dark:border-white/10 dark:bg-night-card/90 sm:h-[58px] sm:gap-3 sm:px-4">
        <Link to="/" className="flex min-w-0 shrink items-center rounded-lg bg-none px-1 py-0.5">
          <Logo className="h-10 w-auto max-w-[168px] rounded-md sm:h-11 sm:max-w-[200px]" alt="CryptoRecruit" />
        </Link>

        <nav className="hidden items-center gap-0.5 lg:flex">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `rounded-full px-3 py-1.5 text-[13px] ${
                  isActive
                    ? 'bg-ink font-medium text-white dark:bg-accent dark:text-ink'
                    : 'text-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/10 dark:hover:text-white'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <button
            type="button"
            aria-label="Toggle theme"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className="hidden h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-black/5 dark:hover:bg-white/10 sm:flex"
          >
            {isDark ? (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z" />
              </svg>
            )}
          </button>

          <Link
            to="/login"
            aria-label="Account"
            className="hidden items-center gap-1 rounded-full px-3 py-1.5 text-[13px] text-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/10 dark:hover:text-white sm:flex"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="8" r="3.2" />
              <path d="M5 19c1.6-3.2 4-4.8 7-4.8s5.4 1.6 7 4.8" />
            </svg>
            {user ? user.name?.split(' ')[0] : 'Sign in'}
          </Link>

          {user?.role === 'admin' ? (
            <>
              <Link to="/admin/jobs" className="hidden text-[13px] text-muted hover:text-ink lg:inline dark:hover:text-white">
                Extra jobs
              </Link>
              <Link to="/applications" className="hidden text-[13px] text-muted hover:text-ink lg:inline dark:hover:text-white">
                Inbox
              </Link>
            </>
          ) : null}

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            {open ? (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {open && (
        <>
          <button type="button" className="fixed inset-0 z-30 bg-ink/25 lg:hidden" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="relative z-40 mx-auto mt-2 max-h-[min(80dvh,calc(100dvh-5rem))] max-w-[1200px] overflow-y-auto overscroll-contain rounded-2xl border border-black/5 bg-white/95 p-2 shadow-sm dark:border-white/10 dark:bg-night-card lg:hidden">
            <div className="grid gap-0.5">
              {nav.map((item) => (
                <NavLink key={item.to} to={item.to} className="rounded-xl px-3 py-3 text-sm">
                  {item.label}
                </NavLink>
              ))}
              {user?.role === 'admin' ? (
                <>
                  <Link to="/admin/jobs" className="rounded-xl px-3 py-3 text-sm">
                    Extra jobs
                  </Link>
                  <Link to="/applications" className="rounded-xl px-3 py-3 text-sm">
                    Inbox
                  </Link>
                </>
              ) : null}
              <Link to="/login" className="rounded-xl px-3 py-3 text-sm">
                {user ? user.name : 'Sign in'}
              </Link>
              <button
                type="button"
                onClick={() => setTheme(isDark ? 'light' : 'dark')}
                className="rounded-xl px-3 py-3 text-left text-sm"
              >
                {isDark ? 'Light mode' : 'Dark mode'}
              </button>
            </div>
          </div>
        </>
      )}
    </header>
  )
}
