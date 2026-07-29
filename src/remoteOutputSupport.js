/** Shared eligibility for remote output targets (Cast, Snapcast, AirPlay). */

import { playbackNeedsExternalProcessing, pitchShiftIsActive, getMediaPlaybackSettings } from './pitchTempoUtils';
import { canCastNativeAudio } from './mediaCastSupport';
import { requiresResolverProxiedPlayback } from './mediaProxyClient';

export function isRemoteOutputActive(remoteOutputEngineRef) {
  const engine = remoteOutputEngineRef && remoteOutputEngineRef.current;
  return !!(engine && engine.mode && engine.connected !== false);
}

export function getRemoteOutputMode(remoteOutputEngineRef) {
  const engine = remoteOutputEngineRef && remoteOutputEngineRef.current;
  return engine && engine.mode ? engine.mode : null;
}

/** AirPlay / Remote Playback handoff — native <audio> stays the clock. */
export function usesNativeElementRemoteHandoff(remoteOutputEngineRef) {
  const engine = remoteOutputEngineRef && remoteOutputEngineRef.current;
  if (!engine || engine.connected === false) return false;
  if (engine.mode === 'airplay') return true;
  if (engine.subMode === 'remotePlayback' || engine.subMode === 'airplay') return true;
  return false;
}

function tuneNeedsProcessing(tune) {
  if (!tune) return false;
  const settings = getMediaPlaybackSettings(tune);
  return pitchShiftIsActive(settings.pitch, settings.fineTune)
    || playbackNeedsExternalProcessing(settings);
}

function tuneSrcType(mediaController) {
  if (!mediaController || !mediaController.tune) return null;
  const tune = mediaController.tune;
  const src = mediaController.getSrc
    ? mediaController.getSrc(tune, mediaController.mediaLinkNumber)
    : null;
  return mediaController.getSrcType ? mediaController.getSrcType(src) : null;
}

function resolverFeatures(mediaController) {
  return (mediaController && mediaController.resolverFeatures) || {};
}

export function canRouteYoutubeToRemote(mediaController) {
  const features = resolverFeatures(mediaController);
  if (!features.youtubeAudio) return false;
  if (mediaController.isMidiPlaybackRoute && mediaController.isMidiPlaybackRoute()) return false;
  if (mediaController.isMidiFileMediaRoute && mediaController.isMidiFileMediaRoute()) return false;
  return tuneSrcType(mediaController) === 'youtube';
}

export function canRouteMidiFileToRemote(mediaController) {
  const features = resolverFeatures(mediaController);
  if (!features.midiRender) return false;
  if (!mediaController.isMidiFileMediaRoute || !mediaController.isMidiFileMediaRoute()) return false;
  return !!mediaController.tune;
}

export function canRouteAbcMidiToRemote(mediaController) {
  const features = resolverFeatures(mediaController);
  if (!features.midiRender) return false;
  if (!mediaController.isMidiPlaybackRoute || !mediaController.isMidiPlaybackRoute()) return false;
  return !!mediaController.tune;
}

export function canRouteToSnapcastPlayback(mediaController) {
  if (!mediaController) return false;
  const features = resolverFeatures(mediaController);
  if (!features.snapcastPlayback) return false;
  if (canRouteAbcMidiToRemote(mediaController)) return true;
  if (mediaController.isMidiPlaybackRoute && mediaController.isMidiPlaybackRoute()) return false;
  if (canRouteMidiFileToRemote(mediaController)) return true;
  if (mediaController.isMidiFileMediaRoute && mediaController.isMidiFileMediaRoute()) return false;
  const tune = mediaController.tune;
  if (!tune) return false;
  const srcType = tuneSrcType(mediaController);
  if (srcType === 'midi' && canRouteMidiFileToRemote(mediaController)) return true;
  if (srcType === 'midi') return false;
  if (srcType === 'youtube') return canRouteYoutubeToRemote(mediaController);
  if (mediaController.isExternalOutputActive && mediaController.isExternalOutputActive()) {
    return features.snapcastPlayback && needsCastTranscodeSession(mediaController);
  }
  if (!needsCastTranscodeSession(mediaController)) {
    if (tuneNeedsProcessing(tune)) return false;
  }
  return srcType === 'audio' || srcType === 'recording' || srcType === 'youtube';
}

export function needsCastTranscodeSession(mediaController) {
  if (!mediaController || !mediaController.tune) return false;
  if (mediaController.isExternalOutputActive && mediaController.isExternalOutputActive()) return true;
  return tuneNeedsProcessing(mediaController.tune);
}

/** Use resolver /cast-playback HLS (or transcode) instead of a direct proxy URL. */
export function needsCastHlsSession(mediaController, payload) {
  if (!payload) return false;
  const features = resolverFeatures(mediaController);
  if (needsCastTranscodeSession(mediaController)) return true;
  if (payload.sourceType === 'abc-midi') return true;
  if (payload.sourceType === 'youtube' && features.castPlayback) return true;
  if (payload.concatSet && Array.isArray(payload.queue) && payload.queue.length > 1) return true;
  if (features.castPlayback && requiresResolverProxiedPlayback(payload.source)) return true;
  return false;
}

export function canRouteToCastSdk(mediaController) {
  if (!mediaController) return false;
  const features = resolverFeatures(mediaController);
  if (!features.castPlayback && !features.proxy) return false;
  if (canRouteAbcMidiToRemote(mediaController)) return true;
  if (mediaController.isMidiPlaybackRoute && mediaController.isMidiPlaybackRoute()) {
    return false;
  }
  if (canRouteMidiFileToRemote(mediaController)) return true;
  if (mediaController.isMidiFileMediaRoute && mediaController.isMidiFileMediaRoute()) {
    return false;
  }
  const tune = mediaController.tune;
  if (!tune) return false;
  const srcType = tuneSrcType(mediaController);
  if (srcType === 'midi' && canRouteMidiFileToRemote(mediaController)) return true;
  if (srcType === 'midi') return false;
  if (srcType === 'youtube') return canRouteYoutubeToRemote(mediaController);
  if (needsCastTranscodeSession(mediaController)) {
    return features.castPlayback === true;
  }
  if (tuneNeedsProcessing(tune)) return false;
  return srcType === 'audio' || srcType === 'recording';
}

export function getSnapcastDisabledReason(mediaController) {
  if (!mediaController || !mediaController.resolverFeatures) {
    return 'Resolver features unavailable';
  }
  if (!mediaController.resolverFeatures.snapcastControl) {
    return 'Enable Snapcast with docker compose --profile snapcast';
  }
  if (!mediaController.resolverFeatures.snapcastPlayback) {
    return 'Snapcast playback requires ffmpeg on the resolver';
  }
  if (!canRouteToSnapcastPlayback(mediaController)) {
    if (canRouteYoutubeToRemote(mediaController) === false && tuneSrcType(mediaController) === 'youtube') {
      return 'YouTube routing requires resolver youtubeAudio';
    }
    if (needsCastTranscodeSession(mediaController) && !mediaController.resolverFeatures.snapcastPlayback) {
      return 'Processed Snapcast requires ffmpeg transcode on the resolver';
    }
    return 'Snapcast supports audio links with neutral or processed settings';
  }
  return null;
}

export function getCastSdkDisabledReason(mediaController) {
  if (!mediaController) return 'No media loaded';
  const features = resolverFeatures(mediaController);
  const srcType = tuneSrcType(mediaController);
  if (!canRouteToCastSdk(mediaController)) {
    if (srcType === 'youtube' && !features.youtubeAudio) {
      return 'YouTube Cast requires resolver youtubeAudio';
    }
    if (srcType === 'youtube' && features.youtubeAudio && !features.castPlayback) {
      return 'YouTube Cast requires a resolver with castPlayback (ffmpeg HLS)';
    }
    if (needsCastTranscodeSession(mediaController) && !features.castPlayback) {
      return 'Processed Cast requires resolver castPlayback (ffmpeg HLS)';
    }
    return 'Chromecast supports audio and YouTube via resolver';
  }
  if (srcType === 'youtube' && features.castPlayback) {
    const castInfo = mediaController.mediaResolverStatus && mediaController.mediaResolverStatus.cast;
    if (castInfo && castInfo.enabled === false) {
      return 'This resolver does not offer Chromecast HLS playback';
    }
  }
  return null;
}

export { canCastNativeAudio };
