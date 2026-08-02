import {
  detectEmbeddedChordsInText,
  sectionHasImportableChordContent,
  plainLyricLinesFromText,
  standardizeTextToChordProOnTune,
  createChordSheetNotationChunk,
  sectionTextForChunk,
  resolveTextSectionChunk,
  isLyricsChunkSourceResolved,
  analyzeTextForCompositionSelect,
} from './scratchpadCompositionChordImport'
import { listLyricSections } from './lyricStructureUtils'
import { blankNotationTune } from './scratchpadStore'

describe('scratchpadCompositionChordImport', function() {
  test('detectEmbeddedChordsInText finds ChordPro inline chords', function() {
    expect(detectEmbeddedChordsInText('Sing [Am]a song')).toBe(true)
    expect(detectEmbeddedChordsInText('Plain lyrics only')).toBe(false)
  })

  test('sectionHasImportableChordContent finds chord grid lines', function() {
    expect(sectionHasImportableChordContent('C | G | Am |')).toBe(true)
    expect(sectionHasImportableChordContent('Verse one\nVerse two')).toBe(false)
  })

  test('sectionHasImportableChordContent finds stacked chord lines', function() {
    expect(sectionHasImportableChordContent('C G Am\nSing along')).toBe(true)
  })

  test('plainLyricLinesFromText strips chord lines', function() {
    const lines = plainLyricLinesFromText('C G Am\nSing here')
    expect(lines.join('\n')).toBe('Sing here')
  })

  test('standardizeTextToChordProOnTune stores chordProSource', function() {
    const tune = blankNotationTune('t1', 'Test')
    const result = standardizeTextToChordProOnTune(tune, '{title: Test}\n[Am]Hello world')
    expect(result.ok).toBe(true)
    expect(result.tune.meta.chordProSource).toContain('[Am]')
    expect(result.tune.words.join('\n')).toContain('Hello')
  })

  test('createChordSheetNotationChunk returns chunk metadata', function() {
    const result = createChordSheetNotationChunk('C | G | Am |', {
      label: 'Verse chords',
      chordMode: 'chords-only',
    })
    expect(result.ok).toBe(true)
    expect(result.chunk.sourceKind).toBe('chord-sheet')
    expect(result.chunk.chordMode).toBe('chords-only')
  })

  test('sectionTextForChunk wholeItem returns full text body', function() {
    const item = {
      type: 'text',
      text: { body: 'Line one\nLine two\nLine three' },
    }
    const chunk = { sourceKind: 'text-section', wholeItem: true }
    expect(sectionTextForChunk(item, chunk)).toBe('Line one\nLine two\nLine three')
  })

  test('resolveTextSectionChunk finds section by stored marker after reorder', function() {
    const item = {
      type: 'text',
      text: { body: '[Chorus]\nSing loud\n\n# Verse\nLine one' },
    }
    const chunk = {
      sourceKind: 'text-section',
      sectionMarker: '# Verse',
      sectionIndex: 0,
    }
    const resolved = resolveTextSectionChunk(item, chunk)
    expect(resolved.resolved).toBe(true)
    expect(resolved.text).toContain('Line one')
    expect(resolved.sectionIndex).toBe(1)
  })

  test('resolveTextSectionChunk fails when section marker removed', function() {
    const item = {
      type: 'text',
      text: { body: 'Plain lyrics only' },
    }
    const chunk = {
      sourceKind: 'text-section',
      sectionMarker: '# Verse',
      sectionIndex: 0,
    }
    const resolved = resolveTextSectionChunk(item, chunk)
    expect(resolved.resolved).toBe(false)
    expect(isLyricsChunkSourceResolved(item, chunk)).toBe(false)
  })

  test('listLyricSections recognizes arbitrary markdown hash headers', function() {
    const sections = listLyricSections('# asdfasdf\nasdfasdf\n\n# bbbb\nsdfasdf')
    expect(sections.length).toBe(2)
    expect(sections[0].header).toBe('# asdfasdf')
    expect(sections[1].header).toBe('# bbbb')
  })

  test('analyzeTextForCompositionSelect detects chord-only charts', function() {
    const analysis = analyzeTextForCompositionSelect(
      'C . . F | G . |F | C\nG | F | F | Cm'
    )
    expect(analysis.isChordOnly).toBe(true)
    expect(analysis.hasChords).toBe(true)
    expect(analysis.hasLyrics).toBe(false)
  })

  test('analyzeTextForCompositionSelect detects alternating chord and lyric lines', function() {
    const analysis = analyzeTextForCompositionSelect('C G Am\nSing here\nF C G\nMore lyrics')
    expect(analysis.hasChords).toBe(true)
    expect(analysis.hasLyrics).toBe(true)
    expect(analysis.isChordOnly).toBe(false)
  })
})
