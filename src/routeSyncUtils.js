/**
 * Shared helpers for syncing modal/feature state with React Router (HashRouter).
 */

export function isPath(pathname, segment) {
  const path = String(pathname || '')
  return path === '/' + segment || path.endsWith('/' + segment)
}

export function pathnameMatches(pathname, pattern) {
  const parts = String(pathname || '').split('/').filter(Boolean)
  if (typeof pattern === 'string') {
    return parts.indexOf(pattern) !== -1
  }
  if (Array.isArray(pattern)) {
    let idx = 0
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === pattern[idx]) {
        idx += 1
        if (idx >= pattern.length) return true
      }
    }
    return false
  }
  return false
}

export function buildPathWithSearch(pathname, searchParams, updates) {
  const next = new URLSearchParams(searchParams ? searchParams.toString() : '')
  Object.keys(updates || {}).forEach(function(key) {
    const value = updates[key]
    if (value == null || value === '') {
      next.delete(key)
    } else {
      next.set(key, String(value))
    }
  })
  const query = next.toString()
  return query ? pathname + '?' + query : pathname
}

export function replaceSearchParam(navigate, pathname, searchParams, updates, options) {
  const nextPath = buildPathWithSearch(pathname, searchParams, updates)
  const current = pathname + (searchParams && searchParams.toString() ? '?' + searchParams.toString() : '')
  if (nextPath === current) return
  navigate(nextPath, Object.assign({ replace: true }, options || {}))
}
