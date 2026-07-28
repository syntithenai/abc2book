/** Shared eligibility for remote output targets (Cast, Snapcast, AirPlay). */

import { playbackNeedsExternalProcessing, pitchShiftIsActive } from './pitchTempoUtils';

export function isRemoteOutputActive(remoteOutputEngineRef) {
  const engine = remoteOutputEngineRef && remoteOutputEngineRef.current;
  return !!(engine && engine.mode && engine.connected !== false);
}

export function getRemoteOutputMode(remoteOutputEngineRef) {
  const engine = remoteOutputEngineRef && remoteOutputEngineRef.current;
  return engine && engine.mode ? engine.mode : null;
}

export function canRouteToSnapcastPlayback(mediaController) {
  if (!mediaController) return false;
  if (!mediaController.resolverFeatures || !mediaController.resolverFeatures.snapcastPlayback) {
    return false;
  }
  if (mediaController.isMidiPlaybackRoute && mediaController.isMidiPlaybackRoute()) {
    return false;
  }
  if (mediaController.isMidiFileMediaRoute && mediaController.isMidiFileMediaRoute()) {
    return false;
  }
  const tune = mediaController.tune;
  if (!tune) return false;
  const srcType = mediaController.getSrcType
    ? mediaController.getSrcType(
      mediaController.getSrc ? mediaController.getSrc(tune, mediaController.mediaLinkNumber) : null
    )
    : null;
  if (srcType === 'youtube') return false;
  if (srcType === 'midi') return false;
  if (mediaController.isExternalOutputActive && mediaController.isExternalOutputActive()) {
    return false;
  }
  if (pitchShiftIsActive(tune) || playbackNeedsExternalProcessing(tune)) {
    return false;
  }
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
    if (mediaController.isExternalOutputActive && mediaController.isExternalOutputActive()) {
      return 'Stop pitch shift or stem filters to use Snapcast';
    }
    return 'Snapcast supports neutral audio links only';
  }
  return null;
}
