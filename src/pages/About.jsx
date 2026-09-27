export default function About() {
  const stats = [
    ['23k+', 'Jobs indexed'],
    ['390k+', 'Monthly reach'],
    ['3,700+', 'Web3 teams'],
    ['~140', 'Apps per listing'],
  ]
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-5 sm:py-10">
      <p className="text-sm font-semibold text-brand">About CryptoRecruit</p>
      <h1 className="mt-2 text-[28px] font-extrabold tracking-tight sm:text-4xl">The hiring desk for crypto teams.</h1>
      <p className="mt-4 text-[15px] leading-7 text-muted">
        CryptoRecruit is a focused job board for blockchain, DeFi, exchanges, and onchain products. List a role, pay in
        crypto, and talk to people who already work in the space.
      </p>
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map(([n, l]) => (
          <div key={l} className="rounded-2xl border border-line bg-white/70 p-4 dark:border-night-line dark:bg-night-card">
            <p className="text-2xl font-extrabold text-brand">{n}</p>
            <p className="mt-1 text-xs text-muted">{l}</p>
          </div>
        ))}
      </div>
      <h2 className="mt-10 text-xl font-bold">Mission</h2>
      <p className="mt-3 text-[15px] leading-7 text-muted">
        Match builders with real work — shipping products, not just watching the tape. Global, remote-first, and paid
        in the rails this industry already uses.
      </p>
    </div>
  )
}
