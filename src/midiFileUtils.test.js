import { isMidiImportFile, isHttpMidiUrl } from './midiFileUtils'

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
})
