import {
  DOUBLE_SPACED_VERSE_WITH_SECTIONS,
  HYMN_SINGLE_LINE_VERSES,
  LEGACY_MULTILINE_STANZAS,
  ASHOKAN_MULTI_CHART_SINGLE_VERSE,
  CHORDPRO_INLINE_SAMPLE,
  HEADER_BLANK_LYRICS,
  SONGS_DOUBLE_SPACED_CHORUS_LABEL,
  SONGS_TITLE_AS_FIRST_LINE,
  SONGS_TAB_ALIGNED_VERSE,
  SONGS_CHORD_ONLY_W_LINES,
  SONGS_TITLE_ARTIST_PREFACE,
} from './importSampleFixtures'
import { normalizeLyricStructure } from './lyricStructureUtils'
import { alignChordBlocksToLyrics, isLeadingTitleComposerLine } from './chordSheetUtils'
import { blocksFromLyricLines } from './tuneBlockModel'
import { critiqueBlocksAgainstLyrics } from './tuneBlockCorpusAudit'

describe('importSampleFixtures', function() {
  test('double-spaced verse with section headers groups correctly', function() {
    const blocks = normalizeLyricStructure(DOUBLE_SPACED_VERSE_WITH_SECTIONS)
    expect(blocks.length).toBe(3)
    expect(blocks[0].lines.length).toBe(4)
    expect(blocks[1].type).toBe('chorus')
    expect(blocks[2].header).toBe('[Verse 2]')
  })

  test('hymn single-line verses stay separate blocks', function() {
    const blocks = normalizeLyricStructure(HYMN_SINGLE_LINE_VERSES)
    expect(blocks.length).toBe(3)
    blocks.forEach(function(block) {
      expect(block.lines.length).toBe(1)
    })
  })

  test('legacy multiline stanzas preserve consecutive lines', function() {
    const blocks = normalizeLyricStructure(LEGACY_MULTILINE_STANZAS)
    expect(blocks[0].lines).toEqual(['line one', 'line two'])
    expect(blocks[2].lines).toEqual(['line three', 'line four'])
  })

  test('Ashokan pattern combines charts for one lyric block', function() {
    const aligned = alignChordBlocksToLyrics(
      ASHOKAN_MULTI_CHART_SINGLE_VERSE.lyrics,
      ASHOKAN_MULTI_CHART_SINGLE_VERSE.charts
    )
    expect(aligned.length).toBe(1)
    expect(aligned[0].chart).toContain('A')
    expect(aligned[0].chart).toContain('E')
  })

  test('header blank lyrics keep headers with body', function() {
    const blocks = normalizeLyricStructure(HEADER_BLANK_LYRICS)
    expect(blocks.length).toBe(2)
    expect(blocks[0].header).toBe('# Verse 1')
    expect(blocks[0].lines).toEqual(['first verse line'])
    expect(blocks[1].type).toBe('chorus')
  })

  test('songs double-spaced chorus label groups with following lines', function() {
    const blocks = normalizeLyricStructure(SONGS_DOUBLE_SPACED_CHORUS_LABEL)
    expect(blocks.some(function(block) { return block.type === 'chorus' })).toBe(true)
    const critique = critiqueBlocksAgainstLyrics(SONGS_DOUBLE_SPACED_CHORUS_LABEL, blocksFromLyricLines(SONGS_DOUBLE_SPACED_CHORUS_LABEL))
    expect(critique.ok).toBe(true)
  })

  test('songs title-as-first-line is not stripped from the opening stanza', function() {
    expect(isLeadingTitleComposerLine('Thula Mama', {
      title: 'Thula Mama',
      firstBlockLineCount: 3,
    })).toBe(false)
    const critique = critiqueBlocksAgainstLyrics(
      SONGS_TITLE_AS_FIRST_LINE,
      blocksFromLyricLines(SONGS_TITLE_AS_FIRST_LINE),
      { tuneName: 'Thula Mama' }
    )
    expect(critique.ok).toBe(true)
  })

  test('songs tab-aligned verse preserves words in block output', function() {
    const critique = critiqueBlocksAgainstLyrics(SONGS_TAB_ALIGNED_VERSE, blocksFromLyricLines(SONGS_TAB_ALIGNED_VERSE))
    expect(critique.ok).toBe(true)
  })

  test('songs chord-only rows attach to lyric blocks', function() {
    const blocks = blocksFromLyricLines(SONGS_CHORD_ONLY_W_LINES)
    expect(blocks.some(function(block) {
      return (block.lyricLines || []).some(function(line) { return line.indexOf('Never knew') >= 0 })
    })).toBe(true)
    const critique = critiqueBlocksAgainstLyrics(SONGS_CHORD_ONLY_W_LINES, blocks)
    expect(critique.ok).toBe(true)
  })

  test('songs title-artist preface is optional metadata', function() {
    const aligned = alignChordBlocksToLyrics(SONGS_TITLE_ARTIST_PREFACE, [], {
      title: 'Acid',
      composer: 'Charlotte Lyngbye',
    })
    const critique = critiqueBlocksAgainstLyrics(
      SONGS_TITLE_ARTIST_PREFACE,
      blocksFromLyricLines(SONGS_TITLE_ARTIST_PREFACE, { title: 'Acid', composer: 'Charlotte Lyngbye' }),
      { tuneName: 'Acid', composer: 'Charlotte Lyngbye' }
    )
    expect(aligned[0].lyricLines[0]).toBe('first real lyric line')
    expect(critique.ok).toBe(true)
  })
})
