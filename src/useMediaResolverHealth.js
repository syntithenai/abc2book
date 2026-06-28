import { useCallback, useEffect, useState } from 'react';
import {
  ensureMediaResolverHealthSettingsListener,
  getMediaResolverHealthState,
  probeMediaResolverHealth,
  refreshMediaResolverHealth as refreshStoredMediaResolverHealth,
  subscribeMediaResolverHealth,
} from './mediaResolverHealthStore';

export function useInitMediaResolverHealth(accessToken) {
  useEffect(function() {
    ensureMediaResolverHealthSettingsListener();
    probeMediaResolverHealth(accessToken);
  }, [accessToken]);
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
    refreshMediaResolverHealth,
  };
}
