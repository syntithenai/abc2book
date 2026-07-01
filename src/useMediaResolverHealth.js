import { useCallback, useEffect, useState } from 'react';
import { GOOGLE_IDENTITY_SCOPES } from './googleIdentityScopes';
import { getResolverFeaturesFromStatus } from './resolverFeatures';
import {
  ensureMediaResolverHealthSettingsListener,
  getMediaResolverHealthState,
  probeMediaResolverHealth,
  refreshMediaResolverHealth as refreshStoredMediaResolverHealth,
  setMediaResolverIdentityScopeRequest,
  subscribeMediaResolverHealth,
} from './mediaResolverHealthStore';

export function useInitMediaResolverHealth(accessToken, requestGoogleScopes) {
  useEffect(function() {
    ensureMediaResolverHealthSettingsListener();
    if (requestGoogleScopes) {
      setMediaResolverIdentityScopeRequest(function() {
        return requestGoogleScopes(GOOGLE_IDENTITY_SCOPES);
      });
    } else {
      setMediaResolverIdentityScopeRequest(null);
    }
    probeMediaResolverHealth(accessToken);
    return function() {
      setMediaResolverIdentityScopeRequest(null);
    };
  }, [accessToken, requestGoogleScopes]);
}

export default function useMediaResolverHealth() {
  const [health, setHealth] = useState(getMediaResolverHealthState);

  useEffect(function() {
    setHealth(getMediaResolverHealthState());
    return subscribeMediaResolverHealth(setHealth);
  }, []);

  const refreshMediaResolverHealth = useCallback(function() {
    return refreshStoredMediaResolverHealth();
  }, []);

  return {
    available: health.available,
    checked: health.checked,
    status: health.status,
    features: getResolverFeaturesFromStatus(health.status),
    refreshMediaResolverHealth,
  };
}
