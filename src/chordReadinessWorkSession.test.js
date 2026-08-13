import {
  buildWorkSessionKey,
  consumeWorkSessionBatch,
  exportWorkSession,
  loadWorkSession,
  setWorkSessionPendingIds,
  __resetWorkSessionForTests,
} from './chordReadinessWorkSession'

describe('chordReadinessWorkSession', function() {
  afterEach(function() {
    __resetWorkSessionForTests()
  })

  test('reuses pending ids across batches for the same session key', function() {
    const key = buildWorkSessionKey({ book: 'songs', dryRun: false }, 'tagOnly')
    setWorkSessionPendingIds(key, ['a', 'b', 'c'])
    const first = consumeWorkSessionBatch(key, 1, true)
    expect(first.batchIds).toEqual(['a'])
    expect(first.remaining).toBe(2)
    const second = consumeWorkSessionBatch(key, 1, true)
    expect(second.batchIds).toEqual(['b'])
    expect(exportWorkSession().sessions[key]).toEqual(['c'])
  })

  test('keeps separate queues for tag and apply sessions', function() {
    const tagKey = buildWorkSessionKey({ book: 'songs', dryRun: false }, 'tagOnly')
    const applyKey = buildWorkSessionKey({ book: 'songs', dryRun: false, includeMelody: false }, 'apply')
    setWorkSessionPendingIds(tagKey, ['a', 'b'])
    setWorkSessionPendingIds(applyKey, ['x'])
    expect(exportWorkSession().sessions[tagKey]).toEqual(['a', 'b'])
    expect(exportWorkSession().sessions[applyKey]).toEqual(['x'])
  })

  test('loads persisted multi-session state', function() {
    loadWorkSession({
      sessions: {
        'tagOnly|songs|live|||': ['a'],
      },
    })
    expect(exportWorkSession().sessions['tagOnly|songs|live|||']).toEqual(['a'])
  })
})
