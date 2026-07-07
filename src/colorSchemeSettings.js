export const COLOR_SCHEME_STORAGE_KEY = 'bookstorage_color_scheme'
export const LIGHT_SCHEME_BEFORE_NIGHT_KEY = 'bookstorage_light_scheme_before_night'

export const DEFAULT_COLOR_SCHEME = 'blue'

export const COLOR_SCHEMES = [
  {
    id: 'blue',
    label: 'Blue',
    description: 'Soft blue-slate (default)',
    swatchColor: '#3b6db5',
  },
  {
    id: 'green',
    label: 'Green',
    description: 'Forest green accents',
    swatchColor: '#2f8f5b',
  },
  {
    id: 'red',
    label: 'Red',
    description: 'Warm red accents',
    swatchColor: '#c44d4d',
  },
  {
    id: 'purple',
    label: 'Purple',
    description: 'Plum and violet accents',
    swatchColor: '#7b52ab',
  },
  {
    id: 'orange',
    label: 'Orange',
    description: 'Amber and copper accents',
    swatchColor: '#d97706',
  },
  {
    id: 'yellow',
    label: 'Yellow',
    description: 'Warm gold and honey accents',
    swatchColor: '#c9a227',
  },
  {
    id: 'pink',
    label: 'Pink',
    description: 'Rose and blush accents',
    swatchColor: '#d4537e',
  },
  {
    id: 'night',
    label: 'Night',
    description: 'Dark background with light text',
    swatchColor: '#1c2230',
  },
]

const VALID_SCHEME_IDS = new Set(COLOR_SCHEMES.map(function(scheme) { return scheme.id }))

export function normalizeColorScheme(scheme) {
  if (scheme && VALID_SCHEME_IDS.has(scheme)) return scheme
  return DEFAULT_COLOR_SCHEME
}

export function getColorScheme() {
  try {
    return normalizeColorScheme(localStorage.getItem(COLOR_SCHEME_STORAGE_KEY))
  } catch (e) {
    return DEFAULT_COLOR_SCHEME
  }
}

export function applyColorScheme(scheme) {
  const resolved = normalizeColorScheme(scheme)
  document.documentElement.setAttribute('data-color-scheme', resolved)
  return resolved
}

export function setColorScheme(scheme) {
  const resolved = normalizeColorScheme(scheme)
  try {
    localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, resolved)
  } catch (e) {
    // ignore quota errors
  }
  applyColorScheme(resolved)
  return resolved
}

export function getColorSchemeMeta(scheme) {
  const resolved = normalizeColorScheme(scheme)
  return COLOR_SCHEMES.find(function(entry) { return entry.id === resolved }) || COLOR_SCHEMES[0]
}

export function isNightColorScheme(scheme) {
  return normalizeColorScheme(scheme || getColorScheme()) === 'night'
}

export function toggleNightColorScheme() {
  const current = getColorScheme()
  if (current === 'night') {
    let restore = DEFAULT_COLOR_SCHEME
    try {
      const stored = localStorage.getItem(LIGHT_SCHEME_BEFORE_NIGHT_KEY)
      if (stored && VALID_SCHEME_IDS.has(stored) && stored !== 'night') {
        restore = stored
      }
    } catch (e) {
      // ignore storage errors
    }
    return setColorScheme(restore)
  }
  try {
    localStorage.setItem(LIGHT_SCHEME_BEFORE_NIGHT_KEY, current)
  } catch (e) {
    // ignore storage errors
  }
  return setColorScheme('night')
}
