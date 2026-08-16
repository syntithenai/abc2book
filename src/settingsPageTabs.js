export const TAB_BACKGROUND_JOBS = 'background-jobs'
export const TAB_PERSONALISATION = 'personalisation'
export const TAB_APPEARANCE = 'appearance'
export const TAB_MEDIA = 'media'
export const TAB_VOICE = 'voice'
export const TAB_PROVIDERS = 'providers'
export const TAB_PEDAL = 'pedal'
export const TAB_BACKUP = 'backup'
export const TAB_SOURCES = 'sources'
export const TAB_DUPLICATES = 'duplicates'
export const TAB_CLEANUP = 'cleanup'
export const TAB_LIBRARY = 'library'
export const LIBRARY_TAB_LIBRARY = 'library'
export const LIBRARY_TAB_SCALE = 'scale'
export const TAB_MUSIC_COLLECTION = 'music-collection'
export const TAB_BILLING_ADMIN = 'billing-admin'

const PERSONALISATION_TAB_IDS = {
  [TAB_APPEARANCE]: true,
  [TAB_VOICE]: true,
  [TAB_PEDAL]: true,
  [TAB_PERSONALISATION]: true,
}

const TOP_LEVEL_TAB_IDS = {
  [TAB_BACKGROUND_JOBS]: true,
  [TAB_PERSONALISATION]: true,
  [TAB_PROVIDERS]: true,
  [TAB_LIBRARY]: true,
  [TAB_BILLING_ADMIN]: true,
}

const LIBRARY_NESTED_TAB_IDS = {
  [TAB_SOURCES]: TAB_SOURCES,
  [TAB_BACKUP]: TAB_BACKUP,
  [TAB_CLEANUP]: TAB_CLEANUP,
  [TAB_DUPLICATES]: TAB_DUPLICATES,
  [TAB_MEDIA]: TAB_MEDIA,
  [LIBRARY_TAB_LIBRARY]: LIBRARY_TAB_LIBRARY,
  [LIBRARY_TAB_SCALE]: LIBRARY_TAB_LIBRARY,
}

function searchFromQuery(query) {
  if (!query) return ''
  if (typeof query === 'string') {
    return query.charAt(0) === '?' ? query : '?' + query
  }
  if (typeof URLSearchParams !== 'undefined' && query instanceof URLSearchParams) {
    const text = query.toString()
    return text ? '?' + text : ''
  }
  const params = new URLSearchParams()
  Object.keys(query).forEach(function(key) {
    const value = query[key]
    if (value == null || value === '') return
    params.set(key, String(value))
  })
  const text = params.toString()
  return text ? '?' + text : ''
}

export function normalizeLibraryTab(libraryTab) {
  if (!libraryTab) return LIBRARY_TAB_LIBRARY
  if (libraryTab === LIBRARY_TAB_SCALE) return LIBRARY_TAB_LIBRARY
  return LIBRARY_NESTED_TAB_IDS[libraryTab] || LIBRARY_TAB_LIBRARY
}

export function isTopLevelSettingsTab(tab) {
  return !!TOP_LEVEL_TAB_IDS[tab]
}

export function parseSettingsSplat(splat) {
  const segments = String(splat || '').split('/').filter(Boolean)
  const tab = segments[0] || ''
  const nested = segments[1] || ''
  if (!tab) {
    return { tab: TAB_BACKGROUND_JOBS, libraryTab: LIBRARY_TAB_LIBRARY }
  }
  if (tab === TAB_LIBRARY) {
    return {
      tab: TAB_LIBRARY,
      libraryTab: nested ? normalizeLibraryTab(nested) : LIBRARY_TAB_LIBRARY,
    }
  }
  if (TOP_LEVEL_TAB_IDS[tab]) {
    return { tab: tab, libraryTab: LIBRARY_TAB_LIBRARY }
  }
  return resolveSettingsLocation(tab, nested)
}

export function buildSettingsPath(tab, libraryTab, query) {
  const resolved = tab === TAB_LIBRARY
    ? { tab: TAB_LIBRARY, libraryTab: normalizeLibraryTab(libraryTab) }
    : { tab: tab || TAB_BACKGROUND_JOBS, libraryTab: LIBRARY_TAB_LIBRARY }
  let path = '/settings/' + resolved.tab
  if (resolved.tab === TAB_LIBRARY && resolved.libraryTab && resolved.libraryTab !== LIBRARY_TAB_LIBRARY) {
    path += '/' + resolved.libraryTab
  }
  return path + searchFromQuery(query)
}

export function buildSettingsHashPath(tab, libraryTab, query) {
  return '/#' + buildSettingsPath(tab, libraryTab, query)
}

export function resolveSettingsLocation(tabParam, libraryTabParam) {
  if (tabParam === 'audio') {
    return { tab: TAB_BACKGROUND_JOBS, libraryTab: LIBRARY_TAB_LIBRARY }
  }
  if (tabParam && PERSONALISATION_TAB_IDS[tabParam]) {
    return { tab: TAB_PERSONALISATION, libraryTab: LIBRARY_TAB_LIBRARY }
  }
  if (tabParam === TAB_MUSIC_COLLECTION) {
    return { tab: TAB_LIBRARY, libraryTab: TAB_SOURCES }
  }
  if (tabParam && LIBRARY_NESTED_TAB_IDS[tabParam] && tabParam !== TAB_LIBRARY) {
    return { tab: TAB_LIBRARY, libraryTab: normalizeLibraryTab(tabParam) }
  }
  if (tabParam === TAB_LIBRARY) {
    return { tab: TAB_LIBRARY, libraryTab: normalizeLibraryTab(libraryTabParam) }
  }
  if (tabParam && TOP_LEVEL_TAB_IDS[tabParam]) {
    return { tab: tabParam, libraryTab: LIBRARY_TAB_LIBRARY }
  }
  if (tabParam) {
    return { tab: tabParam, libraryTab: normalizeLibraryTab(libraryTabParam) }
  }
  return { tab: TAB_BACKGROUND_JOBS, libraryTab: LIBRARY_TAB_LIBRARY }
}

export function legacySettingsRedirect(splat, searchParams) {
  const params = searchParams || new URLSearchParams()
  const tabParam = params.get('tab')
  if (!tabParam) {
    if (!splat) return buildSettingsPath(TAB_BACKGROUND_JOBS, null, copyNonLegacySearch(params))
    return null
  }
  const resolved = resolveSettingsLocation(tabParam, params.get('libraryTab'))
  return buildSettingsPath(resolved.tab, resolved.libraryTab, copyNonLegacySearch(params))
}

function copyNonLegacySearch(searchParams) {
  const next = new URLSearchParams(searchParams)
  next.delete('tab')
  next.delete('libraryTab')
  return next
}

export function readSettingsQueryParams() {
  if (typeof window === 'undefined') return new URLSearchParams()
  const hash = String(window.location.hash || '')
  const hashQueryIndex = hash.indexOf('?')
  if (hashQueryIndex >= 0) {
    return new URLSearchParams(hash.slice(hashQueryIndex + 1))
  }
  return new URLSearchParams(window.location.search)
}
