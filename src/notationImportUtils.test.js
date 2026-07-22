import { applyNotationTuneMeta, importedTuneFromNotationCandidate } from './notationImportUtils'

describe('notationImportUtils', function() {
  const USER_REEL_BODY = '|:"Am"E2A2 ABcd|e2d2 c2A2|"G"B2G2 GFGA|"Em"B2AG E2D2|! "Am"E2A2 ABcd|'
  let lastAbcInput = ''

  const abcTools = {
    abc2json: function(abc) {
      lastAbcInput = abc
      return {
        name: 'From Abc',
        composer: '',
        rhythm: 'march',
        meter: '4/4',
        key: 'Dmajor',
        voices: { '1': { meta: '', notes: ['GAB'] } },
        aliases: [],
        links: [],
        meta: {},
        backgroundInfo: '',
      }
    },
  }

  beforeEach(function() {
    lastAbcInput = ''
  })

  test('applyNotationTuneMeta merges session metadata fields', function() {
    const tune = abcTools.abc2json('X:1\nK:D\n')
    applyNotationTuneMeta(tune, {
      name: 'Snow On The Tracks',
      composer: 'Rachel Darling',
      rhythm: 'march',
      srcUrl: 'https://thesession.org/tunes/21706',
      aliases: ['Snow'],
      backgroundInfo: 'Composer note',
      links: [{ link: 'https://thesession.org/tunes/21706', name: 'The Session' }],
      meta: { thesession_tune_id: ['21706'] },
    })

    expect(tune.name).toBe('Snow On The Tracks')
    expect(tune.composer).toBe('Rachel Darling')
    expect(tune.srcUrl).toBe('https://thesession.org/tunes/21706')
    expect(tune.aliases).toEqual(['Snow'])
    expect(tune.backgroundInfo).toBe('Composer note')
    expect(tune.links).toHaveLength(1)
    expect(tune.meta.thesession_tune_id).toEqual(['21706'])
  })

  test('importedTuneFromNotationCandidate applies tuneMeta from candidate', function() {
    const imported = importedTuneFromNotationCandidate(abcTools, 'X:1\nK:D\n', {
      tuneMeta: {
        composer: 'Rachel Darling',
        name: 'Snow On The Tracks',
      },
    })
    expect(imported.composer).toBe('Rachel Darling')
    expect(imported.name).toBe('Snow On The Tracks')
  })

  test('importedTuneFromNotationCandidate normalizes Session line breaks before abc2json', function() {
    importedTuneFromNotationCandidate(abcTools, USER_REEL_BODY, null)
    expect(lastAbcInput).toContain('E2D2|\n "Am"E2A2')
    expect(lastAbcInput).not.toContain('|!')
  })
})
