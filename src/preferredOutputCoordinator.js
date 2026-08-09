import { toast } from 'react-toastify';
import { buildRemoteOutputQueue } from './remoteOutputQueue';
import { buildRemotePlaybackSessionPayload } from './remotePlaybackSessionPayload';
import {
  canRouteToSnapcastPlayback,
  getSnapcastDisabledReason,
} from './remoteOutputSupport';
import {
  getPreferredRemoteOutput,
  getSnapcastAutoConnect,
  getSnapcastFallbackToLocal,
  getSnapcastOutputEnabled,
  isSnapcastPreferredOutput,
  PREFERRED_OUTPUT_SNAPCAST,
} from './preferredRemoteOutputSettings';
import {
  getSnapcastPlaybackProxyBase,
  isCloudLightResolverBase,
  resolveSnapcastPlaybackBase,
} from './mediaProxyClient';
import { isRemoteOutputUiEnabled } from './remoteOutputUi';

function candidateSupportsSnapcastPlayback(candidate) {
  return !!(candidate
    && candidate.features
    && candidate.features.snapcastPlayback);
}

function isReachableHomeSnapcastCandidate(candidate) {
  if (!candidate || !candidate.reachable) return false;
  if (isCloudLightResolverBase(candidate.base)) return false;
  return candidateSupportsSnapcastPlayback(candidate);
}

export function hasHomeSnapcastPlayback(mediaResolverStatus) {
  const moduleBase = getSnapcastPlaybackProxyBase();
  if (moduleBase && !isCloudLightResolverBase(moduleBase)) {
    return true;
  }
  if (!mediaResolverStatus) return false;
  if (mediaResolverStatus.snapcastPlaybackBase
    && !isCloudLightResolverBase(mediaResolverStatus.snapcastPlaybackBase)) {
    return true;
  }
  const candidates = mediaResolverStatus.candidates || [];
  if (resolveSnapcastPlaybackBase(candidates)) {
    return true;
  }
  for (let i = 0; i < candidates.length; i++) {
    if (isReachableHomeSnapcastCandidate(candidates[i])) {
      return true;
    }
  }
  if (mediaResolverStatus.snapcast && mediaResolverStatus.snapcast.enabled) {
    const activeBase = mediaResolverStatus.activeBase || '';
    return !!activeBase && !isCloudLightResolverBase(activeBase);
  }
  return false;
}

function snapcastHomeResolverMessage(mediaResolverStatus) {
  const candidates = mediaResolverStatus && mediaResolverStatus.candidates
    ? mediaResolverStatus.candidates
    : [];
  const needsSignIn = candidates.some(function(candidate) {
    return isReachableHomeSnapcastCandidate(candidate)
      && candidate.requireAuth
      && candidate.available === false;
  });
  if (needsSignIn) {
    return 'Sign in to use Snapcast with your home resolver.';
  }
  return 'Snapcast default needs your home resolver with snapcast playback enabled.';
}

export function createPreferredOutputCoordinator({
  mediaController,
  snapcast,
  tunebook,
  nowPlayingQueue,
  tunes,
}) {
  let lastRoutedKey = '';

  function routeKey(tune, linkIndex) {
    if (!tune) return '';
    return String(tune.id || '') + ':' + String(linkIndex != null ? linkIndex : 0);
  }

  async function tryRouteOnPlay(playOpts) {
    if (!isRemoteOutputUiEnabled()) return false;
    if (!getSnapcastOutputEnabled()) return false;
    if (!isSnapcastPreferredOutput()) return false;
    if (!mediaController) return false;
    if (!hasHomeSnapcastPlayback(mediaController.mediaResolverStatus)) {
      toast.warning(
        snapcastHomeResolverMessage(mediaController.mediaResolverStatus),
        { autoClose: 6000 },
      );
      return getSnapcastFallbackToLocal() ? false : 'blocked';
    }
    if (!canRouteToSnapcastPlayback(mediaController)) {
      const reason = getSnapcastDisabledReason(mediaController) || 'This tune cannot play on Snapcast';
      toast.info(reason, { autoClose: 6000 });
      return false;
    }
    const payload = buildRemotePlaybackSessionPayload(mediaController, tunebook, {
      queue: buildRemoteOutputQueue(mediaController, nowPlayingQueue, tunes),
      nowPlayingQueue: nowPlayingQueue,
      tunes: tunes,
    });
    if (!payload) return false;

    const tune = mediaController.tune;
    const linkIndex = mediaController.mediaLinkNumber;
    const key = routeKey(tune, linkIndex);
    const tuneChanged = !!(snapcast.routing && lastRoutedKey && lastRoutedKey !== key);

    if (getSnapcastAutoConnect() && !snapcast.connected) {
      const connected = await snapcast.connect();
      if (!connected) {
        toast.error(snapcast.connectError || 'Could not connect to Snapcast', { autoClose: 8000 });
        return false;
      }
    }

    if (tuneChanged && snapcast.routing) {
      await snapcast.stopRouting();
    }

    const ok = await snapcast.startRoutingWithConnect({
      payload: payload,
      skipReplaceConfirm: true,
      groupId: snapcast.selectedGroupId,
    });
    if (ok) {
      lastRoutedKey = key;
      return true;
    }
    if (getSnapcastFallbackToLocal()) {
      return false;
    }
    return 'blocked';
  }

  function getPreference() {
    return getPreferredRemoteOutput();
  }

  function isSnapcastDefault() {
    return isSnapcastPreferredOutput();
  }

  function clearLastRoutedKey() {
    lastRoutedKey = '';
  }

  return {
    tryRouteOnPlay: tryRouteOnPlay,
    getPreference: getPreference,
    isSnapcastDefault: isSnapcastDefault,
    clearLastRoutedKey: clearLastRoutedKey,
    hasHomeSnapcastPlayback: function() {
      return hasHomeSnapcastPlayback(mediaController && mediaController.mediaResolverStatus);
    },
    PREFERRED_OUTPUT_SNAPCAST: PREFERRED_OUTPUT_SNAPCAST,
  };
}
