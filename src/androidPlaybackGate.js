/**
 * Enforces ExoPlayer as the sole audible output on Android app builds.
 */
import { prefersNativeMediaPlayback } from './platformUtils'
import { logPlaybackDebug } from './playbackDebug'

export function isAndroidNativeOutputOwned(controller) {
  if (!prefersNativeMediaPlayback()) return false
  if (!controller) return false
  if (typeof controller.isMidiPlaybackRoute === 'function' && controller.isMidiPlaybackRoute()) {
    return true
  }
  if (typeof controller.isMediaPlaybackRoute === 'function' && controller.isMediaPlaybackRoute()) {
    return true
  }
  return false
}

export function assertWebViewPlayBlocked(reason) {
  logPlaybackDebug('webview-play-blocked', { reason: reason })
}

export function hardSilenceWebViewOutputs(controller) {
  if (!prefersNativeMediaPlayback() || !controller) return
  if (controller.stopPlaybackKeepAlive) {
    controller.stopPlaybackKeepAlive()
  }
  if (controller.silencePlaybackOutputs) {
    controller.silencePlaybackOutputs()
  }
  const playerRef = controller.playerRef
  if (playerRef && playerRef.current) {
    try {
      playerRef.current.volume = 0
      playerRef.current.pause()
      playerRef.current.removeAttribute('src')
      playerRef.current.load()
    } catch (e) {}
  }
  const filteredRef = controller.filteredPlayerRef
  if (filteredRef && filteredRef.current) {
    try {
      filteredRef.current.volume = 0
      filteredRef.current.pause()
      filteredRef.current.removeAttribute('src')
      filteredRef.current.load()
    } catch (e) {}
  }
  if (controller.pauseYoutubeOutputOnly) {
    controller.pauseYoutubeOutputOnly()
  }
}

export function shouldBlockWebViewAudioPlay(controller, reason) {
  if (!isAndroidNativeOutputOwned(controller)) return false
  assertWebViewPlayBlocked(reason || 'native-owned')
  return true
}
