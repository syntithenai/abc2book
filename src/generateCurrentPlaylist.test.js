import { buildRecentPlaylistTuneIds, generateCurrentPlaylist, CURRENT_PLAYLIST_TAG } from './generateCurrentPlaylist'
import { TUNE_VIEW_HISTORY_STORAGE_KEY } from './tuneViewHistoryStore'

function makeTune(id, name, books, tags, lastUpdated) {
  return { id, name, books: books || [], tags: tags || [], lastUpdated }
}

describe('generateCurrentPlaylist', function() {
  const tunebook = {
    hasNotesOrChords: function() { return true },
    hasLinks: function() { return true },
  }

  beforeEach(function() {
    localStorage.removeItem(TUNE_VIEW_HISTORY_STORAGE_KEY)
  })

  it('buildRecentPlaylistTuneIds picks matches from recent books/tags', function() {
    localStorage.setItem(TUNE_VIEW_HISTORY_STORAGE_KEY, JSON.stringify({
      r1: { lastViewed: 100, viewCount: 1 },
      r2: { lastViewed: 90, viewCount: 1 },
    }))
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
    localStorage.setItem(TUNE_VIEW_HISTORY_STORAGE_KEY, JSON.stringify({
      r1: { lastViewed: 100, viewCount: 1 },
    }))
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
