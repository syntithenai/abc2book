/** Visibility helpers for the compact remote-output menu. */

import { isAndroidApp, isCastWebSdkSupported } from './platformUtils';
import { hasHomeSnapcastPlayback } from './preferredOutputCoordinator';
import {
  getChromecastOutputEnabled,
  getSnapcastOutputEnabled,
} from './preferredRemoteOutputSettings';
import { normalizeAccessToken } from './resolverCreditAccess';
import { isSetSinkIdSupported } from './outputDeviceSupport';

function authBlockedCandidate(candidate) {
  return !!(candidate
    && candidate.reachable
    && candidate.requireAuth
    && candidate.available === false);
}

export function needsHomeResolverLogin(resolverStatus, accessToken) {
  if (normalizeAccessToken(accessToken)) return false;
  const candidates = (resolverStatus && resolverStatus.candidates) || [];
  return candidates.some(authBlockedCandidate);
}

export function hasRemoteCastInfrastructure(resolverStatus, resolverFeatures) {
  if (resolverFeatures && (resolverFeatures.castPlayback || resolverFeatures.proxy)) {
    return true;
  }
  const candidates = (resolverStatus && resolverStatus.candidates) || [];
  return candidates.some(function(candidate) {
    return !!(candidate.reachable
      && candidate.features
      && (candidate.features.castPlayback || candidate.features.proxy));
  });
}

export function getRemoteOutputMenuSections(opts) {
  const mediaController = opts.mediaController;
  const resolverStatus = mediaController && mediaController.mediaResolverStatus;
  const resolverFeatures = (mediaController && mediaController.resolverFeatures) || {};
  const accessToken = opts.accessToken;
  const snapcast = opts.snapcast || {};
  const castSession = opts.castSession || {};
  const airplayCast = opts.airplayCast || {};
  const canSnapcast = !!opts.canSnapcast;
  const canAirPlay = !!opts.canAirPlay;
  const castReason = opts.castReason || null;
  const castSdkEnabled = !!opts.castSdkEnabled;
  const snapcastEnabled = !!opts.snapcastEnabled;
  const sessionPayload = opts.sessionPayload;

  const snapcastOutputEnabled = getSnapcastOutputEnabled();
  const chromecastOutputEnabled = getChromecastOutputEnabled();
  const castWebSdkSupported = isCastWebSdkSupported();
  const homeLoginRequired = needsHomeResolverLogin(resolverStatus, accessToken);

  const snapcastInfra = hasHomeSnapcastPlayback(resolverStatus) || !!resolverFeatures.snapcastControl;
  const castInfra = hasRemoteCastInfrastructure(resolverStatus, resolverFeatures);

  const snapcastActive = !!(snapcast.routing || snapcast.connected);
  const castActive = !!(castSession.connected || castSession.joinable);
  const airPlayActive = !!airplayCast.connected;
  const airPlaySupported = !!(airplayCast.isAirPlaySupported || airplayCast.isRemotePlaybackSupported);

  const showLocalPicker = !isAndroidApp() && isSetSinkIdSupported();

  const showAirPlay = airPlaySupported && (airPlayActive || canAirPlay);

  const chromecastLoginOnly = chromecastOutputEnabled
    && castWebSdkSupported
    && castInfra
    && homeLoginRequired
    && !castSdkEnabled;
  const snapcastLoginOnly = snapcastOutputEnabled
    && snapcastInfra
    && homeLoginRequired
    && !snapcastEnabled;

  const showChromecast = chromecastOutputEnabled
    && castWebSdkSupported
    && castInfra
    && (castActive || chromecastLoginOnly || (castSdkEnabled && !castReason));

  const showSnapcast = snapcastOutputEnabled
    && snapcastInfra
    && (snapcastActive || snapcastLoginOnly || (snapcastEnabled && canSnapcast && !!sessionPayload));

  const activeLabel = snapcast.routing
    ? 'Snapcast'
    : (castSession.connected ? 'Chromecast'
      : (airPlayActive ? 'AirPlay' : null));

  const showMenu = showLocalPicker || showAirPlay || showChromecast || showSnapcast;

  return {
    showMenu: showMenu,
    activeLabel: activeLabel,
    showLocalPicker: showLocalPicker,
    showAirPlay: showAirPlay,
    showChromecast: showChromecast,
    showSnapcast: showSnapcast,
    chromecastLoginOnly: chromecastLoginOnly,
    snapcastLoginOnly: snapcastLoginOnly,
    sessionPayload: sessionPayload,
  };
}
