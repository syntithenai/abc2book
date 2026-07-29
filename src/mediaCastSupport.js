/** Chromecast / AirPlay / Remote Playback helpers (Phase 1–2). */

import { playbackNeedsExternalProcessing, pitchShiftIsActive, getMediaPlaybackSettings } from './pitchTempoUtils';

export function isAirPlaySupported() {
  if (typeof document === 'undefined') return false;
  const audio = document.createElement('audio');
  return typeof audio.webkitShowPlaybackTargetPicker === 'function';
}

export function isRemotePlaybackSupported() {
  if (typeof document === 'undefined') return false;
  const audio = document.createElement('audio');
  return !!(audio.remote && typeof audio.remote.watchAvailability === 'function');
}

export function getNativeAudioElement(mediaController) {
  if (!mediaController || !mediaController.playerRef) return null;
  return mediaController.playerRef.current || null;
}

export function canCastNativeAudio(mediaController) {
  if (!mediaController) return false;
  if (mediaController.isMidiPlaybackRoute && mediaController.isMidiPlaybackRoute()) return false;
  if (mediaController.isMidiFileMediaRoute && mediaController.isMidiFileMediaRoute()) return false;
  if (mediaController.isExternalOutputActive && mediaController.isExternalOutputActive()) return false;
  const tune = mediaController.tune;
  if (!tune) return false;
  const srcType = mediaController.getSrcType
    ? mediaController.getSrcType(
      mediaController.getSrc ? mediaController.getSrc(tune, mediaController.mediaLinkNumber) : null
    )
    : null;
  if (srcType === 'youtube' || srcType === 'midi') return false;
  const settings = getMediaPlaybackSettings(tune);
  if (pitchShiftIsActive(settings.pitch, settings.fineTune) || playbackNeedsExternalProcessing(settings)) return false;
  return srcType === 'audio' || srcType === 'recording';
}

export function getCastDisabledReason(mediaController) {
  if (!mediaController) return 'No media loaded';
  if (!canCastNativeAudio(mediaController)) {
    if (mediaController.isExternalOutputActive && mediaController.isExternalOutputActive()) {
      return 'Stop pitch shift or stem filters to cast';
    }
    const tune = mediaController.tune;
    const srcType = tune && mediaController.getSrcType
      ? mediaController.getSrcType(mediaController.getSrc(tune, mediaController.mediaLinkNumber))
      : null;
    if (srcType === 'youtube') return 'Use YouTube\'s player to cast video';
    return 'Cast supports neutral native audio only';
  }
  if (!isAirPlaySupported() && !isRemotePlaybackSupported()) {
    return 'AirPlay / Remote Playback not supported in this browser';
  }
  return null;
}

export function promptAirPlay(audioEl) {
  if (!audioEl || typeof audioEl.webkitShowPlaybackTargetPicker !== 'function') {
    return false;
  }
  try {
    audioEl.webkitShowPlaybackTargetPicker();
    return true;
  } catch (e) {
    return false;
  }
}

export function promptRemotePlayback(audioEl) {
  if (!audioEl || !audioEl.remote || typeof audioEl.remote.prompt !== 'function') {
    return false;
  }
  return audioEl.remote.prompt().then(function() { return true; }).catch(function() { return false; });
}

export function watchRemotePlaybackConnection(audioEl, callbacks) {
  if (!audioEl || !audioEl.remote || typeof audioEl.remote.addEventListener !== 'function') {
    return function() {};
  }
  function onConnect() {
    if (callbacks && callbacks.onConnect) callbacks.onConnect();
  }
  function onDisconnect() {
    if (callbacks && callbacks.onDisconnect) callbacks.onDisconnect();
  }
  audioEl.remote.addEventListener('connect', onConnect);
  audioEl.remote.addEventListener('disconnect', onDisconnect);
  return function cleanup() {
    try {
      audioEl.remote.removeEventListener('connect', onConnect);
      audioEl.remote.removeEventListener('disconnect', onDisconnect);
    } catch (e) {
      // ignore
    }
  };
}

export function getCastAppId() {
  return process.env.REACT_APP_GOOGLE_CAST_APP_ID || 'CC1AD845';
}
