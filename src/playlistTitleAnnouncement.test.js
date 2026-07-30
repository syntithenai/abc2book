import {
  announcePlaylistTrack,
  buildPlaylistTrackAnnouncementText,
  cancelPlaylistTitleAnnouncement,
} from './playlistTitleAnnouncement'
import * as voiceSettings from './voiceSettings'
import * as ttsClient from './ttsClient'

jest.mock('./voiceSettings', function() {
  return {
    isSpeakSongTitlesEnabled: jest.fn(function() { return true }),
    isSpeakArtistNamesEnabled: jest.fn(function() { return false }),
  }
})

jest.mock('./ttsClient', function() {
  return {
    synthesizeSpeech: jest.fn(),
  }
})

describe('playlistTitleAnnouncement', function() {
  beforeEach(function() {
    document.body.innerHTML = '<div id="speech_audio"></div>'
    cancelPlaylistTitleAnnouncement()
    voiceSettings.isSpeakSongTitlesEnabled.mockReturnValue(true)
    voiceSettings.isSpeakArtistNamesEnabled.mockReturnValue(false)
    ttsClient.synthesizeSpeech.mockReset()
    URL.createObjectURL = jest.fn(function() { return 'blob:test' })
    URL.revokeObjectURL = jest.fn()
  })

  test('buildPlaylistTrackAnnouncementText uses title only by default', function() {
    expect(buildPlaylistTrackAnnouncementText({ name: 'Blue Moon', composer: 'Rodgers' })).toBe('Blue Moon')
  })

  test('buildPlaylistTrackAnnouncementText includes artist when enabled', function() {
    voiceSettings.isSpeakArtistNamesEnabled.mockReturnValue(true)
    expect(buildPlaylistTrackAnnouncementText({ name: 'Blue Moon', composer: 'Rodgers' })).toBe('Blue Moon by Rodgers')
  })

  test('buildPlaylistTrackAnnouncementText skips Traditional composer', function() {
    voiceSettings.isSpeakArtistNamesEnabled.mockReturnValue(true)
    expect(buildPlaylistTrackAnnouncementText({ name: 'Wild Rover', composer: 'Traditional' })).toBe('Wild Rover')
  })

  test('does nothing when setting is disabled', function() {
    voiceSettings.isSpeakSongTitlesEnabled.mockReturnValue(false)
    announcePlaylistTrack({ name: 'Test Tune' })
    expect(ttsClient.synthesizeSpeech).not.toHaveBeenCalled()
  })

  test('requests TTS for tune name when enabled', function() {
    const blob = new Blob(['wav'], { type: 'audio/wav' })
    ttsClient.synthesizeSpeech.mockResolvedValue(blob)

    announcePlaylistTrack({ name: 'Blue Moon' })

    expect(ttsClient.synthesizeSpeech).toHaveBeenCalledWith('Blue Moon')
  })

  test('requests TTS with artist when enabled', function() {
    const blob = new Blob(['wav'], { type: 'audio/wav' })
    ttsClient.synthesizeSpeech.mockResolvedValue(blob)
    voiceSettings.isSpeakArtistNamesEnabled.mockReturnValue(true)

    announcePlaylistTrack({ name: 'Blue Moon', composer: 'Rodgers' })

    expect(ttsClient.synthesizeSpeech).toHaveBeenCalledWith('Blue Moon by Rodgers')
  })

  test('cancel prevents stale speech from playing', async function() {
    let resolveSpeech
    const pending = new Promise(function(resolve) {
      resolveSpeech = resolve
    })
    ttsClient.synthesizeSpeech.mockReturnValue(pending)

    announcePlaylistTrack({ name: 'First' })
    cancelPlaylistTitleAnnouncement()
    resolveSpeech(new Blob(['wav'], { type: 'audio/wav' }))

    await pending
    expect(document.getElementById('player')).toBeNull()
  })

  test('uses cache on repeat title', async function() {
    const blob = new Blob(['wav'], { type: 'audio/wav' })
    ttsClient.synthesizeSpeech.mockResolvedValue(blob)

    announcePlaylistTrack({ name: 'Cached Tune' })
    await Promise.resolve()
    announcePlaylistTrack({ name: 'Cached Tune' })

    expect(ttsClient.synthesizeSpeech).toHaveBeenCalledTimes(1)
  })
})
