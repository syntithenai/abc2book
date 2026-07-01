const HISTORY_VERSION = 1
const DEFAULT_MAX_ENTRIES = 50

function cloneHistoryValue(value) {
  if (value === null || value === undefined) return value
  return JSON.parse(JSON.stringify(value))
}

function historyValuesEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function normalizeTuneStack(stack) {
  const entries = Array.isArray(stack && stack.entries) ? stack.entries.map(function(entry) {
    return cloneHistoryValue(entry)
  }) : []
  const maxIndex = entries.length - 1
  const rawIndex = typeof (stack && stack.index) === 'number' ? stack.index : maxIndex
  const index = Math.max(-1, Math.min(rawIndex, maxIndex))
  return { entries: entries, index: index }
}

export function normalizeTuneEditHistoryState(state) {
  const stacks = {}
  Object.keys(state && state.stacks ? state.stacks : {}).forEach(function(tuneId) {
    stacks[tuneId] = normalizeTuneStack(state.stacks[tuneId])
  })
  return {
    version: HISTORY_VERSION,
    stacks: stacks,
  }
}

function normalizePendingEntry(change) {
  return {
    tuneId: change.tuneId,
    label: change.label || 'Edit',
    before: cloneHistoryValue(change.before),
    after: cloneHistoryValue(change.after),
    meta: cloneHistoryValue(change.meta) || {},
    ts: typeof change.ts === 'number' ? change.ts : Date.now(),
  }
}

export function queuePendingTuneEdit(pendingEntries, change) {
  const nextPending = Object.assign({}, pendingEntries || {})
  const pending = nextPending[change.tuneId]
  if (pending) {
    nextPending[change.tuneId] = {
      tuneId: change.tuneId,
      label: change.label || pending.label || 'Edit',
      before: cloneHistoryValue(pending.before),
      after: cloneHistoryValue(change.after),
      meta: cloneHistoryValue(change.meta) || cloneHistoryValue(pending.meta) || {},
      ts: typeof pending.ts === 'number' ? pending.ts : Date.now(),
    }
    return nextPending
  }
  nextPending[change.tuneId] = normalizePendingEntry(change)
  return nextPending
}

function buildEntry(change) {
  return {
    id: 'history-' + change.tuneId + '-' + change.ts + '-' + Math.random().toString(36).slice(2, 8),
    ts: change.ts,
    label: change.label || 'Edit',
    before: cloneHistoryValue(change.before),
    after: cloneHistoryValue(change.after),
    meta: cloneHistoryValue(change.meta) || {},
  }
}

export function commitTuneHistoryEntry(state, change, maxEntries = DEFAULT_MAX_ENTRIES) {
  const normalized = normalizeTuneEditHistoryState(state)
  if (!change || !change.tuneId) return normalized
  if (historyValuesEqual(change.before, change.after)) return normalized

  const tuneId = change.tuneId
  const existing = normalizeTuneStack(normalized.stacks[tuneId])
  const baseEntries = existing.index < existing.entries.length - 1
    ? existing.entries.slice(0, existing.index + 1)
    : existing.entries.slice()
  baseEntries.push(buildEntry(normalizePendingEntry(change)))
  const prunedEntries = baseEntries.slice(-Math.max(1, maxEntries))

  normalized.stacks[tuneId] = {
    entries: prunedEntries,
    index: prunedEntries.length - 1,
  }
  return normalized
}

export function flushPendingTuneEdit(state, pendingEntries, tuneId, maxEntries = DEFAULT_MAX_ENTRIES) {
  if (!tuneId) {
    return {
      state: normalizeTuneEditHistoryState(state),
      pendingEntries: Object.assign({}, pendingEntries || {}),
      committed: null,
    }
  }
  const nextPending = Object.assign({}, pendingEntries || {})
  const pending = nextPending[tuneId]
  if (!pending) {
    return {
      state: normalizeTuneEditHistoryState(state),
      pendingEntries: nextPending,
      committed: null,
    }
  }
  delete nextPending[tuneId]
  return {
    state: commitTuneHistoryEntry(state, pending, maxEntries),
    pendingEntries: nextPending,
    committed: cloneHistoryValue(pending),
  }
}

export function pruneTuneEditHistoryState(state, validTuneIds, maxEntries = DEFAULT_MAX_ENTRIES) {
  const normalized = normalizeTuneEditHistoryState(state)
  const allowed = validTuneIds instanceof Set ? validTuneIds : null
  const nextStacks = {}

  Object.keys(normalized.stacks).forEach(function(tuneId) {
    if (allowed && !allowed.has(tuneId)) return
    const stack = normalizeTuneStack(normalized.stacks[tuneId])
    const entries = stack.entries.slice(-Math.max(1, maxEntries))
    if (entries.length === 0) return
    nextStacks[tuneId] = {
      entries: entries,
      index: Math.max(-1, Math.min(stack.index, entries.length - 1)),
    }
  })

  return {
    version: HISTORY_VERSION,
    stacks: nextStacks,
  }
}

function getTuneStack(state, tuneId) {
  const normalized = normalizeTuneEditHistoryState(state)
  return normalizeTuneStack(normalized.stacks[tuneId])
}

export function canUndoTuneEdit(state, tuneId) {
  const stack = getTuneStack(state, tuneId)
  return stack.index >= 0 && stack.entries.length > 0
}

export function canRedoTuneEdit(state, tuneId) {
  const stack = getTuneStack(state, tuneId)
  return stack.index < stack.entries.length - 1
}

export function getUndoTuneEditLabel(state, tuneId) {
  const stack = getTuneStack(state, tuneId)
  if (stack.index < 0 || !stack.entries[stack.index]) return ''
  return stack.entries[stack.index].label || ''
}

export function getRedoTuneEditLabel(state, tuneId) {
  const stack = getTuneStack(state, tuneId)
  const redoIndex = stack.index + 1
  if (redoIndex < 0 || !stack.entries[redoIndex]) return ''
  return stack.entries[redoIndex].label || ''
}

export function stepUndoTuneEdit(state, tuneId) {
  const normalized = normalizeTuneEditHistoryState(state)
  const stack = getTuneStack(normalized, tuneId)
  if (stack.index < 0 || !stack.entries[stack.index]) {
    return { state: normalized, entry: null }
  }
  const entry = cloneHistoryValue(stack.entries[stack.index])
  normalized.stacks[tuneId] = {
    entries: stack.entries,
    index: stack.index - 1,
  }
  return { state: normalized, entry: entry }
}

export function stepRedoTuneEdit(state, tuneId) {
  const normalized = normalizeTuneEditHistoryState(state)
  const stack = getTuneStack(normalized, tuneId)
  const redoIndex = stack.index + 1
  if (redoIndex < 0 || !stack.entries[redoIndex]) {
    return { state: normalized, entry: null }
  }
  const entry = cloneHistoryValue(stack.entries[redoIndex])
  normalized.stacks[tuneId] = {
    entries: stack.entries,
    index: redoIndex,
  }
  return { state: normalized, entry: entry }
}

export { DEFAULT_MAX_ENTRIES, HISTORY_VERSION, cloneHistoryValue, historyValuesEqual }
