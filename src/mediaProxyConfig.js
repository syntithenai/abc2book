import { isCapacitorNative } from './platformUtils'

const STORAGE_KEY = 'bookstorage_media_proxy_base'
const CLOUD_RESOLVER_KEY = 'bookstorage_use_cloud_resolver'

export const DEFAULT_PUBLIC_MEDIA_PROXY = 'https://peppertrees.syntithenai.com'

/** Hosted resolver-lite on Cloud Run — fallback when peppertrees is down. */
export const DEFAULT_CLOUD_LIGHT_MEDIA_PROXY =
  'https://tunebook-resolver-light-ytrp5enyda-ts.a.run.app'

export function normalizeMediaProxyBase(value) {
  if (value === undefined || value === null) return ''
  const trimmed = String(value).trim().replace(/\/$/, '')
  if (!trimmed) return ''
  if (!/^https?:\/\//i.test(trimmed)) return ''
  return trimmed
}

export function getSavedMediaProxyBase() {
  try {
    return normalizeMediaProxyBase(localStorage.getItem(STORAGE_KEY))
  } catch (e) {
    return ''
  }
}

export function setSavedMediaProxyBase(value) {
  const normalized = normalizeMediaProxyBase(value)
  try {
    if (normalized) {
      localStorage.setItem(STORAGE_KEY, normalized)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
    return normalized
  } catch (e) {
    return ''
  }
}

function isLocalHostname(host) {
  return host === 'localhost'
    || host === '127.0.0.1'
    || host.startsWith('192.168.')
    || host.startsWith('10.')
    || host.startsWith('172.')
}

function getPageProtocol() {
  if (typeof window !== 'undefined' && window.location && window.location.protocol) {
    return window.location.protocol
  }
  return 'http:'
}

export function getDevServerMediaProxyBase() {
  if (process.env.NODE_ENV !== 'development') return ''
  if (typeof window === 'undefined' || !window.location || !window.location.origin) return ''
  const origin = window.location.origin
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
    return origin
  }
  return ''
}

export function isDevServerMediaProxyBase(base) {
  const devBase = getDevServerMediaProxyBase()
  if (devBase && base === devBase) return true
  if (!base) return false
  try {
    const parsed = new URL(base)
    const host = parsed.hostname
    if (host !== 'localhost' && host !== '127.0.0.1') return false
    if (parsed.port === '8787') return false
    return parsed.port === '3000' || parsed.port === '5173'
  } catch (e) {
    return false
  }
}

export function getLocalMediaProxyCandidates() {
  // Match the page protocol so an HTTPS site doesn't emit http:// localhost
  // candidates the browser will block as mixed content. On HTTPS the local
  // resolver is reached via Caddy on the default port (443), not :8787.
  if (getPageProtocol() === 'https:') {
    const urls = ['https://localhost', 'https://127.0.0.1']

    if (typeof window !== 'undefined') {
      const host = window.location.hostname
      if (host && host !== 'localhost' && host !== '127.0.0.1' && isLocalHostname(host)) {
        urls.push('https://' + host)
      }
    }

    return urls
  }

  const urls = ['http://localhost:8787', 'http://127.0.0.1:8787']

  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host && host !== 'localhost' && host !== '127.0.0.1' && isLocalHostname(host)) {
      urls.push('http://' + host + ':8787')
    }
  }

  return urls
}

function parseCsvMediaProxyUrls(value) {
  if (!value) return []
  return String(value).split(',').map(normalizeMediaProxyBase).filter(Boolean)
}

export function getUseCloudResolver() {
  try {
    const raw = localStorage.getItem(CLOUD_RESOLVER_KEY)
    if (raw === '0') return false
    return true
  } catch (e) {
    return true
  }
}

export function setUseCloudResolver(enabled) {
  try {
    localStorage.setItem(CLOUD_RESOLVER_KEY, enabled ? '1' : '0')
  } catch (e) {
    return false
  }
  notifyMediaProxySettingsChanged()
  return !!enabled
}

function appendPublicResolverCandidates(urls) {
  if (!getUseCloudResolver()) return
  getDefaultPublicMediaProxyCandidates().forEach(function(url) {
    pushUnique(urls, url)
  })
}

export function getDefaultPublicMediaProxyCandidates() {
  const urls = [DEFAULT_PUBLIC_MEDIA_PROXY, DEFAULT_CLOUD_LIGHT_MEDIA_PROXY]
  parseCsvMediaProxyUrls(process.env.REACT_APP_PUBLIC_MEDIA_PROXY_URLS || '').forEach(function(url) {
    if (urls.indexOf(url) === -1) urls.push(url)
  })
  return urls
}

/** Central credit ledger on Cloud Run — not home peppertrees or localhost. */
export const DEFAULT_BILLING_MEDIA_PROXY = DEFAULT_CLOUD_LIGHT_MEDIA_PROXY

export function getBillingMediaProxyCandidates() {
  const urls = []
  parseCsvMediaProxyUrls(process.env.REACT_APP_BILLING_MEDIA_PROXY_URLS || '').forEach(function(url) {
    pushUnique(urls, url)
  })
  if (!urls.length) {
    pushUnique(urls, DEFAULT_BILLING_MEDIA_PROXY)
  }
  return urls
}

export function isLoopbackMediaProxyBase(value) {
  const base = normalizeMediaProxyBase(value)
  if (!base) return false
  try {
    const host = new URL(base).hostname
    return host === 'localhost' || host === '127.0.0.1'
  } catch (e) {
    return false
  }
}

/** Production + native apps: peppertrees then cloud before loopback env URLs. */
export function prefersPublicMediaProxyFirst() {
  return process.env.NODE_ENV === 'production' || isCapacitorNative()
}

function pushUnique(urls, url) {
  if (url && urls.indexOf(url) === -1) urls.push(url)
}

export function getMediaProxyBaseCandidates() {
  const urls = []
  const saved = getSavedMediaProxyBase()
  const publicFirst = prefersPublicMediaProxyFirst()
  const native = isCapacitorNative()

  // Explicit Settings override wins over automatic discovery.
  if (saved) pushUnique(urls, saved)

  if (publicFirst) {
    appendPublicResolverCandidates(urls)
  }

  if (!publicFirst && !native) {
    const devBase = getDevServerMediaProxyBase()
    if (devBase) pushUnique(urls, devBase)

    getLocalMediaProxyCandidates().forEach(function(url) {
      pushUnique(urls, url)
    })
  }

  const fromEnv = normalizeMediaProxyBase(process.env.REACT_APP_MEDIA_PROXY_BASE || '')
  if (fromEnv && (!publicFirst || !isLoopbackMediaProxyBase(fromEnv))) {
    pushUnique(urls, fromEnv)
  }

  if (!publicFirst) {
    appendPublicResolverCandidates(urls)
  }

  return urls
}

export function notifyMediaProxySettingsChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event('mediaProxySettingsChanged'))
}
