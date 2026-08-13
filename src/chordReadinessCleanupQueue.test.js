import {
  enqueueChordReadinessJob,
  getState,
  subscribe,
  setChordReadinessCleanupQueueContext,
  __resetForTests,
} from './chordReadinessCleanupQueue'
import { CHORD_READINESS_TAGS } from './tuneChordReadinessAudit'

describe('chordReadinessCleanupQueue', function() {
  afterEach(function() {
    __resetForTests()
  })

  test('runs tagOnly job in background with progress', async function() {
    const saved = []
    const tunebook = {
      beginTunesBatchCommit: jest.fn(),
      commitTunesBatch: jest.fn(),
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
    setChordReadinessCleanupQueueContext({
      getTunebook: function() { return tunebook },
      getTunes: function() { return tunes },
    })

    const progressEvents = []
    const unsub = subscribe(function(state) {
      const current = state.jobs.find(function(job) { return job.status === 'running' })
      if (current && current.progressDone > 0) {
        progressEvents.push(current.progressDone)
      }
    })

    enqueueChordReadinessJob({
      action: 'tagOnly',
      book: 'songs',
      limit: 1,
      dryRun: false,
    })

    await new Promise(function(resolve) {
      const timer = setInterval(function() {
        const state = getState()
        const done = state.jobs.some(function(job) { return job.status === 'done' })
        if (done) {
          clearInterval(timer)
          resolve()
        }
      }, 10)
    })

    unsub()
    expect(saved.length).toBe(1)
    expect(saved[0].tags).toContain(CHORD_READINESS_TAGS.NEEDS_SOURCE)
    expect(getState().lastBatchResult.result.tagged).toBe(1)
    expect(progressEvents.length).toBeGreaterThan(0)
  })

  test('tagOnly fails clearly when tunebook context is missing', async function() {
    setChordReadinessCleanupQueueContext({
      getTunebook: null,
      getTunes: function() { return {} },
    })

    enqueueChordReadinessJob({
      action: 'tagOnly',
      book: 'songs',
      limit: 1,
      dryRun: false,
    })

    await new Promise(function(resolve) {
      const timer = setInterval(function() {
        const state = getState()
        const job = state.jobs[0]
        if (job && (job.status === 'error' || job.status === 'done')) {
          clearInterval(timer)
          resolve()
        }
      }, 10)
    })

    const job = getState().jobs[0]
    expect(job.status).toBe('error')
    expect(job.error).toMatch(/tunebook\.saveTune is not available/)
  })

  test('audit counts songs when context is wired', async function() {
    const tunes = {
      a: {
        id: 'a',
        name: 'Plain',
        books: ['songs'],
        words: ['hello'],
        voices: { '1': { notes: [] } },
      },
      b: {
        id: 'b',
        name: 'Other',
        books: ['tunes'],
        words: ['hello'],
        voices: { '1': { notes: [] } },
      },
    }
    setChordReadinessCleanupQueueContext({
      getTunebook: function() { return { saveTune: function() {} } },
      getTunes: function() { return tunes },
    })

    enqueueChordReadinessJob({
      action: 'audit',
      book: 'songs',
    })

    await new Promise(function(resolve) {
      const timer = setInterval(function() {
        const state = getState()
        const done = state.jobs.some(function(job) { return job.status === 'done' })
        if (done) {
          clearInterval(timer)
          resolve()
        }
      }, 10)
    })

    const report = getState().lastAuditReport
    expect(report.summary.totalTunes).toBe(1)
  })
})
