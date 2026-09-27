import { useEffect, useState } from 'react'

export const BRAND_NAME = 'CryptoRecruit'
export const BRAND_LOGO = '/logo.png'

export function Logo({ className = 'h-10 w-auto', alt = BRAND_NAME }) {
  return (
    <img
      src={BRAND_LOGO}
      alt={alt}
      className={`object-contain ${className}`}
      width={180}
      height={180}
      decoding="async"
    />
  )
}

export function BrandWordmark({ className = '', accentClassName = 'text-brand' }) {
  return (
    <span className={`whitespace-nowrap ${className}`}>
      Crypto<span className={accentClassName}>Recruit</span>
    </span>
  )
}

export const socials = [
  { name: 'X', href: '/about', icon: IconX },
  { name: 'Telegram', href: '/about', icon: IconTelegram },
  { name: 'LinkedIn', href: '/about', icon: IconLinkedIn },
  { name: 'GitHub', href: '/about', icon: IconGitHub },
]

function IconX() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.725-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  )
}

function IconTelegram() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
      <path d="M21.73 4.27a1.3 1.3 0 0 0-1.37-.2L2.86 11.1c-.9.36-.89 1.62.03 1.95l4.55 1.63 1.75 5.5c.28.88 1.38 1.14 2.03.48l2.52-2.56 4.7 3.47c.74.55 1.8.13 2.02-.8l3.2-13.5a1.3 1.3 0 0 0-.93-1.6zm-3.3 3.2-8.36 7.6-.34 3.55-1.7-5.36 10.4-5.79z" />
    </svg>
  )
}

function IconLinkedIn() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
      <path d="M6.54 8.75H3.56V20.5h2.98V8.75zM5.04 3.5A1.74 1.74 0 1 0 5.05 7a1.74 1.74 0 0 0-.01-3.5zM20.5 20.5h-2.97v-5.7c0-1.36-.03-3.1-1.89-3.1-1.9 0-2.19 1.48-2.19 3v5.8H10.5V8.75h2.85v1.6h.04c.4-.75 1.37-1.54 2.82-1.54 3.01 0 3.57 1.98 3.57 4.56V20.5z" />
    </svg>
  )
}

function IconGitHub() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.52 2.87 8.35 6.84 9.71.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.36 1.12 2.94.86.09-.67.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.7 0 0 .84-.27 2.75 1.05A9.3 9.3 0 0 1 12 6.84c.85 0 1.7.12 2.5.34 1.9-1.32 2.74-1.05 2.74-1.05.55 1.4.2 2.44.1 2.7.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9 0 1.38-.01 2.48-.01 2.82 0 .27.18.6.69.49A10.03 10.03 0 0 0 22 12.26C22 6.58 17.52 2 12 2z" />
    </svg>
  )
}

export function SocialLinks({ className = '' }) {
  return (
    <div className={`flex gap-3 ${className}`}>
      {socials.map(({ name, href, icon: Icon }) => (
        <a
          key={name}
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label={name}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-brand transition hover:bg-brand hover:text-white dark:bg-white/10 dark:text-gray-300 dark:hover:bg-brand dark:hover:text-white"
        >
          <Icon />
        </a>
      ))}
    </div>
  )
}

export function mediaSrc(src) {
  if (!src) return ''
  if (src.startsWith('/api/img')) return src
  try {
    const host = new URL(src, 'http://localhost').hostname
    if (
      host.endsWith('cryptojobslist.com') ||
      host.endsWith('ashbyhq.com') ||
      host.endsWith('googleapis.com') ||
      host.endsWith('googleusercontent.com')
    ) {
      return `/api/img?u=${encodeURIComponent(src)}`
    }
  } catch {
    return src
  }
  return src
}

export function CompanyLogo({ company, logo, name, size = 40 }) {
  const src = mediaSrc(logo || company?.logo)
  const label = name || company?.name || 'C'
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-2xl bg-white object-contain ring-1 ring-black/5"
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
      />
    )
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-2xl font-semibold text-white shadow-sm ring-1 ring-black/5"
      style={{
        width: size,
        height: size,
        background: company?.color || '#0084FF',
        fontSize: size * 0.42,
      }}
      aria-hidden="true"
    >
      {company?.letter || label[0]}
    </div>
  )
}

export function Tag({ children, to, onClick }) {
  const className =
    'inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 transition hover:bg-brand-soft hover:text-brand dark:bg-white/8 dark:text-gray-300 dark:hover:bg-brand/20 dark:hover:text-white'
  if (to) {
    return (
      <a href={to} className={className} onClick={onClick}>
        {children}
      </a>
    )
  }
  return (
    <span className={className} onClick={onClick}>
      {children}
    </span>
  )
}
