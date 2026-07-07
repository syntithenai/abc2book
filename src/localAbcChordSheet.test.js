import useAbcTools from './useAbcTools'
import useAbcjsParser from './useAbcjsParser'
import { buildSheetLinesFromAbcTune, buildLocalAbcChordCandidate } from './localAbcChordSheet'

const SAMPLE_ABC = [
  'X:1',
  'T:Test Reel',
  'M:4/4',
  'L:1/8',
  'K:Am',
  '"Am" A2 eg a2 eg|"E" E2 G2 A2|',
].join('\n')

describe('localAbcChordSheet', function() {
  const abcTools = useAbcTools()
  const abcjsParser = useAbcjsParser()
  const renderChords = function(abc) { return abcjsParser.renderChords(abc, true) }

  test('buildSheetLinesFromAbcTune extracts embedded chord rows', function() {
    const tune = abcTools.abc2Tunebook(SAMPLE_ABC)[0]
    const sheetLines = buildSheetLinesFromAbcTune(SAMPLE_ABC, tune, abcTools, renderChords)
    expect(Array.isArray(sheetLines)).toBe(true)
    expect(sheetLines.length).toBeGreaterThan(0)
    expect(sheetLines.join(' ')).toMatch(/Am/)
  })

  test('buildLocalAbcChordCandidate returns chord search shape', function() {
    const tune = abcTools.abc2Tunebook(SAMPLE_ABC)[0]
    const candidate = buildLocalAbcChordCandidate(SAMPLE_ABC, tune, {
      title: 'Test Reel',
      source: 'local collection',
    }, abcTools, renderChords)
    expect(candidate).not.toBeNull()
    expect(candidate.chordText).toContain('Am')
    expect(candidate.sheetLines.length).toBeGreaterThan(0)
    expect(candidate.source).toBe('local collection')
  })

  test('returns null when abc has no embedded chords', function() {
    const plainAbc = [
      'X:1',
      'T:Plain',
      'M:4/4',
      'L:1/8',
      'K:G',
      'GABc d2|',
    ].join('\n')
    const tune = abcTools.abc2Tunebook(plainAbc)[0]
    expect(buildSheetLinesFromAbcTune(plainAbc, tune, abcTools, renderChords)).toBeNull()
  })
})
