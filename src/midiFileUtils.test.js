import {
  isMidiImportFile,
  isHttpMidiUrl,
  normalizeMidiBinaryData,
  isMidiHeader,
  createMidiFileEndHandler,
} from './midiFileUtils'

describe('midiFileUtils', function() {
  test('isMidiImportFile detects midi files', function() {
    expect(isMidiImportFile({ name: 'tune.mid', type: '' })).toBe(true)
    expect(isMidiImportFile({ name: 'tune.txt', type: 'audio/midi' })).toBe(true)
    expect(isMidiImportFile({ name: 'tune.mp3', type: 'audio/mpeg' })).toBe(false)
  })

  test('isHttpMidiUrl detects remote midi links', function() {
    expect(isHttpMidiUrl('https://example.com/a.mid')).toBe(true)
    expect(isHttpMidiUrl('https://example.com/a.mp3')).toBe(false)
  })

  test('normalizeMidiBinaryData unwraps abcjs array output', function() {
    const bytes = new Uint8Array([77, 84, 104, 100, 0, 0, 0, 6])
    expect(normalizeMidiBinaryData([bytes])).toBe(bytes)
    expect(normalizeMidiBinaryData(bytes)).toBe(bytes)
    expect(isMidiHeader(bytes)).toBe(true)
  })

  test('createMidiFileEndHandler ignores endOfFile while substantial song time remains', function() {
    const calls = []
    const player = {
      isPlaying: function() { return false },
      play: function() { calls.push('play') },
      getSongTimeRemaining: function() { return 12.5 },
      skipToSeconds: function() { calls.push('skip') },
    }
    const onEnded = jest.fn()
    const handler = createMidiFileEndHandler({
      player: player,
      onEnded: onEnded,
      clearTimeUpdateTimer: function() { calls.push('clear') },
      stopActiveNotes: function() { calls.push('stopNotes') },
      startTimeUpdateTimer: function() { calls.push('timer') },
    })
    handler()
    expect(onEnded).not.toHaveBeenCalled()
    expect(calls).toEqual(['clear', 'stopNotes', 'play', 'timer'])
  })

  test('createMidiFileEndHandler finishes when little time remains', function() {
    const calls = []
    const player = {
      isPlaying: function() { return false },
      play: function() { calls.push('play') },
      getSongTimeRemaining: function() { return 0.05 },
      skipToSeconds: function(sec) { calls.push('skip:' + sec) },
    }
    const onEnded = jest.fn()
    const handler = createMidiFileEndHandler({
      player: player,
      onEnded: onEnded,
      clearTimeUpdateTimer: function() { calls.push('clear') },
      stopActiveNotes: function() { calls.push('stopNotes') },
      startTimeUpdateTimer: function() { calls.push('timer') },
    })
    handler()
    expect(onEnded).toHaveBeenCalled()
    expect(calls).toEqual(['clear', 'stopNotes', 'skip:0'])
  })
})
