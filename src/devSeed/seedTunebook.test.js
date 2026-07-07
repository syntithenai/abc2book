import { seedSampleTunebook, clearSampleTunebook } from './seedTunebook'
import { SAMPLE_TUNEBOOK_ABC, SAMPLE_TUNE_IDS } from './sampleTunebookAbc'

// A lightweight stand-in for the real useTuneBook return value. It parses the
// sample ABC using the same X:/comment conventions the app relies on so the
// test exercises the real fixture, not a hand-built object.
function makeMockTunebook() {
  const calls = { setTunes: [], indexTunes: [], resets: [], hashes: [], refreshes: 0 }
  return {
    calls,
    abcTools: {
      abc2Tunebook: function(abc) {
        return String(abc)
          .split('X:')
          .filter(function(block) { return block.trim().length > 0 })
          .map(function(block) {
            const idMatch = block.match(/% abcbook-tune_id\s+(\S+)/)
            const bookMatch = block.match(/^B:(.+)$/m)
            const linkMatch = block.match(/% abcbook-link-0\s+(\S+)/)
            const composerMatch = block.match(/^C:(.+)$/m)
            const genreMatch = block.match(/^G:(.+)$/m)
            return {
              id: idMatch ? idMatch[1] : null,
              books: bookMatch ? [bookMatch[1].trim().toLowerCase()] : [],
              composer: composerMatch ? composerMatch[1].trim() : '',
              genre: genreMatch ? genreMatch[1].trim() : '',
              links: linkMatch ? [{ link: linkMatch[1] }] : [],
            }
          })
      },
    },
    createTune: function(tune) { return tune },
    setTunes: function(tunes) { calls.setTunes.push(tunes) },
    buildTunesHash: function(tunes) { calls.hashes.push(tunes) },
    forceRefresh: function() { calls.refreshes += 1 },
    indexes: {
      resetBookIndex: function() { calls.resets.push('books') },
      resetTagIndex: function() { calls.resets.push('tags') },
      resetGenreIndex: function() { calls.resets.push('genres') },
      resetArtistIndex: function() { calls.resets.push('artists') },
      indexTunes: function(tunes) { calls.indexTunes.push(tunes) },
    },
  }
}

describe('seedSampleTunebook', function() {
  test('parses the sample ABC and persists + indexes all sample tunes', function() {
    const tunebook = makeMockTunebook()
    const result = seedSampleTunebook(tunebook, {})

    const ids = Object.values(SAMPLE_TUNE_IDS)
    expect(Object.keys(result).sort()).toEqual(ids.slice().sort())
    expect(tunebook.calls.setTunes).toHaveLength(1)
    expect(tunebook.calls.indexTunes).toHaveLength(1)
    expect(tunebook.calls.resets).toEqual(expect.arrayContaining(['books', 'tags', 'genres', 'artists']))
    expect(tunebook.calls.refreshes).toBe(1)
  })

  test('includes a YouTube-linked tune (the playback repro case)', function() {
    const tunebook = makeMockTunebook()
    const result = seedSampleTunebook(tunebook, {})
    const amazingGrace = result[SAMPLE_TUNE_IDS.amazingGrace]
    expect(amazingGrace).toBeTruthy()
    expect(amazingGrace.links[0].link).toMatch(/youtube\.com/)
  })

  test('merges with existing tunes by default and replaces when asked', function() {
    const existing = { keepme: { id: 'keepme' } }

    const merged = seedSampleTunebook(makeMockTunebook(), existing)
    expect(merged.keepme).toBeTruthy()
    expect(merged[SAMPLE_TUNE_IDS.cooleys]).toBeTruthy()

    const replaced = seedSampleTunebook(makeMockTunebook(), existing, { replace: true })
    expect(replaced.keepme).toBeUndefined()
    expect(replaced[SAMPLE_TUNE_IDS.cooleys]).toBeTruthy()
  })

  test('abc option overrides the default sample ABC', function() {
    const tunebook = makeMockTunebook()
    const result = seedSampleTunebook(tunebook, {}, { abc: SAMPLE_TUNEBOOK_ABC })
    expect(Object.keys(result)).toHaveLength(Object.keys(SAMPLE_TUNE_IDS).length)
  })
})

describe('clearSampleTunebook', function() {
  test('removes only the seeded sample tunes', function() {
    const tunebook = makeMockTunebook()
    const withSamples = seedSampleTunebook(tunebook, { keepme: { id: 'keepme' } })

    const cleared = clearSampleTunebook(tunebook, withSamples)
    expect(cleared.keepme).toBeTruthy()
    Object.values(SAMPLE_TUNE_IDS).forEach(function(id) {
      expect(cleared[id]).toBeUndefined()
    })
  })
})
