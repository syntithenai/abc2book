import {
  buildGoogleComposerSearchUrl,
  buildGoogleComposerSearchQuestion,
  buildComposerPickerCandidates,
  buildTitleSuggestions,
  needsComposerDiscovery,
  parseTitleComposerHints,
  shouldOfferTitleSuggestion,
} from './composerDiscoveryUtils'

describe('composerDiscoveryUtils', function() {
  test('parseTitleComposerHints keeps explicit composer', function() {
    expect(parseTitleComposerHints('Wonderwall', 'Oasis', 'Wonderwall')).toEqual({
      title: 'Wonderwall',
      artistHint: 'Oasis',
      titleHint: 'Wonderwall',
    })
  })

  test('parseTitleComposerHints splits artist from title hint', function() {
    expect(parseTitleComposerHints('', '', 'Oasis - Wonderwall')).toEqual({
      title: 'Wonderwall',
      artistHint: 'Oasis',
      titleHint: 'Oasis - Wonderwall',
    })
  })

  test('parseTitleComposerHints splits artist from title field', function() {
    expect(parseTitleComposerHints('Beatles - Yesterday', '', '')).toEqual({
      title: 'Yesterday',
      artistHint: 'Beatles',
      titleHint: 'Beatles - Yesterday',
    })
  })

  test('needsComposerDiscovery treats generic artists as missing', function() {
    expect(needsComposerDiscovery('')).toBe(true)
    expect(needsComposerDiscovery('Traditional')).toBe(true)
    expect(needsComposerDiscovery('Oasis')).toBe(false)
  })

  test('buildGoogleComposerSearchQuestion uses natural language', function() {
    const question = buildGoogleComposerSearchQuestion('The Butterfly', 'Traditional')
    expect(question).toContain('Who composed')
    expect(question).toContain('artists have performed')
    expect(question).toContain('The Butterfly')
    expect(question).toContain('Traditional')
  })

  test('buildGoogleComposerSearchUrl encodes natural language query', function() {
    const url = buildGoogleComposerSearchUrl('Wonderwall', 'Oasis')
    expect(url).toContain('google.com/search?q=')
    expect(decodeURIComponent(url)).toContain('Who composed')
    expect(decodeURIComponent(url)).toContain('Wonderwall')
    expect(decodeURIComponent(url)).toContain('Oasis')
  })

  test('buildComposerPickerCandidates includes current value', function() {
    const candidates = buildComposerPickerCandidates({
      multiple: false,
      artist: 'Oasis',
      source: 'MusicBrainz',
    }, 'Traditional')
    expect(candidates.map(function(item) { return item.artist })).toEqual(['Traditional', 'Oasis'])
  })

  test('shouldOfferTitleSuggestion only for extremely close refinements', function() {
    expect(shouldOfferTitleSuggestion('Clair de Lune', 'clair de lune')).toBe(false)
    expect(shouldOfferTitleSuggestion('Claire de Lune', 'Clair de lune')).toBe(true)
    expect(shouldOfferTitleSuggestion('The Butterfly', 'Butterfly')).toBe(true)
    expect(shouldOfferTitleSuggestion('Wonderwall', "Don't Look Back in Anger")).toBe(false)
    expect(shouldOfferTitleSuggestion('Clair de Lune', 'Clair de Lune (easy)')).toBe(false)
  })

  test('buildTitleSuggestions keeps only extremely close titles', function() {
    const tunes = {
      a: { id: 'a', name: 'Clair de lune', composer: 'Debussy' },
      b: { id: 'b', name: 'Clair de Lune (easy)', composer: '' },
      c: { id: 'c', name: 'Wonderwall', composer: 'Oasis' },
    }
    function findTuneCandidates(query, tuneMap) {
      return Object.values(tuneMap)
        .filter(function(tune) {
          return String(tune.name || '').toLowerCase().indexOf('clair') >= 0
        })
        .map(function(tune) { return { tune: tune, score: 10 } })
    }
    const results = buildTitleSuggestions({
      currentTitle: 'Claire de Lune',
      musicBrainzTitle: 'Clair de lune',
      tunes: tunes,
      findTuneCandidates: findTuneCandidates,
      limit: 5,
    })
    expect(results.map(function(item) { return item.title })).toEqual([
      'Clair de lune',
    ])
    expect(results[0].source).toBe('MusicBrainz')
  })

  test('buildTitleSuggestions skips current title spelling', function() {
    expect(buildTitleSuggestions({
      currentTitle: 'Wonderwall',
      musicBrainzTitle: 'Wonderwall',
      tunes: {},
      findTuneCandidates: function() { return [] },
    })).toEqual([])
  })

  test('buildComposerPickerCandidates puts writers before performers', function() {
    const candidates = buildComposerPickerCandidates({
      multiple: true,
      candidates: [
        { artist: 'Oasis', role: 'performer', source: 'MusicBrainz/Genius', preview: 'Performer' },
        { artist: 'Noel Gallagher', role: 'writer', source: 'MusicBrainz', preview: 'Writer' },
        { artist: 'Ryan Adams', role: 'performer', source: 'MusicBrainz/Genius', preview: 'Performer' },
      ],
    }, '')
    expect(candidates.map(function(item) { return item.artist })).toEqual([
      'Noel Gallagher',
      'Oasis',
      'Ryan Adams',
    ])
    expect(candidates[0].role).toBe('writer')
    expect(candidates[0].source).toMatch(/Writer/)
    expect(candidates[1].role).toBe('performer')
  })

  test('SelectInput options dropdown class is wired for caret hide', function() {
    const path = require('path')
    const fs = require('fs')
    const src = fs.readFileSync(
      path.join(__dirname, 'components/SelectInput.js'),
      'utf8'
    )
    expect(src).toMatch(/className="select-input-options-dropdown"/)
    const css = fs.readFileSync(path.join(__dirname, 'App.css'), 'utf8')
    expect(css).toMatch(/\.select-input-options-dropdown\.dropdown-toggle::after/)
    expect(css).toMatch(/\.chip-list-options-dropdown\.dropdown-toggle::after/)
  })
})
