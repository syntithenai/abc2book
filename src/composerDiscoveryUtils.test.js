import {
  buildGoogleComposerSearchUrl,
  buildGoogleComposerSearchQuestion,
  buildComposerPickerCandidates,
  needsComposerDiscovery,
  parseTitleComposerHints,
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
    expect(question).toContain('Tell me who is the composer')
    expect(question).toContain('The Butterfly')
    expect(question).toContain('Traditional')
  })

  test('buildGoogleComposerSearchUrl encodes natural language query', function() {
    const url = buildGoogleComposerSearchUrl('Wonderwall', 'Oasis')
    expect(url).toContain('google.com/search?q=')
    expect(decodeURIComponent(url)).toContain('Tell me who is the composer')
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
})
