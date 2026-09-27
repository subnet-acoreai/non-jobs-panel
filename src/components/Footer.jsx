import { Link } from 'react-router-dom'
import { BRAND_NAME, Logo, SocialLinks } from './Brand'
import { categories, cities } from '../data/site'

export default function Footer() {
  return (
    <footer className="mt-10 border-t border-line bg-ink pb-[env(safe-area-inset-bottom)] text-white dark:border-night-line sm:mt-12">
      <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-10 sm:grid-cols-2 sm:gap-10 sm:px-5 sm:py-14 lg:grid-cols-4">
        <div>
          <Link to="/" className="inline-flex items-center rounded-xl bg-black/40 p-1.5 ring-1 ring-white/10">
            <Logo className="h-14 w-auto max-w-[220px] rounded-lg" alt={BRAND_NAME} />
          </Link>
          <p className="mt-3 max-w-xs text-sm leading-6 text-white/65">
            Live Web3, crypto, and blockchain jobs. Apply in one flow. Hire with crypto.
          </p>
          <SocialLinks className="mt-5" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">Browse by role</h3>
          <ul className="mt-3 space-y-2 text-sm text-white/65">
            {categories.map((c) => (
              <li key={c.id}>
                <Link className="hover:text-accent" to={`/?category=${c.id}`}>
                  {c.emoji} {c.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold">Browse by location</h3>
          <ul className="mt-3 space-y-2 text-sm text-white/65">
            <li>
              <Link className="hover:text-accent" to="/?remote=1">
                Remote
              </Link>
            </li>
            {cities.slice(0, 7).map((c) => (
              <li key={c}>
                <Link className="hover:text-accent" to={`/?location=${encodeURIComponent(c)}`}>
                  {c}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold">Company</h3>
          <ul className="mt-3 space-y-2 text-sm text-white/65">
            <li>
              <Link className="hover:text-accent" to="/hire">
                Post jobs
              </Link>
            </li>
            <li>
              <Link className="hover:text-accent" to="/talent">
                Hire talent
              </Link>
            </li>
            <li>
              <Link className="hover:text-accent" to="/salaries">
                Salary guide
              </Link>
            </li>
            <li>
              <Link className="hover:text-accent" to="/research">
                Research
              </Link>
            </li>
            <li>
              <Link className="hover:text-accent" to="/about">
                About us
              </Link>
            </li>
            <li>
              <Link className="hover:text-accent" to="/blog">
                Blog
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-white/40">
        © {new Date().getFullYear()} {BRAND_NAME}. Independent job board.
      </div>
    </footer>
  )
}
