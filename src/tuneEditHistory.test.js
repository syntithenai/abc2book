import {
  canRedoTuneEdit,
  canUndoTuneEdit,
  commitTuneHistoryEntry,
  DEFAULT_MAX_ENTRIES,
  flushPendingTuneEdit,
  getRedoTuneEditLabel,
  getUndoTuneEditLabel,
  loadConfiguredMaxEntries,
  MAX_ENTRIES_HARD_CAP,
  MAX_ENTRIES_STORAGE_KEY,
  normalizeTuneEditHistoryState,
  pruneTuneEditHistoryState,
  queuePendingTuneEdit,
  saveConfiguredMaxEntries,
  stepRedoTuneEdit,
  stepUndoTuneEdit,
} from './tuneEditHistory'

function tune(id, name) {
  return {
    id: id,
    name: name,
    voices: { 0: { meta: '', notes: ['C D E F |'] } },
  }
}

describe('tuneEditHistory', function() {
  test('commits update entries and supports undo/redo', function() {
    let state = normalizeTuneEditHistoryState()
    state = commitTuneHistoryEntry(state, {
      tuneId: 'a',
      label: 'Edit title',
      before: tune('a', 'Before'),
      after: tune('a', 'After'),
      ts: 100,
    })

    expect(canUndoTuneEdit(state, 'a')).toBe(true)
    expect(getUndoTuneEditLabel(state, 'a')).toBe('Edit title')
    expect(canRedoTuneEdit(state, 'a')).toBe(false)

    const undone = stepUndoTuneEdit(state, 'a')
    expect(undone.entry.before.name).toBe('Before')
    expect(canUndoTuneEdit(undone.state, 'a')).toBe(false)
    expect(canRedoTuneEdit(undone.state, 'a')).toBe(true)
    expect(getRedoTuneEditLabel(undone.state, 'a')).toBe('Edit title')

    const redone = stepRedoTuneEdit(undone.state, 'a')
    expect(redone.entry.after.name).toBe('After')
    expect(canUndoTuneEdit(redone.state, 'a')).toBe(true)
    expect(canRedoTuneEdit(redone.state, 'a')).toBe(false)
  })

  test('coalesces pending typing edits by keeping first before and last after', function() {
    let pending = {}
    pending = queuePendingTuneEdit(pending, {
      tuneId: 'a',
      label: 'Edit',
      before: tune('a', 'One'),
      after: tune('a', 'Two'),
      ts: 100,
    })
    pending = queuePendingTuneEdit(pending, {
      tuneId: 'a',
      label: 'Edit',
      before: tune('a', 'Two'),
      after: tune('a', 'Three'),
      ts: 200,
    })

    const flushed = flushPendingTuneEdit(undefined, pending, 'a', 50)
    expect(flushed.committed.before.name).toBe('One')
    expect(flushed.committed.after.name).toBe('Three')
    expect(flushed.pendingEntries.a).toBeUndefined()
    expect(getUndoTuneEditLabel(flushed.state, 'a')).toBe('Edit')
  })

  test('new commit after undo truncates redo branch', function() {
    let state = normalizeTuneEditHistoryState()
    state = commitTuneHistoryEntry(state, {
      tuneId: 'a',
      label: 'First',
      before: tune('a', 'One'),
      after: tune('a', 'Two'),
      ts: 100,
    })
    state = commitTuneHistoryEntry(state, {
      tuneId: 'a',
      label: 'Second',
      before: tune('a', 'Two'),
      after: tune('a', 'Three'),
      ts: 200,
    })

    const undone = stepUndoTuneEdit(state, 'a')
    const branched = commitTuneHistoryEntry(undone.state, {
      tuneId: 'a',
      label: 'Third',
      before: tune('a', 'Two'),
      after: tune('a', 'Four'),
      ts: 300,
    })

    expect(canRedoTuneEdit(branched, 'a')).toBe(false)
    expect(getUndoTuneEditLabel(branched, 'a')).toBe('Third')
  })

  test('supports delete undo with null after snapshot', function() {
    let state = commitTuneHistoryEntry(undefined, {
      tuneId: 'a',
      label: 'Delete tune',
      before: tune('a', 'Delete me'),
      after: null,
      ts: 100,
      meta: {
        tombstoneBefore: null,
        tombstoneAfter: { id: 'a', deletedAt: 100 },
      },
    })

    const undone = stepUndoTuneEdit(state, 'a')
    expect(undone.entry.after).toBeNull()
    expect(undone.entry.before.name).toBe('Delete me')
    expect(undone.entry.meta.tombstoneAfter.id).toBe('a')
  })

  test('supports create undo with null before snapshot', function() {
    let state = commitTuneHistoryEntry(undefined, {
      tuneId: 'a',
      label: 'Create tune',
      before: null,
      after: tune('a', 'New tune'),
      ts: 100,
    })

    const undone = stepUndoTuneEdit(state, 'a')
    expect(undone.entry.before).toBeNull()
    expect(undone.entry.after.name).toBe('New tune')
  })

  test('prunes stacks to the configured maximum and valid tune ids', function() {
    let state = normalizeTuneEditHistoryState()
    state = commitTuneHistoryEntry(state, {
      tuneId: 'a',
      label: 'One',
      before: tune('a', '1'),
      after: tune('a', '2'),
      ts: 100,
    }, 5)
    state = commitTuneHistoryEntry(state, {
      tuneId: 'a',
      label: 'Two',
      before: tune('a', '2'),
      after: tune('a', '3'),
      ts: 200,
    }, 5)
    state = commitTuneHistoryEntry(state, {
      tuneId: 'b',
      label: 'Other',
      before: tune('b', '1'),
      after: tune('b', '2'),
      ts: 300,
    }, 5)

    const pruned = pruneTuneEditHistoryState(state, new Set(['a']), 1)
    expect(Object.keys(pruned.stacks)).toEqual(['a'])
    expect(pruned.stacks.a.entries).toHaveLength(1)
    expect(pruned.stacks.a.entries[0].label).toBe('Two')
  })

  test('skips pruning when valid tune ids are not ready yet', function() {
    let state = commitTuneHistoryEntry(undefined, {
      tuneId: 'a',
      label: 'Edit',
      before: tune('a', 'Before'),
      after: tune('a', 'After'),
      ts: 100,
    })

    const skipped = pruneTuneEditHistoryState(state, null, 50)
    expect(Object.keys(skipped.stacks)).toEqual(['a'])
    expect(canUndoTuneEdit(skipped, 'a')).toBe(true)
  })

  test('prunes all stacks when allowed ids are empty after tunes are ready', function() {
    let state = commitTuneHistoryEntry(undefined, {
      tuneId: 'a',
      label: 'Edit',
      before: tune('a', 'Before'),
      after: tune('a', 'After'),
      ts: 100,
    })

    const pruned = pruneTuneEditHistoryState(state, new Set(), 50)
    expect(Object.keys(pruned.stacks)).toEqual([])
  })

  test('loadConfiguredMaxEntries reads and clamps local storage', function() {
    localStorage.removeItem(MAX_ENTRIES_STORAGE_KEY)
    expect(loadConfiguredMaxEntries()).toBe(DEFAULT_MAX_ENTRIES)

    localStorage.setItem(MAX_ENTRIES_STORAGE_KEY, '120')
    expect(loadConfiguredMaxEntries()).toBe(120)

    localStorage.setItem(MAX_ENTRIES_STORAGE_KEY, String(MAX_ENTRIES_HARD_CAP + 50))
    expect(loadConfiguredMaxEntries()).toBe(MAX_ENTRIES_HARD_CAP)

    expect(saveConfiguredMaxEntries(75)).toBe(75)
    expect(localStorage.getItem(MAX_ENTRIES_STORAGE_KEY)).toBe('75')

    localStorage.removeItem(MAX_ENTRIES_STORAGE_KEY)
  })
})
