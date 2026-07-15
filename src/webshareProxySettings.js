/** User BYO residential proxy (e.g. Webshare) for slim YouTube gateway egress. */

const STORAGE_KEY = 'bookstorage_webshare_proxy_url'

export function normalizeProxyUrl(value) {
  if (value === undefined || value === null) return ''
  const trimmed = String(value).trim()
  if (!trimmed) return ''
  // Accept http(s)://user:pass@host:port or socks5://
  if (!/^(https?|socks5?):\/\//i.test(trimmed)) return ''
  return trimmed
}

export function getSavedWebshareProxyUrl() {
  try {
    return normalizeProxyUrl(localStorage.getItem(STORAGE_KEY))
  } catch (e) {
    return ''
  }
}

export function setSavedWebshareProxyUrl(value) {
  const normalized = normalizeProxyUrl(value)
  try {
    if (normalized) localStorage.setItem(STORAGE_KEY, normalized)
    else localStorage.removeItem(STORAGE_KEY)
  } catch (e) {
    // ignore
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('webshareProxySettingsChanged'))
  }
  return normalized
}

export function isWebshareProxyConfigured() {
  return !!getSavedWebshareProxyUrl()
}
