const STORAGE_KEY = 'bookstorage_media_proxy_base'

export const DEFAULT_PUBLIC_MEDIA_PROXY = 'https://peppertrees.syntithenai.com'

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

export function getLocalMediaProxyCandidates() {
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

export function getDefaultPublicMediaProxyCandidates() {
  const urls = [DEFAULT_PUBLIC_MEDIA_PROXY]
  parseCsvMediaProxyUrls(process.env.REACT_APP_PUBLIC_MEDIA_PROXY_URLS || '').forEach(function(url) {
    if (urls.indexOf(url) === -1) urls.push(url)
  })
  return urls
}

export function getMediaProxyBaseCandidates() {
  const urls = []
  const saved = getSavedMediaProxyBase()
  if (saved) urls.push(saved)

  const fromEnv = normalizeMediaProxyBase(process.env.REACT_APP_MEDIA_PROXY_BASE || '')
  if (fromEnv) urls.push(fromEnv)

  getLocalMediaProxyCandidates().forEach(function(url) {
    urls.push(url)
  })

  getDefaultPublicMediaProxyCandidates().forEach(function(url) {
    urls.push(url)
  })

  return urls.filter(function(url, index, all) {
    return url && all.indexOf(url) === index
  })
}

export function notifyMediaProxySettingsChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event('mediaProxySettingsChanged'))
}
