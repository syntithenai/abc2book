jest.mock('./linkRecording', function() {
  return {
    __esModule: true,
    createAttachedMidiLink: jest.fn(),
    createAttachedAudioLink: jest.fn(),
  }
})

import {
  mergeScratchpadNotationIntoTune,
  mergeScratchpadLyricsIntoTune,
  getAssociateModesForItem,
  getNotationAssociateMergeMode,
  isNotationBarPickerMode,
  getTuneMelodyNotesText,
  filterScratchpadNotationForMidiExport,
  attachScratchpadNotationMidiToTune,
} from './scratchpadAssociate'
import { createAttachedMidiLink } from './linkRecording'
import { setVoiceViewSettings } from './abcVoiceViewSettings'

describe('scratchpadAssociate', function() {
  function compactNotes(text) {
    return String(text || '').replace(/\s+/g, '')
  }

  test('mergeScratchpadNotationIntoTune merges at bar 1 by default', function() {
    const tune = {
      id: 't1',
      meter: '4/4',
      noteLength: '1/8',
      key: 'C',
      voices: { V: { notes: ['C D E |'], meta: {} } },
    }
    const scratchpad = {
      voices: { V: { notes: ['F G A |'], meta: {} } },
    }
    const merged = mergeScratchpadNotationIntoTune(tune, scratchpad, '', 'merge', { fromBar: 1 })
    const text = compactNotes(merged.voices.V.notes.join(' '))
    expect(text).toMatch(/\[?CF\]?/)
    expect(text).toMatch(/\[?DG\]?/)
    expect(text).toMatch(/\[?AE\]?/)
  })

  test('mergeScratchpadNotationIntoTune replaces from bar when mode is replace', function() {
    const tune = {
      id: 't1',
      meter: '4/4',
      noteLength: '1/8',
      key: 'C',
      voices: { V: { notes: ['C D E | G A B |'], meta: {} } },
    }
    const scratchpad = {
      voices: { V: { notes: ['F G A |'], meta: {} } },
    }
    const merged = mergeScratchpadNotationIntoTune(tune, scratchpad, '', 'replace', { fromBar: 2 })
    const text = compactNotes(merged.voices.V.notes.join(' '))
    expect(text).toMatch(/CDE/)
    expect(text).toMatch(/FGA/)
    expect(text).not.toMatch(/GAB/)
  })

  test('mergeScratchpadLyricsIntoTune replaces lyrics', function() {
    const tune = { id: 't1', words: ['old'], wLines: [] }
    const merged = mergeScratchpadLyricsIntoTune(tune, 'line one\nline two', 'replace')
    expect(merged.words).toEqual(['line one', 'line two'])
  })

  test('getTuneMelodyNotesText reads first voice', function() {
    const tune = { voices: { V: { notes: ['A B c'] } } }
    expect(getTuneMelodyNotesText(tune)).toBe('A B c')
  })

  test('getAssociateModesForItem includes notation associate options', function() {
    const modes = getAssociateModesForItem({ type: 'notation' })
    expect(modes.map(function(mode) { return mode.id })).toEqual([
      'notation',
      'midi',
    ])
    expect(modes.map(function(mode) { return mode.label })).toEqual([
      'As Notation',
      'As Midi Linked Media',
    ])
  })

  test('getAssociateModesForItem labels other scratchpad types', function() {
    expect(getAssociateModesForItem({ type: 'text' }).map(function(m) { return m.label })).toEqual([
      'For Lyrics',
      'For Background Information',
    ])
    expect(getAssociateModesForItem({ type: 'image' })[0].label).toBe('As Snapshot')
    expect(getAssociateModesForItem({ type: 'audio' })[0].label).toBe('As Linked Media')
  })

  test('getNotationAssociateMergeMode uses notation operation', function() {
    expect(getNotationAssociateMergeMode('notation', 'replace')).toBe('replace')
    expect(getNotationAssociateMergeMode('notation', 'insert')).toBe('insert')
    expect(getNotationAssociateMergeMode('notation', 'merge')).toBe('merge')
    expect(isNotationBarPickerMode('notation')).toBe(true)
    expect(isNotationBarPickerMode('midi')).toBe(false)
  })

  test('filterScratchpadNotationForMidiExport keeps only visible voices', function() {
    const scratchpadId = 'scratch-1'
    const snapshot = {
      id: scratchpadId,
      voices: {
        '1': { notes: ['C D E'], meta: {} },
        '2': { notes: ['F G A'], meta: {} },
      },
    }
    setVoiceViewSettings(scratchpadId, {
      visible: { '1': false, '2': true },
      playable: { '1': true, '2': true },
    }, ['1', '2'])
    const filtered = filterScratchpadNotationForMidiExport(snapshot, scratchpadId)
    expect(Object.keys(filtered.voices)).toEqual(['1'])
    expect(filtered.voices['1'].notes.join(' ')).toBe('F G A')
  })

  test('attachScratchpadNotationMidiToTune exports visible voices only', async function() {
    const scratchpadId = 'scratch-2'
    const snapshot = {
      id: scratchpadId,
      name: 'Draft',
      voices: {
        '1': { notes: ['C'], meta: {} },
        '2': { notes: ['F'], meta: {} },
      },
    }
    setVoiceViewSettings(scratchpadId, {
      visible: { '1': false, '2': true },
      playable: { '1': true, '2': true },
    }, ['1', '2'])
    const midiHeader = new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0x01, 0xe0])
    const getMidiData = jest.fn(function(tune) {
      return [midiHeader]
    })
    createAttachedMidiLink.mockResolvedValue({ link: { link: 'abcbook-recording:test', mediaKind: 'midi' } })
    await attachScratchpadNotationMidiToTune(
      { id: 't1', links: [] },
      snapshot,
      {
        tunebook: { getMidiData: getMidiData },
        scratchpadItemId: scratchpadId,
      }
    )
    expect(getMidiData).toHaveBeenCalledTimes(1)
    const exportedTune = getMidiData.mock.calls[0][0]
    expect(Object.keys(exportedTune.voices)).toEqual(['1'])
    expect(exportedTune.voices['1'].notes).toEqual(['F'])
  })
})
