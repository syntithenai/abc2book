import {
  applyBarOperationToVoice,
  countVoiceBars,
  injectAbcBarNumbers,
  mergeBarEvents,
} from './scratchpadNotationBarUtils'
import {
  analyzeMergeNoteMismatches,
  applyScratchpadNotationMerge,
  buildDefaultVoiceMapping,
  needsVoiceMapping,
} from './scratchpadNotationMerge'

describe('scratchpadNotationBarUtils', function() {
  const metaTune = { meter: '4/4', noteLength: '1/8', key: 'C' }

  function compactNotes(text) {
    return String(text || '').replace(/\s+/g, '')
  }

  test('injectAbcBarNumbers adds barnumbers directive', function() {
    const abc = 'X:1\nM:4/4\nL:1/8\nK:C\nCDEF|'
    expect(injectAbcBarNumbers(abc)).toContain('%%barnumbers 1')
  })

  test('countVoiceBars counts pipe-delimited bars', function() {
    expect(countVoiceBars(['C D E F | G A B c |'], metaTune)).toBe(2)
  })

  test('parse places chord symbol on the following note', function() {
    const { parseVoiceEvents } = require('./notation/voiceEventModel')
    const events = parseVoiceEvents('a "Am"b c |', metaTune)
    const withAm = events.find(function(ev) {
      return ev.chordSymbols && ev.chordSymbols.indexOf('Am') >= 0
    })
    expect(withAm).toBeTruthy()
    expect(withAm.pitch && withAm.pitch.step).toBe('B')
  })

  test('combineDrawableEvents keeps chord symbols on interleaved slot', function() {
    const { parseVoiceEvents } = require('./notation/voiceEventModel')
    const { combineDrawableEvents } = require('./scratchpadNotationBarUtils')
    const { serializeVoiceEvents } = require('./notation/abcVoiceSerializer')
    const existing = parseVoiceEvents('e f g |', metaTune).filter(function(ev) {
      return ev.type === 'note' || ev.type === 'chord'
    })
    const incoming = parseVoiceEvents('a "Am"b c |', metaTune).filter(function(ev) {
      return ev.type === 'note' || ev.type === 'chord'
    })
    const merged = combineDrawableEvents(existing[1], incoming[1])
    expect(merged.chordSymbols).toEqual(['Am'])
    const body = serializeVoiceEvents(existing.slice(0, 1).concat([merged], existing.slice(2)), metaTune)
    expect(body).toContain('"Am"')
  })

  test('mergeBarEvents interleaves paired notes and keeps chord on the slot', function() {
    const target = ['e f g |']
    const incoming = ['a "Am"b c |']
    const result = applyBarOperationToVoice(target, incoming, metaTune, 1, 'merge')
    const compact = compactNotes(result.join(' '))
    expect(compact).toMatch(/\[?ae\]?/)
    expect(compact).toContain('"Am"')
    expect(compact).toMatch(/\[?bf\]?/)
    expect(compact).toMatch(/\[?cg\]?/)
  })

  test('mergeBarEvents combines chord symbols on interleaved slots', function() {
    const { parseVoiceEvents } = require('./notation/voiceEventModel')
    const existingEvents = parseVoiceEvents('c d e f |', metaTune)
    const incomingEvents = parseVoiceEvents('"G"g a |', metaTune)
    const merged = mergeBarEvents(existingEvents, incomingEvents)
    const noteCount = merged.filter(function(ev) {
      return ev.type === 'note' || ev.type === 'chord'
    }).length
    expect(noteCount).toBe(4)
    const withG = merged.find(function(ev) {
      return ev.chordSymbols && ev.chordSymbols.indexOf('G') >= 0
    })
    expect(withG).toBeTruthy()
  })

  test('applyBarOperationToVoice insert shifts later bars', function() {
    const target = ['C D E F | G A B c |']
    const incoming = ['e f g a |']
    const result = applyBarOperationToVoice(target, incoming, metaTune, 2, 'insert')
    const text = result.join(' ')
    const compact = compactNotes(text)
    expect(compact.indexOf('CDEF')).toBeLessThan(compact.indexOf('efga'))
    expect(compact.indexOf('efga')).toBeLessThan(compact.indexOf('GABc'))
  })

  test('applyBarOperationToVoice insert at end uses a single line break before incoming', function() {
    const target = ['C D E F |', 'G A B c |']
    const incoming = ['e f g a |']
    const result = applyBarOperationToVoice(target, incoming, metaTune, 3, 'insert')
    expect(result.length).toBe(3)
    expect(result.filter(function(line) { return !String(line).trim() }).length).toBe(0)
    expect(compactNotes(result.join('\n'))).toMatch(/GABc.*efga/)
  })

  test('applyBarOperationToVoice replace drops tail from selected bar', function() {
    const target = ['C D E F | G A B c | d e f g |']
    const incoming = ['A B c d |']
    const result = applyBarOperationToVoice(target, incoming, metaTune, 2, 'replace')
    const text = result.join(' ')
    expect(compactNotes(text)).toMatch(/CDEF\|ABcd/)
    expect(text).not.toMatch(/GABc/i)
    expect(text).not.toMatch(/defg/i)
  })

  test('applyBarOperationToVoice merge combines bar content by interleaving', function() {
    const target = ['"Am"c2 d e f |']
    const incoming = ['"G"g a |']
    const result = applyBarOperationToVoice(target, incoming, metaTune, 1, 'merge')
    const text = result.join(' ')
    expect(text).toContain('"G"')
    expect(text).toMatch(/\[?cg\]?/)
    expect(text).toMatch(/\[?ad\]?/)
  })

  test('applyBarOperationToVoice replace with end bar keeps later target bars and truncates source', function() {
    const target = ['C D E F |', 'G A B c |', 'd e f g |', "c'd'e'f' |"]
    const incoming = ['A B |', 'c d |', 'e f |', 'g a |']
    expect(countVoiceBars(target, metaTune)).toBe(4)
    const result = applyBarOperationToVoice(target, incoming, metaTune, 2, 'replace', { toBar: 3 })
    const compact = compactNotes(result.join(' '))
    expect(compact).toMatch(/CDEF/)
    expect(compact).toMatch(/AB\|cd/)
    expect(compact).not.toMatch(/GABc/)
    expect(compact).not.toMatch(/ef\|ga/)
    expect(compact).toMatch(/c'd'e'f'/)
  })

  test('applyBarOperationToVoice merge with end bar truncates long source', function() {
    const target = ['C D E F | G A B c | d e f g |']
    const incoming = ['A B | c d | e f | g a |']
    const result = applyBarOperationToVoice(target, incoming, metaTune, 2, 'merge', { toBar: 2 })
    const compact = compactNotes(result.join(' '))
    expect(compact).toMatch(/CDEF/)
    expect(compact).toMatch(/\[AG\]\[AB\]Bc/)
    expect(compact).not.toMatch(/cd\|ef/)
    expect(compact).toMatch(/defg/)
  })
})

describe('scratchpadNotationMerge', function() {
  const metaTune = { meter: '4/4', noteLength: '1/8', key: 'C' }

  function compactNotes(text) {
    return String(text || '').replace(/\s+/g, '')
  }

  test('needsVoiceMapping when either side has multiple voices', function() {
    const single = { voices: { '1': { notes: ['C D'] } } }
    const multi = { voices: { '1': { notes: ['C'] }, '2': { notes: ['F'] } } }
    expect(needsVoiceMapping(single, single)).toBe(false)
    expect(needsVoiceMapping(multi, single)).toBe(true)
    expect(needsVoiceMapping(single, multi)).toBe(true)
  })

  test('buildDefaultVoiceMapping pairs voices by index', function() {
    const source = { voices: { '1': { notes: [] }, '2': { notes: [] } } }
    const target = { voices: { '1': { notes: [] } } }
    expect(buildDefaultVoiceMapping(source, target)).toEqual({
      '1': '1',
      '2': '__new__',
    })
  })

  test('merge at bar 2 inserts scratchpad into mapped voice', function() {
    const target = Object.assign({}, metaTune, {
      voices: { '1': { notes: ['C D E F | G A B c |'] } },
    })
    const source = Object.assign({}, metaTune, {
      voices: { '1': { notes: ['e f g a |'] } },
    })
    const merged = applyScratchpadNotationMerge(target, source, {
      mode: 'insert',
      fromBar: 2,
      voiceMapping: { '1': '1' },
    })
    const text = merged.voices['1'].notes.join(' ')
    const compact = compactNotes(text)
    expect(compact.indexOf('CDEF')).toBeLessThan(compact.indexOf('efga'))
    expect(compact.indexOf('efga')).toBeLessThan(compact.indexOf('GABc'))
  })

  test('insert adds inline meter, key, and tempo changes when scratchpad meta differs', function() {
    const target = Object.assign({}, metaTune, {
      tempo: 120,
      voices: { '1': { notes: ['C D E F | G A B c |'] } },
    })
    const source = Object.assign({}, metaTune, {
      meter: '6/8',
      key: 'Am',
      tempo: 90,
      voices: { '1': { notes: ['e f g |'] } },
    })
    const merged = applyScratchpadNotationMerge(target, source, {
      mode: 'insert',
      fromBar: 2,
      voiceMapping: { '1': '1' },
    })
    const mergedText = merged.voices['1'].notes.join(' ')
    expect(mergedText).toContain('[M:6/8]')
    expect(mergedText).toContain('[K:Am]')
    expect(mergedText).toContain('[Q:3/8=90]')
  })

  test('replace maps scratchpad voice onto target voice from bar', function() {
    const target = Object.assign({}, metaTune, {
      voices: {
        '1': { notes: ['C D |'] },
        '2': { notes: ['F G |'] },
      },
    })
    const source = Object.assign({}, metaTune, {
      voices: {
        '1': { notes: ['A B c d |'] },
      },
    })
    const merged = applyScratchpadNotationMerge(target, source, {
      mode: 'replace',
      fromBar: 1,
      voiceMapping: { '1': '2' },
    })
    expect(compactNotes(merged.voices['1'].notes.join(' '))).toMatch(/CD/)
    expect(compactNotes(merged.voices['2'].notes.join(' '))).toMatch(/ABcd/)
  })

  test('analyzeMergeNoteMismatches lists bars and unpaired source slots', function() {
    const target = {
      meter: '4/4',
      noteLength: '1/8',
      key: 'C',
      voices: { '1': { notes: ['e f g |'] } },
    }
    const source = {
      meter: '4/4',
      noteLength: '1/8',
      key: 'C',
      voices: { '1': { notes: ['a b |'] } },
    }
    const result = analyzeMergeNoteMismatches(target, source, {
      mode: 'merge',
      fromBar: 1,
      toBar: 1,
    })
    expect(result.affectedBars).toEqual([1])
    expect(result.sourceHighlights).toEqual([
      { voiceKey: '1', barNumber: 1, slotIndex: 0, targetPitchCount: 1, sourcePitchCount: 1 },
      { voiceKey: '1', barNumber: 1, slotIndex: 1, targetPitchCount: 1, sourcePitchCount: 1 },
    ])
    expect(result.unpairedSourceHighlights).toEqual([])
  })

  test('analyzeMergeNoteMismatches flags unpaired scratchpad-only slots', function() {
    const target = {
      voices: { '1': { notes: ['e f |'] } },
    }
    const source = {
      voices: { '1': { notes: ['a b c |'] } },
    }
    const result = analyzeMergeNoteMismatches(target, source, {
      mode: 'merge',
      fromBar: 1,
      toBar: 1,
    })
    expect(result.unpairedSourceHighlights).toEqual([
      { voiceKey: '1', barNumber: 1, slotIndex: 2, targetPitchCount: 0, sourcePitchCount: 1 },
    ])
  })

  test('analyzeMergeNoteMismatches marks source pitches on matched bars', function() {
    const target = {
      voices: { '1': { notes: ['e f g |'] } },
    }
    const source = {
      voices: { '1': { notes: ['a b c |'] } },
    }
    const result = analyzeMergeNoteMismatches(target, source, {
      mode: 'merge',
      fromBar: 1,
      toBar: 1,
    })
    expect(result.affectedBars).toEqual([])
    expect(result.unpairedSourceHighlights).toEqual([])
    expect(result.sourceHighlights).toEqual([
      { voiceKey: '1', barNumber: 1, slotIndex: 0, targetPitchCount: 1, sourcePitchCount: 1 },
      { voiceKey: '1', barNumber: 1, slotIndex: 1, targetPitchCount: 1, sourcePitchCount: 1 },
      { voiceKey: '1', barNumber: 1, slotIndex: 2, targetPitchCount: 1, sourcePitchCount: 1 },
    ])
  })

  test('analyzeMergeNoteMismatches returns empty for insert mode', function() {
    const target = {
      voices: { '1': { notes: ['e f g |'] } },
    }
    const source = {
      voices: { '1': { notes: ['a b |'] } },
    }
    const result = analyzeMergeNoteMismatches(target, source, {
      mode: 'insert',
      fromBar: 1,
    })
    expect(result.affectedBars).toEqual([])
    expect(result.sourceHighlights).toEqual([])
    expect(result.unpairedSourceHighlights).toEqual([])
  })
})
