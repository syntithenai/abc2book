const STORAGE_KEY = 'abc2book.bulkCheckSession'
const LEGACY_STORAGE_KEY = 'abc2book.bulkLinkCheckSession'

let cachedSession = null
const listeners = new Set()

function readStorage(key) {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (e) {
    return null
  }
}

function writeStorage(session) {
  if (typeof sessionStorage === 'undefined') return
  try {
    if (!session) {
      sessionStorage.removeItem(STORAGE_KEY)
      sessionStorage.removeItem(LEGACY_STORAGE_KEY)
      return
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } catch (e) {}
}

function notify() {
  listeners.forEach(function(listener) {
    listener()
  })
}

function emptyLinksState(totalCount) {
  return {
    failures: [],
    warnings: [],
    progressMessage: '',
    checkedCount: 0,
    totalCount: totalCount || 0,
    progressPercent: 0,
  }
}

function migrateLegacySession(legacy) {
  if (!legacy || !legacy.selectionKey) return null
  return {
    selectionKey: legacy.selectionKey,
    phase: legacy.phase || 'intro',
    activeTab: 'links',
    links: {
      failures: Array.isArray(legacy.failures) ? legacy.failures : [],
      warnings: [],
      progressMessage: legacy.progressMessage || '',
      checkedCount: legacy.checkedCount || 0,
      totalCount: legacy.totalCount || 0,
      progressPercent: legacy.progressPercent || 0,
    },
    completeness: { issues: [] },
    abcCorrectness: { issues: [] },
    ignoredTuneIds: [],
    linksChecked: false,
    hasRun: false,
  }
}

function normalizeSession(session) {
  if (!session || !session.selectionKey) return null
  const links = session.links || emptyLinksState()
  return {
    selectionKey: session.selectionKey,
    phase: session.phase || 'intro',
    activeTab: session.activeTab || 'links',
    links: Object.assign(emptyLinksState(), links, {
      failures: Array.isArray(links.failures) ? links.failures : [],
      warnings: Array.isArray(links.warnings) ? links.warnings : [],
    }),
    completeness: {
      issues: session.completeness && Array.isArray(session.completeness.issues)
        ? session.completeness.issues
        : [],
    },
    abcCorrectness: {
      issues: session.abcCorrectness && Array.isArray(session.abcCorrectness.issues)
        ? session.abcCorrectness.issues
        : [],
    },
    ignoredTuneIds: Array.isArray(session.ignoredTuneIds) ? session.ignoredTuneIds : [],
    linksChecked: !!session.linksChecked,
    hasRun: !!session.hasRun,
  }
}

export function buildBulkCheckSessionBase(selectionKey, queueLength) {
  return {
    selectionKey: selectionKey,
    phase: 'intro',
    activeTab: 'links',
    links: emptyLinksState(queueLength),
    completeness: { issues: [] },
    abcCorrectness: { issues: [] },
    ignoredTuneIds: [],
    linksChecked: false,
    hasRun: false,
  }
}

export function getBulkCheckSession(selectionKey) {
  if (!selectionKey) return null
  if (!cachedSession) {
    cachedSession = readStorage(STORAGE_KEY)
    if (!cachedSession) {
      cachedSession = migrateLegacySession(readStorage(LEGACY_STORAGE_KEY))
    }
  }
  const normalized = normalizeSession(cachedSession)
  if (!normalized || normalized.selectionKey !== selectionKey) {
    return null
  }
  return normalized
}

export function getActiveBulkCheckSession() {
  if (!cachedSession) {
    cachedSession = readStorage(STORAGE_KEY)
    if (!cachedSession) {
      cachedSession = migrateLegacySession(readStorage(LEGACY_STORAGE_KEY))
    }
  }
  return normalizeSession(cachedSession)
}

export function isBulkCheckPhaseRunning(phase) {
  return phase === 'running-static' || phase === 'running-links'
}

export function isBulkCheckLinkPhaseRunning(phase) {
  return phase === 'running-links'
}

export function patchBulkCheckSession(selectionKey, patch) {
  if (!selectionKey) return null
  const stored = getBulkCheckSession(selectionKey) || buildBulkCheckSessionBase(selectionKey)
  const next = Object.assign({}, stored, patch || {}, { selectionKey: selectionKey })
  if (patch && patch.links) {
    next.links = Object.assign({}, stored.links, patch.links)
  }
  if (patch && patch.completeness) {
    next.completeness = Object.assign({}, stored.completeness, patch.completeness)
  }
  if (patch && patch.abcCorrectness) {
    next.abcCorrectness = Object.assign({}, stored.abcCorrectness, patch.abcCorrectness)
  }
  if (patch && patch.ignoredTuneIds) {
    next.ignoredTuneIds = patch.ignoredTuneIds
  }
  saveBulkCheckSession(next)
  return next
}

export function saveBulkCheckSession(session) {
  cachedSession = session ? normalizeSession(session) : null
  writeStorage(cachedSession)
  notify()
}

export function clearBulkCheckSession() {
  saveBulkCheckSession(null)
}

export function subscribeBulkCheckSession(listener) {
  listeners.add(listener)
  return function unsubscribe() {
    listeners.delete(listener)
  }
}

// Backward-compatible aliases
export function getLinkCheckSession(selectionKey) {
  const session = getBulkCheckSession(selectionKey)
  if (!session) return null
  return Object.assign({}, session.links, {
    selectionKey: session.selectionKey,
    phase: session.phase,
  })
}

export function saveLinkCheckSession(session) {
  if (!session || !session.selectionKey) {
    clearBulkCheckSession()
    return
  }
  const existing = getBulkCheckSession(session.selectionKey) || buildBulkCheckSessionBase(session.selectionKey)
  saveBulkCheckSession(Object.assign({}, existing, {
    selectionKey: session.selectionKey,
    phase: session.phase || existing.phase,
    links: Object.assign({}, existing.links, {
      failures: session.failures,
      progressMessage: session.progressMessage,
      checkedCount: session.checkedCount,
      totalCount: session.totalCount,
      progressPercent: session.progressPercent,
    }),
  }))
}

export function clearLinkCheckSession() {
  clearBulkCheckSession()
}

export function subscribeLinkCheckSession(listener) {
  return subscribeBulkCheckSession(listener)
}

export function getLinkCheckSessionSnapshot(selectionKey) {
  return getLinkCheckSession(selectionKey)
}
