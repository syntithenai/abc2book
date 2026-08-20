import fs from 'fs'
import path from 'path'
import useAbcTools from './useAbcTools'
import useAbcjsParser from './useAbcjsParser'
import {
  applyChordReadinessFixes,
  applyChordReadinessTags,
  auditTunesChordReadiness,
  CHORD_READINESS_STATUSES,
  CHORD_READINESS_TAGS,
  classifyChordReadiness,
  isDisplayChordReady,
  tuneInSongBook,
} from './tuneChordReadinessAudit'

const USER_WINE_SONG = path.join('/home/stever/Downloads/Wine Song.json')

function tools() {
  const abcTools = useAbcTools()
  const abcjsParser = useAbcjsParser()
  return {
    abcTools: abcTools,
    abcjsParser: abcjsParser,
    hasChords: function(abcText) {
      return /"[^"]+"/.test(String(abcText || ''))
    },
    renderChords: function(abcText, dots) {
      return abcjsParser.renderChords(abcText, dots)
    },
  }
}

function baseSongTune(overrides) {
  return Object.assign({
    id: 'test-song-1',
    name: 'Test Song',
    books: ['songs'],
    meter: '4/4',
    key: 'C',
    tempo: 120,
    noteLength: '1/8',
    voices: { '1': { notes: [] } },
    words: ['Line one', 'Line two'],
    tags: [],
  }, overrides || {})
}

describe('tuneChordReadinessAudit', function() {
  test('tuneInSongBook matches books case-insensitively', function() {
    expect(tuneInSongBook({ books: ['Songs'] }, 'songs')).toBe(true)
    expect(tuneInSongBook({ books: ['tunes'] }, 'songs')).toBe(false)
  })

  test('classifies lyrics without chords as needs-source', function() {
    const tune = baseSongTune({
      words: ['Verse one', 'Verse two'],
      voices: { '1': { notes: ['z z z z |'] } },
    })
    const row = classifyChordReadiness(tune, tools())
    expect(row.status).toBe(CHORD_READINESS_STATUSES.LYRICS_NO_CHORDS)
    expect(row.tags).toContain(CHORD_READINESS_TAGS.NEEDS_SOURCE)
  })

  test('classifies inline-only lyrics', function() {
    const tune = baseSongTune({
      words: ['[C]Verse one', '[G]Verse two'],
      voices: { '1': { notes: ['z z z z |'] } },
    })
    const row = classifyChordReadiness(tune, tools())
    expect(row.status).toBe(CHORD_READINESS_STATUSES.INLINE_ONLY)
    expect(row.tags).toContain(CHORD_READINESS_TAGS.INLINE_ONLY)
    expect(row.suggestedFixes).not.toContain('gridMerge')
    expect(row.displayReady).toBe(true)
    expect(row.renderMode).toBe('passthrough_chordpro')
  })

  test('does not suggest gridMerge for COW chord rows', function() {
    const tune = baseSongTune({
      words: ['C G Am', 'Hello world'],
      voices: { '1': { notes: ['"C" z z z z |'] } },
    })
    const row = classifyChordReadiness(tune, tools())
    expect(row.suggestedFixes).not.toContain('gridMerge')
  })

  test('applyChordReadinessFixes skips forced gridMerge on inline tune', function() {
    const tune = baseSongTune({
      words: ['[C]Verse one', '[G]Verse two'],
      voices: { '1': { notes: ['"C" z z z z |'] } },
    })
    const result = applyChordReadinessFixes(tune, null, Object.assign({}, tools(), {
      dryRun: true,
      fixes: ['gridMerge'],
    }))
    expect(result.applied).toHaveLength(0)
    expect(result.skipped).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'gridMerge', reason: 'embedded_chords_passthrough' }),
    ]))
  })

  test('classifies scaffold incomplete when timingScaffold has no chord symbols', function() {
    const tune = baseSongTune({
      timingScaffold: true,
      words: ['[C]Verse one'],
      voices: { '1': { notes: ['z z z z |'] } },
    })
    const row = classifyChordReadiness(tune, tools())
    expect(row.status).toBe(CHORD_READINESS_STATUSES.SCAFFOLD_INCOMPLETE)
    expect(row.tags).toContain(CHORD_READINESS_TAGS.SCAFFOLD_INCOMPLETE)
  })

  test('classifies ABC with embedded chords as ready', function() {
    const tune = baseSongTune({
      words: ['Verse one', 'Verse two'],
      voices: { '1': { notes: ['"C" z z z z | "G" z z z z |'] } },
    })
    const row = classifyChordReadiness(tune, tools())
    expect(row.status).toBe(CHORD_READINESS_STATUSES.READY)
    expect(row.tags).toContain(CHORD_READINESS_TAGS.READY)
    expect(row.displayReady).toBe(false)
    expect(row.renderMode).toBe('plain')
    expect(isDisplayChordReady(tune, tools())).toBe(false)
  })

  test('classifies melody without embedded chords', function() {
    const tune = baseSongTune({
      words: ['Verse one'],
      voices: { '1': { notes: ['C2 D2 E2 G2 |'] } },
    })
    const row = classifyChordReadiness(tune, tools())
    expect(row.status).toBe(CHORD_READINESS_STATUSES.MELODY_NO_CHORDS)
    expect(row.tags).toContain(CHORD_READINESS_TAGS.MELODY_NO_CHORDS)
  })

  test('applyChordReadinessTags replaces prior chords:* tags', function() {
    const tune = baseSongTune({ tags: ['chords:inline-only', 'set'] })
    const next = applyChordReadinessTags(tune, {
      tags: [CHORD_READINESS_TAGS.READY],
    })
    expect(next.tags).toEqual(['set', CHORD_READINESS_TAGS.READY])
  })

  test('applyChordReadinessFixes dry-run does not require save', function() {
    const tune = baseSongTune({
      timingScaffold: true,
      words: ['[C]Hello'],
      voices: { '1': { notes: ['"C" z z z z |'] } },
    })
    const classification = classifyChordReadiness(tune, tools())
    const result = applyChordReadinessFixes(tune, classification, Object.assign({}, tools(), {
      dryRun: true,
      fixes: ['syncLabels'],
    }))
    expect(result.dryRun).toBe(true)
  })

  test('auditTunesChordReadiness summarizes by status', function() {
    const tunes = [
      baseSongTune({ id: 'a', voices: { '1': { notes: ['"C" z z z z |'] } } }),
      baseSongTune({ id: 'b', words: ['plain'], voices: { '1': { notes: [] } } }),
    ]
    const report = auditTunesChordReadiness(tunes, tools())
    expect(report.summary.totalTunes).toBe(2)
    expect(report.summary.byStatus[CHORD_READINESS_STATUSES.READY]).toBe(1)
    expect(report.summary.byStatus[CHORD_READINESS_STATUSES.LYRICS_NO_CHORDS]).toBe(1)
    expect(report.summary.displayReadyCount).toBe(0)
    expect(report.summary.byRenderMode.plain).toBe(2)
  })

  test('tags anacrusis double barline for review', function() {
    const tune = baseSongTune({
      words: ['Verse one'],
      voices: { '1': { notes: ['|:FG||"D"AFDF AFDF|'] } },
    })
    const row = classifyChordReadiness(tune, tools())
    expect(row.tags).toContain(CHORD_READINESS_TAGS.ANACRUSIS_REVIEW)
  })

  test('display-ready strain-mismatch tunes do not inflate needs work', function() {
    const tune = baseSongTune({
      id: 'strain-only',
      words: ['[C]Verse one', '[G]Verse two'],
      voices: { '1': { notes: ['"C" z z z z | "G" z z z z |'] } },
    })
    const row = classifyChordReadiness(tune, tools())
    const report = auditTunesChordReadiness([tune], tools())
    if (row.tags.indexOf(CHORD_READINESS_TAGS.STRAIN_MISMATCH) >= 0 && row.displayReady) {
      expect(report.summary.needsWorkCount).toBe(0)
    }
  })

  test('Wine Song export classifies as structure-review or ready after fixes', function() {
    if (!fs.existsSync(USER_WINE_SONG)) return
    const tune = JSON.parse(fs.readFileSync(USER_WINE_SONG, 'utf8'))[0]
    tune.books = ['songs']
    const row = classifyChordReadiness(tune, tools())
    expect([
      CHORD_READINESS_STATUSES.READY,
      CHORD_READINESS_STATUSES.STRUCTURE_MISMATCH,
      CHORD_READINESS_STATUSES.INLINE_ONLY,
    ]).toContain(row.status)
    expect(row.tags.length).toBeGreaterThan(0)
  })
})
