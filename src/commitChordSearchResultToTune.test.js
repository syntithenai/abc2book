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
      isNoteLine: function(line) {
        return /[A-Ga-gz]/.test(String(line || ''))
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

  test('skips ABC merge when tune already has real melody', function() {
    const saved = []
    const tune = {
      id: 't2',
      name: 'Melodic Song',
      meter: '4/4',
      key: 'C',
      voices: { '1': { meta: '', notes: ['C D E F |'] } },
      words: [],
      wLines: [],
    }
    const tunebook = {
      abcTools: {
        abc2json: function() { return Object.assign({}, tune) },
        json2abc: function() { return 'X:1\nT:Melodic Song\nM:4/4\nK:C\nC D E F |' },
        isNoteLine: function() { return true },
      },
      saveTune: function(next, skip, options) {
        saved.push({ next: next, options: options })
        return next
      },
    }
    const result = commitChordSearchResultToTune({
      result: {
        chordText: '[Verse]\nC | G |\nhello',
        lyricLines: ['[Verse]', 'hello'],
      },
      tune: tune,
      tunebook: tunebook,
      abcjsParser: { renderChords: function() { return 'C | G |' } },
    })
    expect(result.ok).toBe(true)
    expect(result.updateLyrics).toBe(true)
    expect(saved.length).toBe(1)
    expect(tune.voices['1'].notes).toEqual(['C D E F |'])
  })

  test('writes chords-over-words lyrics from sheetLines (not stripped plain lyrics)', function() {
    const saved = []
    const tune = {
      id: 't3',
      name: 'I Will',
      meter: '4/4',
      key: 'C',
      voices: { '1': { meta: '', notes: ['C D E F |'] } },
      words: [],
      wLines: [],
      meta: {},
    }
    const tunebook = {
      abcTools: {
        abc2json: function() { return Object.assign({}, tune) },
        json2abc: function() { return 'X:1\nT:I Will\nM:4/4\nK:C\nC D E F |' },
        isNoteLine: function() { return true },
      },
      saveTune: function(next, skip, options) {
        saved.push({ next: next, options: options })
        Object.keys(next).forEach(function(key) { tune[key] = next[key] })
        return next
      },
    }
    const result = commitChordSearchResultToTune({
      result: {
        sheetLines: [
          '[Verse]',
          'F             Dm',
          'Who knows how long',
          'G7            C',
          'I have been waiting',
        ],
        // Stripped plain lyrics must not win over embedded placement.
        lyricLines: ['[Verse]', 'Who knows how long', 'I have been waiting'],
        chordText: 'F | Dm |\nG7 | C |',
      },
      tune: tune,
      tunebook: tunebook,
      abcjsParser: { renderChords: function() { return 'F | Dm |' } },
      skipAbcMerge: true,
      updateLyrics: true,
    })

    expect(result.ok).toBe(true)
    const text = result.lyricLines.join('\n')
    expect(text).toContain('F             Dm')
    expect(text).toContain('Who knows how long')
    expect(text).toContain('G7            C')
    expect(result.lyricLines).not.toEqual([
      '[Verse]',
      'Who knows how long',
      'I have been waiting',
    ])
  })
})
