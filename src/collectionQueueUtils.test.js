import { getPlayableTuneIdsFromListRows } from './collectionQueueUtils'

function mockTunebook(overrides) {
  return Object.assign({
    hasNotesOrChords: function(tune) {
      return !!(tune && tune.hasNotes)
    },
    hasLinks: function(tune) {
      return !!(tune && tune.links && tune.links.length)
    },
  }, overrides || {})
}

describe('getPlayableTuneIdsFromListRows', function() {
  const tunes = {
    a1: { id: 'a1', hasNotes: true },
    a2: { id: 'a2', links: [{ url: 'x' }] },
    z1: { id: 'z1', hasNotes: true },
    orphan: { id: 'orphan', hasNotes: true },
    silent: { id: 'silent' },
  }
  const tunebook = mockTunebook()

  test('ungrouped list keeps filtered array order', function() {
    const filtered = [
      { id: 'z1' },
      { id: 'a1' },
      { id: 'silent' },
    ]
    expect(getPlayableTuneIdsFromListRows(filtered, tunes, tunebook, [])).toEqual(['z1', 'a1'])
  })

  test('grouped list follows on-screen group order', function() {
    const filtered = [
      { id: 'z1' },
      { id: 'a1' },
      { id: 'orphan' },
      { id: 'a2' },
    ]
    const grouped = {
      '': [2],
      Z: [0],
      A: [1, 3],
    }
    expect(getPlayableTuneIdsFromListRows(filtered, tunes, tunebook, [], {
      grouped: grouped,
      groupBy: 'boost',
    })).toEqual(['orphan', 'a1', 'a2', 'z1'])
  })

  test('selected ids follow on-screen order, not selection object order', function() {
    const filtered = [
      { id: 'z1' },
      { id: 'a1' },
      { id: 'orphan' },
      { id: 'a2' },
    ]
    const grouped = {
      '': [2],
      Z: [0],
      A: [1, 3],
    }
    expect(getPlayableTuneIdsFromListRows(filtered, tunes, tunebook, ['a1', 'orphan', 'z1'], {
      grouped: grouped,
      groupBy: 'boost',
    })).toEqual(['orphan', 'a1', 'z1'])
  })
})
