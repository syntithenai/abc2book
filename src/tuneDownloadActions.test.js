import {
  sanitizeDownloadFilename,
  tunesToCsv,
  tunesToLyricsText,
  linkedAudioDownloadFormat,
  isLinkedAudioDownloadFormat,
  isTuneDownloadFormatDisabled,
  getTuneDownloadStartToastMessage,
  getTuneDownloadFormatsForContext,
  shouldShowRestrictedTuneDownloads,
  canShowRestrictedTuneDownloads,
} from './tuneDownloadActions'
import { FEED_FEEDBACK_ADMIN_EMAIL } from './feedFeedbackUtils'

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

  test('allows audio and midi downloads for notation-only tunes', function() {
    var tunebook = {
      hasNotesOrChords: function(tune) {
        return !!(tune && tune.notes)
      },
      utils: {
        isYoutubeLink: function() { return false },
      },
    }
    var tunes = [{ id: 't1', name: 'Tune', notes: 'CDEF' }]
    expect(isTuneDownloadFormatDisabled('midi', tunes, tunebook)).toBe(false)
    expect(isTuneDownloadFormatDisabled('linked-audio', tunes, tunebook)).toBe(false)
    expect(isTuneDownloadFormatDisabled('linked-audio', [{ id: 't2', name: 'Empty' }], tunebook)).toBe(true)
  })

  test('builds starting download toast messages', function() {
    expect(getTuneDownloadStartToastMessage('abc', 1)).toContain('Starting download')
    expect(getTuneDownloadStartToastMessage('linked-audio', 2)).toContain('Starting audio download')
    expect(getTuneDownloadStartToastMessage('midi', 1)).toContain('Starting MIDI download')
  })

  test('hides audio download formats except for the download admin user', function() {
    const adminUser = { email: FEED_FEEDBACK_ADMIN_EMAIL }
    const otherUser = { email: 'someone@example.com' }
    const adminFormats = getTuneDownloadFormatsForContext({ user: adminUser })
    const guestFormats = getTuneDownloadFormatsForContext({ user: null })
    const bulkFormats = getTuneDownloadFormatsForContext({ allowRestrictedFormats: true })

    expect(adminFormats.some(function(format) { return format.id === 'linked-audio' })).toBe(true)
    expect(guestFormats.some(function(format) { return format.id === 'linked-audio' })).toBe(false)
    expect(getTuneDownloadFormatsForContext({ user: otherUser }).some(function(format) {
      return format.id === 'linked-audio'
    })).toBe(false)
    expect(bulkFormats.some(function(format) { return format.id === 'linked-audio' })).toBe(true)
    expect(canShowRestrictedTuneDownloads(adminUser)).toBe(true)
    expect(canShowRestrictedTuneDownloads(otherUser)).toBe(false)
    expect(shouldShowRestrictedTuneDownloads({ allowRestrictedFormats: true })).toBe(true)
    expect(shouldShowRestrictedTuneDownloads({ user: otherUser })).toBe(false)
  })
})
