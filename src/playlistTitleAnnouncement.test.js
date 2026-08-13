import {
  announcePlaylistTrack,
  buildPlaylistTrackAnnouncementText,
  cancelPlaylistTitleAnnouncement,
  confirmQueuedPlaylistTrackAnnouncement,
  queuePlaylistTrackAnnouncement,
} from './playlistTitleAnnouncement'
import * as voiceSettings from './voiceSettings'
import * as ttsClient from './ttsClient'
import { checkCanAfford } from './creditAffordabilityClient'
import { getActiveResolverAccessToken } from './mediaResolverHealthStore'

jest.mock('./voiceSettings', function() {
  return {
    isSpeakSongTitlesEnabled: jest.fn(function() { return true }),
    isSpeakArtistNamesEnabled: jest.fn(function() { return false }),
  }
})

jest.mock('./creditAffordabilityClient', function() {
  return {
    __esModule: true,
    checkCanAfford: jest.fn(),
  }
})

jest.mock('./mediaResolverHealthStore', function() {
  return {
    __esModule: true,
    getActiveResolverAccessToken: jest.fn(function() { return null }),
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
    checkCanAfford.mockResolvedValue({
      affordable: true,
      creditUnlimited: false,
    })
    getActiveResolverAccessToken.mockReturnValue(null)
    URL.createObjectURL = jest.fn(function() { return 'blob:test' })
    URL.revokeObjectURL = jest.fn()
    HTMLMediaElement.prototype.play = jest.fn(function() { return Promise.resolve() })
    HTMLMediaElement.prototype.pause = jest.fn()
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

  test('requests TTS for tune name when enabled', async function() {
    const blob = new Blob(['wav'], { type: 'audio/wav' })
    ttsClient.synthesizeSpeech.mockResolvedValue(blob)

    announcePlaylistTrack({ name: 'Blue Moon' })
    await Promise.resolve()

    expect(ttsClient.synthesizeSpeech).toHaveBeenCalledWith('Blue Moon')
  })

  test('requests TTS with artist when enabled', async function() {
    const blob = new Blob(['wav'], { type: 'audio/wav' })
    ttsClient.synthesizeSpeech.mockResolvedValue(blob)
    voiceSettings.isSpeakArtistNamesEnabled.mockReturnValue(true)

    announcePlaylistTrack({ name: 'Blue Moon', composer: 'Rodgers' })
    await Promise.resolve()

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

  test('skips TTS when cannot afford', async function() {
    getActiveResolverAccessToken.mockReturnValue('token')
    checkCanAfford.mockResolvedValue({
      affordable: false,
      creditUnlimited: false,
    })

    announcePlaylistTrack({ name: 'Cannot Afford Tune' })
    await new Promise(function(resolve) { setTimeout(resolve, 0) })

    expect(checkCanAfford).toHaveBeenCalled()
    expect(ttsClient.synthesizeSpeech).not.toHaveBeenCalled()
  })

  test('uses cache on repeat title', async function() {
    const blob = new Blob(['wav'], { type: 'audio/wav' })
    ttsClient.synthesizeSpeech.mockResolvedValue(blob)

    announcePlaylistTrack({ name: 'Cached Tune' })
    await Promise.resolve()
    announcePlaylistTrack({ name: 'Cached Tune' })

    expect(ttsClient.synthesizeSpeech).toHaveBeenCalledTimes(1)
  })

  test('queued announcement waits for playback confirmation', async function() {
    const blob = new Blob(['wav'], { type: 'audio/wav' })
    ttsClient.synthesizeSpeech.mockResolvedValue(blob)

    queuePlaylistTrackAnnouncement({ id: 't1', name: 'Confirmed Tune' })
    expect(ttsClient.synthesizeSpeech).not.toHaveBeenCalled()

    confirmQueuedPlaylistTrackAnnouncement({ id: 't1', name: 'Confirmed Tune' })
    await Promise.resolve()

    expect(ttsClient.synthesizeSpeech).toHaveBeenCalledWith('Confirmed Tune')
  })

  test('queued announcement is dropped when a different tune starts', async function() {
    queuePlaylistTrackAnnouncement({ id: 't1', name: 'Blue Moon' })
    confirmQueuedPlaylistTrackAnnouncement({ id: 't2', name: 'Wild Rover' })
    await Promise.resolve()

    expect(ttsClient.synthesizeSpeech).not.toHaveBeenCalled()
  })
})
