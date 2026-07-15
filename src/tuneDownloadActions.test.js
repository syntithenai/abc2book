import {
  sanitizeDownloadFilename,
  tunesToCsv,
  tunesToLyricsText,
  linkedAudioDownloadFormat,
  isLinkedAudioDownloadFormat,
} from './tuneDownloadActions'

describe('tuneDownloadActions', function() {
  test('sanitizes download filenames', function() {
    expect(sanitizeDownloadFilename('My/Tune', 'fallback')).toBe('My_Tune')
    expect(sanitizeDownloadFilename('', 'fallback')).toBe('fallback')
  })

  test('builds csv with headers and rows', function() {
    var csv = tunesToCsv([
      {
        name: 'Tune A',
        composer: 'Artist',
        key: 'D',
        meter: '4/4',
        tempo: 100,
        rhythm: 'reel',
        books: ['Book 1'],
        tags: ['tag1', 'tag2'],
        boost: 3,
        difficulty: 5,
        srcUrl: 'https://example.com',
      },
    ])
    expect(csv.split('\n')[0]).toBe('name,composer,key,meter,tempo,rhythm,books,tags,boost,difficulty,srcUrl')
    expect(csv).toContain('Tune A,Artist')
    expect(csv).toContain('Book 1')
    expect(csv).toContain('tag1; tag2')
  })

  test('builds lyrics text with title and artist headers', function() {
    var text = tunesToLyricsText([
      { name: 'Song', composer: 'Singer', wLines: ['line one', 'line two'] },
      { name: 'Instrumental', composer: '' },
    ])
    expect(text).toContain('Song - Singer\nline one\nline two')
    expect(text).toContain('Instrumental\n')
  })

  test('maps linked audio download formats', function() {
    expect(linkedAudioDownloadFormat('linked-audio')).toBe('aac')
    expect(linkedAudioDownloadFormat('linked-audio-mp3')).toBe('mp3')
    expect(linkedAudioDownloadFormat('linked-audio-wav')).toBe('wav')
    expect(linkedAudioDownloadFormat('abc')).toBeNull()
    expect(isLinkedAudioDownloadFormat('linked-audio')).toBe(true)
    expect(isLinkedAudioDownloadFormat('linked-audio-mp3')).toBe(true)
    expect(isLinkedAudioDownloadFormat('linked-audio-wav')).toBe(true)
    expect(isLinkedAudioDownloadFormat('midi')).toBe(false)
  })
})
