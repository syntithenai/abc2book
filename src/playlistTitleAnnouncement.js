import {
  isSpeakSongTitlesEnabled,
  isSpeakArtistNamesEnabled,
} from './voiceSettings'
import { isGenericArtist } from './genericArtistUtils'
import { synthesizeSpeech } from './ttsClient'
import { checkCanAfford } from './creditAffordabilityClient'
import { getActiveResolverAccessToken } from './mediaResolverHealthStore'

const speechCache = new Map()
let announcementGeneration = 0
let activePlayer = null
let activeObjectUrl = null
let pendingAnnouncementTune = null

function getSpeechContainer() {
  if (typeof document === 'undefined') return null
  return document.getElementById('speech_audio')
}

function stopActiveSpeech() {
  if (activePlayer) {
    try {
      activePlayer.pause()
      activePlayer.currentTime = 0
    } catch (e) {
      // ignore
    }
    activePlayer = null
  }
  if (activeObjectUrl) {
    try {
      URL.revokeObjectURL(activeObjectUrl)
    } catch (e) {
      // ignore
    }
    activeObjectUrl = null
  }
}

function playSpeechBlob(blob, generation) {
  const container = getSpeechContainer()
  if (!container || !blob) return

  stopActiveSpeech()
  if (generation !== announcementGeneration) return

  const url = URL.createObjectURL(blob)
  activeObjectUrl = url
  container.innerHTML = '<audio id="player"></audio>'
  const player = document.getElementById('player')
  if (!player) {
    URL.revokeObjectURL(url)
    activeObjectUrl = null
    return
  }
  activePlayer = player
  player.src = url
  player.onended = function() {
    if (activeObjectUrl === url) {
      URL.revokeObjectURL(url)
      activeObjectUrl = null
      activePlayer = null
    }
  }
  const playPromise = player.play()
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch(function() {
      // autoplay or rapid skip — ignore
    })
  }
}

export function cancelPlaylistTitleAnnouncement() {
  announcementGeneration += 1
  pendingAnnouncementTune = null
  stopActiveSpeech()
}

export function buildPlaylistTrackAnnouncementText(tune) {
  const name = tune && typeof tune.name === 'string' ? tune.name.trim() : ''
  if (!name) return ''
  if (!isSpeakArtistNamesEnabled()) return name
  const artist = tune && typeof tune.composer === 'string' ? tune.composer.trim() : ''
  if (!artist || isGenericArtist(artist)) return name
  return name + ' by ' + artist
}

async function canAffordTtsSpeech(text) {
  const token = getActiveResolverAccessToken()
  if (!token) return true
  const textChars = typeof text === 'string' ? text.length : 0
  try {
    const afford = await checkCanAfford(token, [{
      id: 'tts_speech',
      params: {
        text_chars: textChars,
        text_bytes: textChars + 32,
      },
    }])
    return afford.creditUnlimited || afford.affordable
  } catch (e) {
    console.log(e)
    return true
  }
}

export function announcePlaylistTrack(tune) {
  if (!isSpeakSongTitlesEnabled()) return
  const text = buildPlaylistTrackAnnouncementText(tune)
  if (!text) return

  const generation = announcementGeneration + 1
  announcementGeneration = generation
  stopActiveSpeech()

  const cached = speechCache.get(text)
  if (cached) {
    playSpeechBlob(cached, generation)
    return
  }

  canAffordTtsSpeech(text).then(function(affordable) {
    if (!affordable) {
      if (generation === announcementGeneration) {
        console.warn('Playlist title announcement skipped: insufficient resolver credit')
      }
      return
    }
    synthesizeSpeech(text).then(function(blob) {
      if (generation !== announcementGeneration) return
      speechCache.set(text, blob)
      playSpeechBlob(blob, generation)
    }).catch(function(err) {
      if (generation !== announcementGeneration) return
      console.warn('Playlist title announcement failed:', err && err.message ? err.message : err)
    })
  })
}

export function queuePlaylistTrackAnnouncement(tune) {
  pendingAnnouncementTune = tune || null
}

export function confirmQueuedPlaylistTrackAnnouncement(tune) {
  if (!pendingAnnouncementTune) return
  if (!tune || !pendingAnnouncementTune) {
    pendingAnnouncementTune = null
    return
  }
  const pendingId = pendingAnnouncementTune.id
  const currentId = tune.id
  if (pendingId && currentId && pendingId !== currentId) return
  if (!pendingId && !currentId) {
    const pendingName = typeof pendingAnnouncementTune.name === 'string' ? pendingAnnouncementTune.name.trim() : ''
    const currentName = typeof tune.name === 'string' ? tune.name.trim() : ''
    if (!pendingName || pendingName !== currentName) return
  }
  pendingAnnouncementTune = null
  announcePlaylistTrack(tune)
}
