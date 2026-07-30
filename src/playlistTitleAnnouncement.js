import {
  isSpeakSongTitlesEnabled,
  isSpeakArtistNamesEnabled,
} from './voiceSettings'
import { isGenericArtist } from './genericArtistUtils'
import { synthesizeSpeech } from './ttsClient'

const speechCache = new Map()
let announcementGeneration = 0
let activePlayer = null
let activeObjectUrl = null

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

  synthesizeSpeech(text).then(function(blob) {
    if (generation !== announcementGeneration) return
    speechCache.set(text, blob)
    playSpeechBlob(blob, generation)
  }).catch(function(err) {
    if (generation !== announcementGeneration) return
    console.warn('Playlist title announcement failed:', err && err.message ? err.message : err)
  })
}
