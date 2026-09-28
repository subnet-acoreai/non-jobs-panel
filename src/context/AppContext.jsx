import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem('cjl-theme')
    return stored === 'light' || stored === 'dark' ? stored : 'dark'
  })
  const [bookmarks, setBookmarks] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('cjl-bookmarks') || '[]')
    } catch {
      return []
    }
  })
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('cjl-user') || 'null')
    } catch {
      return null
    }
  })
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState('')
  const [category, setCategory] = useState('')
  const [remoteOnly, setRemoteOnly] = useState(false)
  const [sort, setSort] = useState('recent')
  const [showBookmarks, setShowBookmarks] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const dark = theme === 'dark' || (theme === 'system' && prefersDark)
    root.classList.toggle('dark', dark)
    localStorage.setItem('cjl-theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('cjl-bookmarks', JSON.stringify(bookmarks))
  }, [bookmarks])

  useEffect(() => {
    if (user) localStorage.setItem('cjl-user', JSON.stringify(user))
    else localStorage.removeItem('cjl-user')
  }, [user])

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(async (res) => {
        const payload = await res.json().catch(() => ({}))
        if (res.ok && payload.user) setUser(payload.user)
        else setUser(null)
      })
      .catch(() => {})
  }, [])

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      bookmarks,
      toggleBookmark: (id) =>
        setBookmarks((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
      user,
      setUser,
      query,
      setQuery,
      location,
      setLocation,
      category,
      setCategory,
      remoteOnly,
      setRemoteOnly,
      sort,
      setSort,
      showBookmarks,
      setShowBookmarks,
    }),
    [theme, bookmarks, user, query, location, category, remoteOnly, sort, showBookmarks],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
