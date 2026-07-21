const ALLOWED_EVENTS = new Set([
  'search',
  'page_view',
  'book_section_click',
  'abc_play',
  'media_play',
  'editor_open',
  'resolver_request',
])

const STATIC_ROUTE_SEGMENTS = new Set([
  'books',
  'tags',
  'filters',
  'help',
  'settings',
  'recordings',
  'privacy',
  'testme',
  'chords',
  'cheatsheet',
  'print',
  'review',
  'menu',
  'tuner',
  'piano',
  'metronome',
  'tunes',
  'editor',
  'import',
  'importaudio',
  'importdoc',
  'importlink',
  'playMidi',
  'playMedia',
  'book',
  'tag',
  'play',
  'tune',
  'practice',
  'gig',
  'sets',
  'check',
  'share',
  'add',
  'bulk',
  'sheet-image',
  'chord-sheet',
  'chord-url',
])

const GOATCOUNTER_SCRIPT_SRC = 'https://gc.zgo.at/count.js'

function getEndpoint() {
  return process.env.REACT_APP_GOATCOUNTER_URL || ''
}

function isAnalyticsEnabled() {
  if (!getEndpoint()) return false
  const flag = process.env.REACT_APP_ANALYTICS_ENABLED
  if (flag === 'false') return false
  if (flag === 'true') return true
  return process.env.NODE_ENV === 'production'
}

let scriptRequested = false
let goatcounterReady = false
let pendingQueue = []

function flushQueue() {
  goatcounterReady = true
  while (pendingQueue.length > 0) {
    const vars = pendingQueue.shift()
    try {
      window.goatcounter.count(vars)
    } catch (e) {
      // ignore analytics failures
    }
  }
}

function ensureScriptLoaded() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  if (goatcounterReady) return
  if (window.goatcounter && typeof window.goatcounter.count === 'function') {
    flushQueue()
    return
  }
  if (scriptRequested) return
  scriptRequested = true

  try {
    const script = document.createElement('script')
    script.async = true
    script.src = GOATCOUNTER_SCRIPT_SRC
    script.setAttribute('data-goatcounter', getEndpoint())
    script.setAttribute('data-goatcounter-settings', JSON.stringify({
      no_onload: true,
      allow_local: process.env.NODE_ENV !== 'production',
    }))
    script.addEventListener('load', flushQueue)
    script.addEventListener('error', function() { scriptRequested = false })
    document.head.appendChild(script)
  } catch (e) {
    scriptRequested = false
  }
}

function send(vars) {
  if (!isAnalyticsEnabled()) return
  ensureScriptLoaded()
  try {
    if (window.goatcounter && typeof window.goatcounter.count === 'function') {
      window.goatcounter.count(vars)
    } else {
      pendingQueue.push(vars)
    }
  } catch (e) {
    // ignore analytics failures
  }
}

export function normalizeRoute(pathname) {
  const parts = (pathname || '/').split('/').filter(function(part) { return part })
  if (parts.length === 0) return '/'

  const normalized = []
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const previous = normalized[normalized.length - 1]

    if (previous === 'tunes' && part === 'check') {
      normalized.push('check')
      continue
    }
    if (previous === 'tunes' || previous === 'editor' || previous === 'review') {
      normalized.push(':tuneId')
      continue
    }
    if (normalized[0] === 'editor' && normalized.length === 2 && previous === ':tuneId') {
      normalized.push(':view')
      continue
    }
    if (previous === 'sets' || previous === 'gig') {
      normalized.push(':setId')
      continue
    }
    if (normalized[0] === 'gig' && normalized.length === 2 && previous === ':setId') {
      normalized.push(':tuneId')
      continue
    }
    if (previous === 'recordings' || previous === 'importaudio' || previous === 'importdoc') {
      normalized.push(':id')
      continue
    }
    if (previous === 'playMedia') {
      normalized.push(':mediaLinkNumber')
      continue
    }
    if (previous === 'cheatsheet' || previous === 'print') {
      normalized.push(':tuneBook')
      continue
    }
    if (previous === 'importlink' && part !== 'book' && part !== 'tag' && part !== 'tune' && part !== 'play') {
      normalized.push(':link')
      continue
    }
    if (previous === 'book' || previous === 'tag' || previous === 'tune') {
      normalized.push(':name')
      continue
    }
    if (previous === 'chords' && i === 1) {
      normalized.push(':instrument')
      continue
    }
    if (normalized[0] === 'chords' && normalized.length === 2 && i === 2) {
      normalized.push(':chordLetter')
      continue
    }
    if (normalized[0] === 'chords' && normalized.length === 3 && i === 3) {
      normalized.push(':quality')
      continue
    }

    if (previous === 'import' && (part === 'sheet-image' || part === 'chord-sheet' || part === 'chord-url')) {
      normalized.push(part)
      continue
    }

    if (STATIC_ROUTE_SEGMENTS.has(part)) {
      normalized.push(part)
    } else if (previous === 'import') {
      normalized.push(':curation')
    } else {
      normalized.push(':param')
    }
  }

  return '/' + normalized.join('/')
}

function trackNamedEvent(eventName, eventPath) {
  if (!ALLOWED_EVENTS.has(eventName)) return
  send({ path: eventPath || eventName, title: eventName, event: true })
}

export function trackEvent(eventName, properties) {
  if (!ALLOWED_EVENTS.has(eventName)) return
  if (eventName === 'page_view') {
    trackPageView(properties && properties.route ? properties.route : '/')
    return
  }
  trackNamedEvent(eventName)
}

let lastTrackedSearch = ''

export function trackSearch() {
  if (lastTrackedSearch === '1') return
  lastTrackedSearch = '1'
  trackNamedEvent('search')
}

export function resetSearchTracking() {
  lastTrackedSearch = ''
}

export function trackPageView(pathname) {
  const route = normalizeRoute(pathname)
  send({ path: route, title: route, event: false })
}

export function trackBookSectionClick(section) {
  const allowed = new Set(['filters', 'recent', 'starred', 'books', 'tags', 'genres', 'artists'])
  if (!allowed.has(section)) return
  trackNamedEvent('book_section_click', 'book_section_click-' + section)
}

export function trackAbcPlay() {
  trackNamedEvent('abc_play')
}

export function trackMediaPlay() {
  trackNamedEvent('media_play')
}

export function trackEditorOpen() {
  trackNamedEvent('editor_open')
}

const RESOLVER_EVENTS = new Set([
  'proxy-audio',
  'youtube-audio',
  'detect-chords',
  'analyze-media',
  'transcribe',
  'detect-playback-region',
  'separate-stems',
  'stem-audio',
  'midi2xml',
  'midi2abc',
  'abc2xml',
  'transcribe-sheet-image',
  'search-images',
  'generate-feed-articles',
  'generate-feed-quizzes',
  'enrich-feed-sources',
])

export function trackResolverRequest(endpoint) {
  if (!RESOLVER_EVENTS.has(endpoint)) return
  trackNamedEvent('resolver_request', 'resolver-client/' + endpoint)
}
