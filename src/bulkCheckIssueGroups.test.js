import {
  buildBulkCheckIssueGroups,
  canRunFixAll,
  groupReportIssues,
} from './bulkCheckIssueGroups'

describe('bulkCheckIssueGroups', function() {
  const tunebook = {
    abcTools: {
      json2abc: function() { return 'X:1\nM:4/4\nK:C\n|: C D |' },
      hasChords: function() { return false },
    },
    hasNotesOrChords: function() { return false },
  }

  test('groups notation and abc record issues separately', function() {
    const report = {
      completenessResult: null,
      abcResult: {
        issues: [{ code: 'missing_key_header', message: 'Missing K:', severity: 'warning', field: 'key' }],
      },
      structureResult: {
        issues: [{ code: 'unmatched_repeat_start', message: 'Repeat start', severity: 'error', field: null }],
      },
      issues: [],
    }

    const grouped = groupReportIssues(report)
    expect(grouped.abcRecord.map(function(item) { return item.code })).toContain('missing_key_header')
    expect(grouped.notation.map(function(item) { return item.code })).toContain('unmatched_repeat_start')
  })

  test('offers search notation when melody is missing', function() {
    const tune = { id: 't1', name: 'Tune', voices: { '1': { notes: [] } } }
    const report = {
      completenessResult: {
        issues: [{ code: 'no_melody', message: 'No melody', field: 'voices' }],
      },
      abcResult: null,
      structureResult: null,
      issues: [{ code: 'no_melody', message: 'No melody', severity: 'error', field: 'voices' }],
    }

    const groups = buildBulkCheckIssueGroups(report, tune, tunebook, null)
    const notationGroup = groups.find(function(group) { return group.id === 'notation' })
    expect(notationGroup.actions.map(function(item) { return item.id })).toContain('searchAbc')
  })

  test('offers capitalise title for title_not_capitalized', function() {
    const tune = { id: 't1', name: 'wild rover', voices: { '1': { notes: ['C D |'] } } }
    const report = {
      completenessResult: null,
      abcResult: null,
      structureResult: null,
      issues: [{ code: 'title_not_capitalized', message: 'Title is not capitalised', severity: 'warning', field: 'name' }],
    }
    tunebook.hasNotesOrChords = function() { return true }

    const groups = buildBulkCheckIssueGroups(report, tune, tunebook, null)
    const otherGroup = groups.find(function(group) { return group.id === 'otherInfo' })
    expect(otherGroup.actions.map(function(item) { return item.id })).toContain('capitalizeTitle')
    expect(canRunFixAll(tune, report, tunebook, null)).toBe(true)
  })

  test('offers search actions for missing composer and background', function() {
    const tune = { id: 't1', name: 'Wild Rover', voices: { '1': { notes: ['C D |'] } } }
    const report = {
      completenessResult: null,
      abcResult: null,
      structureResult: null,
      issues: [{ code: 'missing_composer', message: 'Artist is missing', severity: 'warning', field: 'composer' }],
    }
    tunebook.hasNotesOrChords = function() { return true }

    const groups = buildBulkCheckIssueGroups(report, tune, tunebook, null)
    const otherGroup = groups.find(function(group) { return group.id === 'otherInfo' })
    expect(otherGroup.actions.map(function(item) { return item.id })).toContain('searchArtist')
    expect(otherGroup.actions.map(function(item) { return item.id })).toContain('backgroundInfo')
    expect(groups.find(function(group) { return group.id === 'chordsLyrics' })).toBeUndefined()
  })

  test('offers abc fixes for parse failure', function() {
    const tune = { id: 't1', name: 'Tune', meter: '4/4', key: 'C', voices: { '1': { notes: ['broken |'] } } }
    const report = {
      completenessResult: null,
      abcResult: {
        issues: [{ code: 'parse_failure', message: 'ABC failed to parse', severity: 'error', field: 'voices' }],
      },
      structureResult: null,
      issues: [{ code: 'parse_failure', message: 'ABC failed to parse', severity: 'error', field: 'voices' }],
    }
    tunebook.hasNotesOrChords = function() { return true }

    const groups = buildBulkCheckIssueGroups(report, tune, tunebook, null)
    const abcGroup = groups.find(function(group) { return group.id === 'abcRecord' })
    expect(abcGroup.actions.map(function(item) { return item.id })).toContain('searchAbc')
  })

  test('shows missing background with search button on orange tunes', function() {
    const tune = {
      id: 't1',
      name: 'wild rover',
      composer: 'Traditional',
      tempo: 120,
      meter: '4/4',
      key: 'D',
      backgroundInfo: '',
      words: ['Lyrics'],
      timingScaffold: true,
      voices: { '1': { notes: ['"C" z z z |'] } },
    }
    const report = {
      completenessResult: null,
      abcResult: null,
      structureResult: null,
      issues: [
        { code: 'title_not_capitalized', message: 'Title is not capitalised', severity: 'warning', field: 'name' },
        { code: 'missing_background', message: 'Background information is missing', severity: 'info', field: 'backgroundInfo' },
      ],
      optionalGaps: [
        { code: 'missing_background', message: 'Background information is missing', severity: 'info', field: 'backgroundInfo' },
      ],
    }
    tunebook.hasNotesOrChords = function() { return true }

    const groups = buildBulkCheckIssueGroups(report, tune, tunebook, null)
    const otherGroup = groups.find(function(group) { return group.id === 'otherInfo' })
    expect(otherGroup.issues.some(function(item) { return item.code === 'missing_background' })).toBe(true)
    expect(otherGroup.actions.map(function(item) { return item.id })).toContain('backgroundInfo')
  })

  test('offers link scan and edit actions', function() {
    const tune = {
      id: 't1',
      name: 'Wild Rover',
      links: [{ link: 'https://example.com/audio.mp3' }],
      voices: { '1': { notes: ['C D |'] } },
    }
    const report = {
      completenessResult: null,
      abcResult: null,
      structureResult: null,
      issues: [
        { code: 'no_links', message: 'No playback links', severity: 'warning', field: 'links' },
        { code: 'link_region_0', message: 'Link 1 region not scanned', severity: 'info', field: 'links' },
        { code: 'link_failure_1', message: 'Link 2 failed', severity: 'error', field: 'links' },
      ],
    }
    tunebook.hasNotesOrChords = function() { return true }

    const groups = buildBulkCheckIssueGroups(report, tune, tunebook, null)
    const linksGroup = groups.find(function(group) { return group.id === 'links' })
    expect(linksGroup.actions.map(function(item) { return item.id })).toContain('editTuneLinks')
    expect(linksGroup.actions.some(function(item) {
      return item.id === 'scanLinkRegion' && item.linkIndex === 0
    })).toBe(true)
    expect(canRunFixAll(tune, report, tunebook, null)).toBe(false)
  })

  test('offers collapse empty repeat bar fix for empty bar between repeat marks', function() {
    const tune = {
      id: 't1',
      name: 'Repeat Gap',
      meter: '4/4',
      key: 'C',
      voices: { '1': { notes: ['A2 B2 c2 d2 | e2 f2 g2 a2 :| | |: b2 c\'2 d\'2 e\'2 |]'] } },
    }
    const report = {
      completenessResult: null,
      abcResult: null,
      structureResult: {
        issues: [
          { code: 'empty_bar', message: 'Empty bars with no notes or rests: bar 10', severity: 'warning', field: 'voices' },
          { code: 'repeat_style_mixed', message: 'Mixed repeat styles (:: and :| |:) in the same tune', severity: 'info', field: null },
        ],
      },
      issues: [
        { code: 'empty_bar', message: 'Empty bars with no notes or rests: bar 10', severity: 'warning', field: 'voices' },
        { code: 'repeat_style_mixed', message: 'Mixed repeat styles (:: and :| |:) in the same tune', severity: 'info', field: null },
      ],
    }
    tunebook.hasNotesOrChords = function() { return true }

    const groups = buildBulkCheckIssueGroups(report, tune, tunebook, null)
    const notationGroup = groups.find(function(group) { return group.id === 'notation' })
    expect(notationGroup.actions.map(function(item) { return item.id })).toContain('collapseEmptyRepeatBars')
    expect(canRunFixAll(tune, report, tunebook, null)).toBe(true)
  })

  test('canRunFixAll is false when tune is complete', function() {
    const tune = {
      id: 't1',
      name: 'Wild Rover',
      composer: 'Traditional',
      backgroundInfo: 'A song',
      meter: '4/4',
      key: 'D',
      timingScaffold: true,
      voices: { '1': { notes: ['z z z z |'] } },
    }
    const report = {
      completenessResult: null,
      abcResult: null,
      structureResult: null,
      issues: [],
    }
    tunebook.hasNotesOrChords = function() { return true }

    expect(canRunFixAll(tune, report, tunebook, null)).toBe(false)
  })
})
