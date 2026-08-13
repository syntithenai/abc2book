import { createChordMigrationConsole } from './chordMigrationConsole'
import { CHORD_READINESS_TAGS } from './tuneChordReadinessAudit'
import { clearWorkSession } from './chordReadinessWorkSession'

describe('chordMigrationConsole', function() {
  afterEach(function() {
    clearWorkSession()
  })
  test('tagOnly dry-run counts matching tunes', async function() {
    const saved = []
    const tunebook = {
      saveTune: function(tune) { saved.push(tune) },
      abcTools: null,
    }
    const tunes = {
      a: {
        id: 'a',
        name: 'Plain',
        books: ['songs'],
        words: ['hello'],
        voices: { '1': { notes: [] } },
      },
    }
    const api = createChordMigrationConsole({
      getTunebook: function() { return tunebook },
      getTunes: function() { return tunes },
    })
    const result = await api.tagOnly({ book: 'songs', dryRun: true })
    expect(result.tagged).toBe(1)
    expect(saved.length).toBe(0)
  })

  test('tagOnly saves tags when not dry-run', async function() {
    const saved = []
    const tunebook = {
      beginTunesBatchCommit: jest.fn(),
      commitTunesBatch: jest.fn(),
      saveTune: function(tune, _skip, opts) {
        saved.push({ tune: tune, opts: opts || {} })
      },
      abcTools: null,
    }
    const tunes = {
      a: {
        id: 'a',
        name: 'Plain',
        books: ['songs'],
        words: ['hello'],
        voices: { '1': { notes: [] } },
      },
    }
    const api = createChordMigrationConsole({
      getTunebook: function() { return tunebook },
      getTunes: function() { return tunes },
    })
    await api.tagOnly({ book: 'songs', dryRun: false })
    expect(saved.length).toBe(1)
    expect(saved[0].tune.tags).toContain(CHORD_READINESS_TAGS.NEEDS_SOURCE)
    expect(saved[0].opts.deferCommit).toBe(true)
    expect(tunebook.commitTunesBatch).toHaveBeenCalled()
  })

  test('auditAsync yields progress for each tune', async function() {
    const tunes = {
      a: { id: 'a', name: 'A', books: ['songs'], words: ['hello'], voices: { '1': { notes: [] } } },
      b: { id: 'b', name: 'B', books: ['songs'], words: ['world'], voices: { '1': { notes: [] } } },
    }
    const api = createChordMigrationConsole({
      getTunebook: function() { return null },
      getTunes: function() { return tunes },
    })
    const progress = []
    const report = await api.auditAsync({
      book: 'songs',
      onProgress: function(payload) { progress.push(payload.done) },
    })
    expect(report.summary.totalTunes).toBe(2)
    expect(progress).toEqual([1, 2])
  })

  test('tagOnly second batch skips tunes already tagged', async function() {
    const saved = {}
    const tunebook = {
      beginTunesBatchCommit: jest.fn(),
      commitTunesBatch: jest.fn(),
      saveTune: function(tune) {
        saved[tune.id] = tune
        tunes[tune.id] = tune
      },
      abcTools: null,
    }
    const tunes = {
      a: { id: 'a', name: 'A', books: ['songs'], words: ['hello'], voices: { '1': { notes: [] } } },
      b: { id: 'b', name: 'B', books: ['songs'], words: ['world'], voices: { '1': { notes: [] } } },
    }
    const api = createChordMigrationConsole({
      getTunebook: function() { return tunebook },
      getTunes: function() { return tunes },
    })
    const first = await api.tagOnly({ book: 'songs', limit: 1, dryRun: false })
    expect(first.tagged).toBe(1)
    expect(first.remaining).toBe(1)
    expect(saved.a || saved.b).toBeTruthy()

    const taggedId = saved.a ? 'a' : 'b'
    const second = await api.tagOnly({ book: 'songs', limit: 1, dryRun: false })
    expect(second.tagged).toBe(1)
    expect(second.remaining).toBe(0)
    expect(saved[taggedId === 'a' ? 'b' : 'a']).toBeTruthy()
  })

  test('tagOnly next batch reuses work session without rescanning', async function() {
    const saved = {}
    const tunebook = {
      beginTunesBatchCommit: jest.fn(),
      commitTunesBatch: jest.fn(),
      saveTune: function(tune) {
        saved[tune.id] = tune
        tunes[tune.id] = tune
      },
      abcTools: null,
    }
    const tunes = {
      a: { id: 'a', name: 'A', books: ['songs'], words: ['hello'], voices: { '1': { notes: [] } } },
      b: { id: 'b', name: 'B', books: ['songs'], words: ['world'], voices: { '1': { notes: [] } } },
      c: { id: 'c', name: 'C', books: ['songs'], words: ['again'], voices: { '1': { notes: [] } } },
    }
    const api = createChordMigrationConsole({
      getTunebook: function() { return tunebook },
      getTunes: function() { return tunes },
    })
    const progress = []
    await api.tagOnly({
      book: 'songs',
      limit: 1,
      dryRun: false,
      onProgress: function(payload) { progress.push(payload) },
    })
    expect(progress.some(function(payload) { return payload.phase === 'scan' })).toBe(true)
    progress.length = 0
    await api.tagOnly({
      book: 'songs',
      limit: 1,
      dryRun: false,
      onProgress: function(payload) { progress.push(payload) },
    })
    expect(progress.some(function(payload) { return payload.phase === 'scan' })).toBe(false)
    expect(progress.some(function(payload) { return payload.phase === 'process' })).toBe(true)
  })

  test('tagOnly processes multiple tunes sequentially with batch commit', async function() {
    const saved = []
    const tunebook = {
      beginTunesBatchCommit: jest.fn(),
      commitTunesBatch: jest.fn(),
      saveTune: function(tune) { saved.push(tune) },
      abcTools: null,
    }
    const tunes = {
      a: { id: 'a', name: 'A', books: ['songs'], words: ['hello'], voices: { '1': { notes: [] } } },
      b: { id: 'b', name: 'B', books: ['songs'], words: ['world'], voices: { '1': { notes: [] } } },
    }
    const api = createChordMigrationConsole({
      getTunebook: function() { return tunebook },
      getTunes: function() { return tunes },
    })
    const result = await api.tagOnly({ book: 'songs', limit: 0 })
    expect(result.tagged).toBe(2)
    expect(saved.length).toBe(2)
    expect(tunebook.commitTunesBatch).toHaveBeenCalledTimes(1)
  })
})
