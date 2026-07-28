/** Snapcast server URL helpers and health-derived defaults. */

const STORAGE_KEY = 'abc2book.snapcast.controlUrl';

export function getStoredSnapcastControlUrl() {
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch (e) {
    return '';
  }
}

export function setStoredSnapcastControlUrl(url) {
  try {
    if (!url) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, url);
    }
  } catch (e) {
    // ignore
  }
}

export function controlUrlToJsonRpcWs(controlUrl) {
  const raw = String(controlUrl || '').trim();
  if (!raw) return '';
  if (raw.endsWith('/jsonrpc')) return raw.replace(/^http/, 'ws');
  const base = raw.replace(/\/$/, '');
  if (base.startsWith('ws://') || base.startsWith('wss://')) {
    return base.endsWith('/jsonrpc') ? base : base + '/jsonrpc';
  }
  const wsBase = base.replace(/^https?:\/\//, function(match) {
    return match === 'https://' ? 'wss://' : 'ws://';
  });
  return wsBase + '/jsonrpc';
}

export function resolveSnapcastControlUrl(healthStatus, overrideUrl) {
  const override = String(overrideUrl || getStoredSnapcastControlUrl() || '').trim();
  if (override) return override;
  if (healthStatus && healthStatus.snapcast && healthStatus.snapcast.controlUrl) {
    return healthStatus.snapcast.controlUrl;
  }
  return '';
}

export function snapcastAvailableFromHealth(healthStatus) {
  return !!(healthStatus
    && healthStatus.snapcast
    && healthStatus.snapcast.enabled
    && healthStatus.snapcast.reachable);
}

export function snapcastStreamNameFromHealth(healthStatus) {
  if (healthStatus && healthStatus.snapcast && healthStatus.snapcast.streamName) {
    return healthStatus.snapcast.streamName;
  }
  return 'TuneBook';
}
