import { buildRecentPlaylistTuneIds, generateCurrentPlaylist, CURRENT_PLAYLIST_TAG } from './generateCurrentPlaylist'

function makeTune(id, name, books, tags, lastUpdated) {
  return { id, name, books: books || [], tags: tags || [], lastUpdated }
}

describe('generateCurrentPlaylist', function() {
  const tunebook = {
    hasNotesOrChords: function() { return true },
    hasLinks: function() { return true },
  }

  it('buildRecentPlaylistTuneIds picks matches from recent books/tags', function() {
    const tunes = {
      r1: makeTune('r1', 'Recent 1', ['Book A'], ['folk'], 100),
      r2: makeTune('r2', 'Recent 2', [], ['jig'], 90),
      m1: makeTune('m1', 'Match book', ['Book A'], [], 1),
      m2: makeTune('m2', 'Match tag', [], ['folk'], 1),
      m3: makeTune('m3', 'No match', ['Other'], ['waltz'], 0),
    }

    const ids = buildRecentPlaylistTuneIds(tunes, tunebook, 20)
    expect(ids.length).toBeGreaterThanOrEqual(2)
    expect(ids).not.toContain('m3')
    expect(ids).toContain('m1')
    expect(ids).toContain('m2')
  })

  it('generateCurrentPlaylist returns tune ids without mutating tags', function() {
    const tunes = {
      r1: makeTune('r1', 'Recent 1', ['Book A'], ['folk'], 100),
      m1: makeTune('m1', 'Match book', ['Book A'], [], 1),
      old: makeTune('old', 'Old playlist', [], [CURRENT_PLAYLIST_TAG], 1),
    }

    const result = generateCurrentPlaylist(tunebook, tunes, {
      forceRefresh: function() {},
    })

    expect(result.tag).toBe(CURRENT_PLAYLIST_TAG)
    expect(result.tuneIds.length).toBeGreaterThanOrEqual(1)
    expect(tunes.old.tags).toContain(CURRENT_PLAYLIST_TAG)
  })
})
