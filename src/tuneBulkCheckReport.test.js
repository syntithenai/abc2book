import {
  SEVERITY_BLUE,
  SEVERITY_GREEN,
  SEVERITY_ORANGE,
  SEVERITY_RED,
  buildTuneCheckReport,
  buildTuneCheckReports,
  classifyTuneSeverity,
  countIssuesInReports,
  hasTuneNotation,
  hasTuneTitle,
} from './tuneBulkCheckReport'

describe('tuneBulkCheckReport', function() {
  const hasChords = function(text) { return String(text).indexOf('"') !== -1 }

  test('classifies complete tune as green', function() {
    const tune = {
      id: 'ok',
      name: 'Good Tune',
      composer: 'Artist',
      tempo: 120,
      meter: '4/4',
      key: 'C',
      backgroundInfo: 'Some history',
      suitableFor: ['violin'],
      suitableForPractice: true,
      words: ['Line one'],
      timingScaffold: true,
      voices: { '1': { notes: ['"C" z z z |'] } },
    }
    const report = buildTuneCheckReport(tune, {
      hasChords: hasChords,
      hasNotesOrChords: function() { return true },
    })
    expect(report.severity).toBe(SEVERITY_GREEN)
    expect(report.issues).toHaveLength(0)
  })

  test('classifies missing title as red', function() {
    const tune = {
      id: 'x',
      name: '',
      voices: { '1': { notes: ['C D E |'] } },
      links: [{ link: 'https://example.com/a.mp3' }],
    }
    const report = buildTuneCheckReport(tune, { hasChords: hasChords })
    expect(report.severity).toBe(SEVERITY_RED)
  })

  test('classifies empty tune with no content as red', function() {
    const tune = { id: 'empty', name: 'Empty', voices: { '1': { notes: [] } } }
    const report = buildTuneCheckReport(tune, { hasChords: hasChords })
    expect(report.severity).toBe(SEVERITY_RED)
  })

  test('warns on missing tempo and composer as orange when otherwise usable', function() {
    const tune = {
      id: 'warn',
      name: 'Has Content',
      meter: '4/4',
      key: 'C',
      backgroundInfo: 'info',
      suitableFor: ['violin'],
      words: ['Lyrics'],
      timingScaffold: true,
      links: [{ link: 'https://example.com/a.mp3' }],
      voices: { '1': { notes: ['"C" z z z |'] } },
    }
    const report = buildTuneCheckReport(tune, {
      hasChords: hasChords,
      hasNotesOrChords: function() { return true },
    })
    expect(report.severity).toBe(SEVERITY_ORANGE)
    expect(report.issues.some(function(i) { return i.code === 'missing_tempo' })).toBe(true)
    expect(report.issues.some(function(i) { return i.code === 'missing_composer' })).toBe(true)
  })

  test('includes optional gaps in orange severity display issues', function() {
    const tune = {
      id: 'warn-bg',
      name: 'has content',
      composer: 'Artist',
      tempo: 120,
      meter: '4/4',
      key: 'C',
      backgroundInfo: '',
      suitableFor: ['violin'],
      words: ['Lyrics'],
      timingScaffold: true,
      links: [{ link: 'https://example.com/a.mp3' }],
      voices: { '1': { notes: ['"C" z z z |'] } },
    }
    const report = buildTuneCheckReport(tune, {
      hasChords: hasChords,
      hasNotesOrChords: function() { return true },
    })
    expect(report.severity).toBe(SEVERITY_ORANGE)
    expect(report.issues.some(function(i) { return i.code === 'title_not_capitalized' })).toBe(true)
    expect(report.issues.some(function(i) { return i.code === 'missing_background' })).toBe(true)
  })

  test('warns when title is not capitalised', function() {
    const tune = {
      id: 'case',
      name: 'roots down',
      composer: 'Artist',
      tempo: 120,
      meter: '4/4',
      key: 'C',
      backgroundInfo: 'info',
      suitableFor: ['violin'],
      words: ['Lyrics'],
      timingScaffold: true,
      links: [{ link: 'https://example.com/a.mp3' }],
      voices: { '1': { notes: ['"C" z z z |'] } },
    }
    const report = buildTuneCheckReport(tune, {
      hasChords: hasChords,
      hasNotesOrChords: function() { return true },
    })
    expect(report.severity).toBe(SEVERITY_ORANGE)
    expect(report.issues.some(function(i) { return i.code === 'title_not_capitalized' })).toBe(true)
  })

  test('warns when melody tune has no lyrics', function() {
    const tune = {
      id: 'melody-no-lyrics',
      name: 'Instrumental Tune',
      composer: 'Artist',
      tempo: 120,
      meter: '4/4',
      key: 'D',
      backgroundInfo: 'info',
      suitableFor: ['violin'],
      voices: { '1': { notes: ['D2 E2 F2 G2 | A2 B2 c2 d2 |]'] } },
    }
    const report = buildTuneCheckReport(tune, {
      hasChords: hasChords,
      hasNotesOrChords: function() { return true },
    })
    expect(report.issues.some(function(i) { return i.code === 'no_lyrics' })).toBe(true)
  })

  test('classifies only optional gaps as blue', function() {
    const tune = {
      id: 'blue',
      name: 'Blue Tune',
      composer: 'Artist',
      tempo: 100,
      meter: '4/4',
      key: 'C',
      backgroundInfo: '',
      suitableFor: [],
      words: ['Lyrics here'],
      timingScaffold: true,
      voices: { '1': { notes: ['"C" z z z |'] } },
    }
    const report = buildTuneCheckReport(tune, {
      hasChords: hasChords,
      hasNotesOrChords: function() { return true },
    })
    expect(report.severity).toBe(SEVERITY_BLUE)
    expect(report.issues.some(function(i) { return i.code === 'missing_background' })).toBe(true)
  })

  test('sorts reports red then orange then blue then green', function() {
    const tunes = [
      { id: 'g', name: 'Green', composer: 'A', tempo: 1, meter: '4/4', key: 'C', backgroundInfo: 'x', suitableFor: ['violin'], words: ['a'], timingScaffold: true, voices: { '1': { notes: ['"C" z |'] } } },
      { id: 'r', name: '', voices: { '1': { notes: [] } } },
      { id: 'o', name: 'Orange', meter: '4/4', key: 'C', words: ['a'], timingScaffold: true, voices: { '1': { notes: ['"C" z |'] } } },
    ]
    const reports = buildTuneCheckReports(tunes, { hasChords: hasChords, hasNotesOrChords: function(t) { return !!(t && t.words && t.words.length) } })
    expect(reports[0].severity).toBe(SEVERITY_RED)
    expect(reports[reports.length - 1].severity).toBe(SEVERITY_GREEN)
  })

  test('countIssuesInReports excludes green', function() {
    const reports = [
      { severity: SEVERITY_GREEN },
      { severity: SEVERITY_ORANGE },
    ]
    expect(countIssuesInReports(reports)).toBe(1)
  })

  test('hasTuneTitle and hasTuneNotation helpers', function() {
    expect(hasTuneTitle({ name: '  ' })).toBe(false)
    expect(hasTuneTitle({ name: 'Hi' })).toBe(true)
    expect(hasTuneNotation({ voices: { '1': { notes: ['C D E F |'] } } }, {})).toBe(true)
  })
})
