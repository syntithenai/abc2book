import {
  allArtists,
  allTitles,
  mergeBibliographicList,
  normalizeBibliographicFields,
  primaryArtist,
  renderBibliographicComposerLines,
  renderBibliographicTitleLines,
  tuneMatchesArtistFilter,
} from './tuneBibliographicUtils'

describe('tuneBibliographicUtils', function() {
  test('primaryArtist prefers composer then first artists entry', function() {
    expect(primaryArtist({ composer: 'Trad', artists: ['Band'] })).toBe('Trad')
    expect(primaryArtist({ composer: '', artists: ['Band', 'Other'] })).toBe('Band')
    expect(primaryArtist({ composer: '  ', artists: [] })).toBe('')
  })

  test('allArtists and allTitles dedupe case-insensitively', function() {
    expect(allArtists({
      composer: 'Bob',
      artists: ['bob', 'Carol'],
    })).toEqual(['Bob', 'Carol'])

    expect(allTitles({
      name: 'Tune',
      aliases: ['TUNE', 'Alt'],
    })).toEqual(['Tune', 'Alt'])
  })

  test('mergeBibliographicList respects exclude keys', function() {
    expect(mergeBibliographicList(['Alt'], ['Tune', 'alt'], { tune: true })).toEqual(['Alt'])
  })

  test('normalizeBibliographicFields migrates legacy meta.T into aliases', function() {
    const tune = normalizeBibliographicFields({
      name: 'Main',
      composer: 'Writer',
      aliases: [],
      artists: [],
      meta: { T: ['Alias One', 'alias one'] },
    })

    expect(tune.aliases).toEqual(['Alias One'])
    expect(tune.meta.T).toBeUndefined()
    expect(tune.artists).toEqual([])
  })

  test('renderBibliographic lines emit multiple T and C headers', function() {
    const tune = {
      name: 'Main',
      aliases: ['Alt'],
      composer: 'Writer',
      artists: ['Band'],
    }
    expect(renderBibliographicTitleLines(tune)).toEqual(['T: Main', 'T: Alt'])
    expect(renderBibliographicComposerLines(tune)).toEqual(['C:Writer', 'C:Band'])
  })

  test('tuneMatchesArtistFilter matches composer or secondary artists', function() {
    const tune = { composer: 'Writer', artists: ['Band'] }
    expect(tuneMatchesArtistFilter(tune, [])).toBe(true)
    expect(tuneMatchesArtistFilter(tune, ['writer'])).toBe(true)
    expect(tuneMatchesArtistFilter(tune, ['Band'])).toBe(true)
    expect(tuneMatchesArtistFilter(tune, ['Other'])).toBe(false)
    expect(tuneMatchesArtistFilter({ composer: '', artists: [] }, ['Band'])).toBe(false)
  })
})
