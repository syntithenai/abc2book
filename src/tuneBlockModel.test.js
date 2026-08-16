import { blocksFromLyricLines, blocksFromTune, CHORD_MODES, mergeBlockSources } from './tuneBlockModel'
import { assessTuneBlockStructure, recommendationLabel } from './tuneBlockQualityAssessment'
import { DOUBLE_SPACED_VERSE_WITH_SECTIONS, HYMN_SINGLE_LINE_VERSES } from './importSampleFixtures'
import { lyricLinesForChecks, lyricLinesForViews, displayEnrichmentChangesLyrics } from './tuneDisplayLayers'
import { anchorsFromCowPair, anchorsFromChordProLine } from './inlineChordTimingUtils'

describe('tuneBlockModel', function() {
  test('blocksFromLyricLines groups double-spaced import', function() {
    const blocks = blocksFromLyricLines(DOUBLE_SPACED_VERSE_WITH_SECTIONS)
    expect(blocks.length).toBe(3)
    expect(blocks[0].lyricLines.length).toBe(4)
    expect(blocks[1].type).toBe('chorus')
  })

  test('blocksFromTune does not warn when song revisits share three strains', function() {
    const tune = {
      id: 'appetite',
      name: 'Appetite',
      composer: 'Steve Ryan',
      voices: {
        '1': {
          notes: [
            'zzzzzzzz | zzzzzzzz | zzzzzzzz | zzzzzzzz ||',
            'zzzzzzzz | zzzzzzzz | zzzzzzzz | zzzzzzzz ||',
            'zzzzzzzz | zzzzzzzz | zzzzzzzz | zzzzzzzz ||',
          ],
        },
      },
      words: [
        '# VERSE', 'verse one',
        '',
        '# CHORUS', 'chorus one',
        '',
        '# VERSE', 'verse two',
        '',
        '# BRIDGE', 'bridge',
        '',
        '# CHORUS',
      ],
    }
    const blocks = blocksFromTune(tune)
    expect(blocks.some(function(b) {
      return (b.warnings || []).indexOf('strain_lyric_count_mismatch') >= 0
    })).toBe(false)
  })

  test('mergeBlockSources attaches strain indices for hymn pattern', function() {
    const blocks = mergeBlockSources({
      lyricLines: HYMN_SINGLE_LINE_VERSES,
      strains: [{ index: 0 }, { index: 1 }, { index: 2 }],
    })
    expect(blocks.length).toBe(3)
    expect(blocks[0].strainIndex).toBe(0)
    expect(blocks[1].strainIndex).toBe(1)
    expect(blocks[2].strainIndex).toBe(2)
  })
})

describe('tuneBlockQualityAssessment', function() {
  test('recommends inline preserve when strain counts mismatch', function() {
    const blocks = blocksFromLyricLines(DOUBLE_SPACED_VERSE_WITH_SECTIONS)
    blocks.forEach(function(b) {
      b.warnings = ['strain_lyric_count_mismatch']
      b.chordMode = CHORD_MODES.GRID
      b.chordChart = 'G | C |'
    })
    const result = assessTuneBlockStructure(blocks, { strainCount: 2 })
    expect(result.recommendation).toBe('inline_preserve')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(recommendationLabel(result.recommendation)).toContain('inline')
  })
})

describe('tuneDisplayLayers', function() {
  test('display enrichment expands header-only repeats', function() {
    const tune = {
      words: [
        '[Verse 1]', 'first verse words', '',
        '# Chorus', 'chorus line one', 'chorus line two', '',
        '[Verse 2]', 'second verse words', '',
        '# Chorus',
      ],
    }
    expect(displayEnrichmentChangesLyrics(tune)).toBe(true)
    expect(lyricLinesForViews(tune).join('\n')).toContain('chorus line one')
  })
})

describe('inlineChordTimingUtils', function() {
  test('anchorsFromCowPair maps chords to lyric words', function() {
    const anchors = anchorsFromCowPair('Am              F', 'The language of love')
    expect(anchors.length).toBe(2)
    expect(anchors[0].chord).toBe('Am')
    expect(anchors[0].wordIndex).toBe(0)
    expect(anchors[1].wordIndex).toBeGreaterThan(anchors[0].wordIndex)
  })

  test('anchorsFromChordProLine maps inline markers', function() {
    const anchors = anchorsFromChordProLine('The sad , [Am]little [C]bird.')
    expect(anchors.length).toBe(2)
    expect(anchors[0].chord).toBe('Am')
    expect(anchors[1].chord).toBe('C')
  })
})
