import { isMediaProxyConfigured } from './mediaProxyClient';
import { getMediaResolverHealthState } from './mediaResolverHealthStore';
import { isNavigatorOffline } from './offlineNetwork';

/**
 * True when resolver-backed media searches (Bandcamp, archives, etc.) should run.
 * Per-source feature flags are not required here — the server returns 404 when disabled.
 */
export function isResolverMediaSearchAvailable() {
  if (isNavigatorOffline()) return false;
  if (!isMediaProxyConfigured()) return false;
  const health = getMediaResolverHealthState();
  if (health && health.checked && !health.available) return false;
  return true;
}
