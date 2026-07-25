/** Shared YouTube player handle for lesson queues (external media). */

let player = null
let wantsPlay = false
let isPlaying = false
const listeners = []

function notifyListeners() {
  listeners.forEach(function(listener) {
    try {
      listener({ isPlaying: isPlaying, wantsPlay: wantsPlay })
    } catch (e) {
      // ignore
    }
  })
}

export function subscribeLessonYoutube(listener) {
  if (typeof listener !== 'function') return function() {}
  listeners.push(listener)
  listener({ isPlaying: isPlaying, wantsPlay: wantsPlay })
  return function() {
    const idx = listeners.indexOf(listener)
    if (idx >= 0) listeners.splice(idx, 1)
  }
}

export function isLessonYoutubePlaying() {
  return isPlaying
}

export function setLessonYoutubePlaying(next) {
  isPlaying = !!next
  notifyListeners()
}

export function setLessonYoutubePlayer(nextPlayer) {
  player = nextPlayer || null
  if (player && wantsPlay) {
    tryPlayLessonYoutube()
  }
}

export function clearLessonYoutubePlayer(nextPlayer) {
  if (player === nextPlayer) {
    player = null
    isPlaying = false
    notifyListeners()
  }
}

function tryPlayLessonYoutube() {
  if (!player) return false
  try {
    player.playVideo()
    return true
  } catch (e) {
    return false
  }
}

export function playLessonYoutube(options) {
  const opts = options || {}
  wantsPlay = true
  notifyListeners()
  if (player) {
    tryPlayLessonYoutube()
  }
  return opts
}

export function pauseLessonYoutube() {
  wantsPlay = false
  if (player) {
    try {
      player.pauseVideo()
    } catch (e) {
      // ignore
    }
  }
  isPlaying = false
  notifyListeners()
}

export function lessonYoutubeWantsPlay() {
  return wantsPlay
}

export function resetLessonYoutubePlayback() {
  wantsPlay = false
  isPlaying = false
  if (player) {
    try {
      player.stopVideo()
    } catch (e) {
      // ignore
    }
  }
  notifyListeners()
}

/** YouTube iframe API states */
export const YT_PLAYER_STATE = {
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
}

export function handleLessonYoutubeStateChange(state) {
  if (state === YT_PLAYER_STATE.PLAYING || state === YT_PLAYER_STATE.BUFFERING) {
    wantsPlay = false
    isPlaying = true
    notifyListeners()
    return
  }
  if (state === YT_PLAYER_STATE.PAUSED || state === YT_PLAYER_STATE.ENDED) {
    isPlaying = false
    notifyListeners()
    return
  }
  if (state === YT_PLAYER_STATE.CUED && wantsPlay) {
    tryPlayLessonYoutube()
  }
}
