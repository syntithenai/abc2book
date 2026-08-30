/**
 * Admin review-projects client: Milliner–Koken + oldtimefiddletunes via local resolver.
 */
import { fetchViaMediaProxy } from './mediaProxyClient'

export function reviewProjectsAvailableFromStatus(status) {
  if (!status || !status.available) return false
  if (status.reviewProjects === true) return true
  const candidates = Array.isArray(status.candidates) ? status.candidates : []
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]
    if (c && c.reachable && c.available && c.reviewProjects === true) return true
  }
  return false
}

export async function fetchReviewProjectsCatalog(accessToken) {
  const res = await fetchViaMediaProxy('/review-projects', accessToken, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    const text = await res.text().catch(function() { return '' })
    throw new Error(text || ('Review projects catalog failed (HTTP ' + res.status + ')'))
  }
  return res.json()
}

export async function fetchReviewProjectsJson(relativePath, accessToken) {
  const path = '/review-projects/file/' + String(relativePath || '').replace(/^\/+/, '')
  const res = await fetchViaMediaProxy(path, accessToken, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    const text = await res.text().catch(function() { return '' })
    throw new Error(text || ('Could not load ' + relativePath + ' (HTTP ' + res.status + ')'))
  }
  return res.json()
}

export async function fetchReviewProjectsBlob(relativePath, accessToken) {
  const path = '/review-projects/file/' + String(relativePath || '').replace(/^\/+/, '')
  const res = await fetchViaMediaProxy(path, accessToken, {
    method: 'GET',
  })
  if (!res.ok) {
    const text = await res.text().catch(function() { return '' })
    throw new Error(text || ('Could not load ' + relativePath + ' (HTTP ' + res.status + ')'))
  }
  return res.blob()
}

export function findReviewProject(catalog, id) {
  const list = catalog && Array.isArray(catalog.projects) ? catalog.projects : []
  return list.find(function(p) { return p && p.id === id }) || null
}
