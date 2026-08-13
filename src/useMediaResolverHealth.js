import { useCallback, useEffect, useState } from 'react';
import { GOOGLE_IDENTITY_SCOPES } from './googleIdentityScopes';
import { isAndroidApp } from './platformUtils';
import { getResolverFeaturesFromStatus } from './resolverFeatures';
import {
  setResolverLoginToastLogin,
  startResolverLoginToastSync,
} from './resolverLoginToast';
import {
  ensureMediaResolverHealthSettingsListener,
  getMediaResolverHealthState,
  probeMediaResolverHealth,
  refreshMediaResolverHealth as refreshStoredMediaResolverHealth,
  setMediaResolverIdentityScopeRequest,
  subscribeMediaResolverHealth,
} from './mediaResolverHealthStore';

export function useInitMediaResolverHealth(accessToken, requestGoogleScopes, login) {
  useEffect(function() {
    setResolverLoginToastLogin(login);
  });

  useEffect(function() {
    ensureMediaResolverHealthSettingsListener();
    if (requestGoogleScopes) {
      setMediaResolverIdentityScopeRequest(function() {
        return requestGoogleScopes(GOOGLE_IDENTITY_SCOPES);
      });
    } else {
      setMediaResolverIdentityScopeRequest(null);
    }
    var probeTimer = null
    function runProbe() {
      if (accessToken) {
        probeMediaResolverHealth(accessToken);
      } else {
        // Explicit logout / signed-out mount: drop any stale bearer.
        probeMediaResolverHealth(null, { clearActiveToken: true });
      }
    }
    if (isAndroidApp() && !accessToken) {
      // Defer cold-start probe — useGoogleLogin also probes after login.
      probeTimer = setTimeout(runProbe, 6000)
    } else if (isAndroidApp()) {
      probeTimer = setTimeout(runProbe, 1500)
    } else {
      runProbe()
    }
    const stopLoginToast = startResolverLoginToastSync(accessToken);
    return function() {
      if (probeTimer) clearTimeout(probeTimer)
      setMediaResolverIdentityScopeRequest(null);
      stopLoginToast();
    };
  }, [accessToken, requestGoogleScopes]);

  // While the resolver is downloading MusyngKite, re-probe so playback can switch
  // to the full bank without a page reload.
  useEffect(function() {
    let timer = null;
    function scheduleFromState(next) {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      const status = next && next.status ? next.status : null;
      const downloading = !!(status && status.available && status.soundfontsRunning && !status.soundfontsReady);
      if (!downloading) return;
      timer = setInterval(function() {
        refreshStoredMediaResolverHealth();
      }, 20000);
    }
    scheduleFromState(getMediaResolverHealthState());
    const unsubscribe = subscribeMediaResolverHealth(scheduleFromState);
    return function() {
      unsubscribe();
      if (timer) clearInterval(timer);
    };
  }, []);
}

export default function useMediaResolverHealth() {
  const [health, setHealth] = useState(getMediaResolverHealthState);

  useEffect(function() {
    setHealth(getMediaResolverHealthState());
    return subscribeMediaResolverHealth(setHealth);
  }, []);

  const refreshMediaResolverHealth = useCallback(function(accessToken) {
    return refreshStoredMediaResolverHealth(accessToken);
  }, []);

  return {
    available: health.available,
    checked: health.checked,
    status: health.status,
    authBase: health.authBase || '',
    authBaseChecked: !!health.authBaseChecked,
    features: getResolverFeaturesFromStatus(health.status),
    refreshMediaResolverHealth,
  };
}
