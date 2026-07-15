import { commitChordSearchResultToTune } from './commitChordSearchResultToTune'

describe('commitChordSearchResultToTune', function() {
  test('parses chord text and merges via tunebook save', function() {
    const saved = []
    const tune = {
      id: 't1',
      name: 'Test Song',
      meter: '4/4',
      key: 'C',
      voices: { '1': { meta: '', notes: ['z4 |'] } },
      words: [],
      wLines: [],
      timingScaffold: true,
    }
    const abcTools = {
      abc2json: function() {
        return Object.assign({}, tune)
      },
      json2abc: function(t) {
        return 'X:1\nT:' + (t && t.name ? t.name : '') + '\nM:4/4\nK:C\nz4 |'
      },
      justNotes: function() {
        return 'z4 |'
      },
      emptyABC: function(name) {
        return 'X:1\nT:' + (name || '') + '\nM:4/4\nK:C\n'
      },
    }
    const tunebook = {
      abcTools: abcTools,
      saveTune: function(next, skip, options) {
        saved.push({ next: next, options: options })
        return next
      },
    }
    const abcjsParser = {
      renderChords: function() { return 'C | G |' },
      mergeChords: function(chords, abc) {
        return String(abc || '') + '\n' + String(chords || '')
      },
    }

    const result = commitChordSearchResultToTune({
      result: {
        chordText: '[Verse 1]\nC | G |\nhello world\n\n[Chorus]\nAm | F |\nchorus words',
        lyricLines: ['[Verse 1]', 'hello world', '', '[Chorus]', 'chorus words'],
      },
      tune: tune,
      tunebook: tunebook,
      abcjsParser: abcjsParser,
      updateLyrics: true,
    })

    expect(result.ok).toBe(true)
    expect(result.updateLyrics).toBe(true)
    expect(Array.isArray(result.lyricLines)).toBe(true)
    expect(saved.length).toBe(1)
    expect(saved[0].options.historyLabel).toBe('Search chords and lyrics')
  })

  test('fails when sheet text is empty', function() {
    const result = commitChordSearchResultToTune({
      result: { chordText: '' },
      tune: { id: 't1', name: 'X' },
      tunebook: { abcTools: {} },
      abcjsParser: {},
    })
    expect(result.ok).toBe(false)
  })
})
