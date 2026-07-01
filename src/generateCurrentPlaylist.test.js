import { generateCurrentPlaylist, CURRENT_PLAYLIST_TAG } from './generateCurrentPlaylist'

function makeTune(id, name, books, tags, lastUpdated) {
  return { id, name, books: books || [], tags: tags || [], lastUpdated }
}

describe('generateCurrentPlaylist', function() {
  it('clears existing tag, picks matches from recent books/tags, and sets filter', function() {
    const tunes = {
      r1: makeTune('r1', 'Recent 1', ['Book A'], ['folk'], 100),
      r2: makeTune('r2', 'Recent 2', [], ['jig'], 90),
      m1: makeTune('m1', 'Match book', ['Book A'], [], 1),
      m2: makeTune('m2', 'Match tag', [], ['folk'], 1),
      m3: makeTune('m3', 'No match', ['Other'], ['waltz'], 0),
      old: makeTune('old', 'Old playlist', [], [CURRENT_PLAYLIST_TAG], 1),
    }

    const removed = []
    const added = []
    const tunebook = {
      removeTunesFromTag: function(ids, tag) {
        removed.push({ ids: ids.slice(), tag })
        ids.forEach(function(id) {
          const tune = tunes[id]
          if (tune && Array.isArray(tune.tags)) {
            tune.tags = tune.tags.filter(function(t) { return t !== tag })
          }
        })
      },
      addTunesToTag: function(ids, tag) {
        added.push({ ids: ids.slice(), tag })
        ids.forEach(function(id) {
          const tune = tunes[id]
          if (tune) {
            tune.tags = Array.isArray(tune.tags) ? tune.tags.slice() : []
            if (tune.tags.indexOf(tag) === -1) tune.tags.push(tag)
          }
        })
      },
      indexes: {
        addTagToIndex: function() {},
        indexTune: function() {},
      },
    }

    let tagFilter = []
    let book = 'x'
    let filter = 'query'

    const result = generateCurrentPlaylist(tunebook, tunes, {
      setTagFilter: function(v) { tagFilter = v },
      setCurrentTuneBook: function(v) { book = v },
      setFilter: function(v) { filter = v },
      forceRefresh: function() {},
    })

    expect(removed[0].tag).toBe(CURRENT_PLAYLIST_TAG)
    expect(removed[0].ids).toContain('old')
    expect(result.tag).toBe(CURRENT_PLAYLIST_TAG)
    expect(result.count).toBeLessThanOrEqual(20)
    expect(result.count).toBeGreaterThanOrEqual(2)
    expect(tagFilter).toEqual([CURRENT_PLAYLIST_TAG])
    expect(book).toBe('')
    expect(filter).toBe('')
    expect(tunes.old.tags).not.toContain(CURRENT_PLAYLIST_TAG)
    added[0].ids.forEach(function(id) {
      expect(tunes[id].tags).toContain(CURRENT_PLAYLIST_TAG)
    })
    expect(added[0].ids).not.toContain('m3')
  })
})
