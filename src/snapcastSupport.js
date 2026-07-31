/** Snapcast server URL helpers and health-derived defaults. */

const STORAGE_KEY = 'abc2book.snapcast.controlUrl';

export function isValidSnapcastControlUrl(url) {
  const raw = String(url || '').trim();
  if (!raw || raw === '[object Object]' || raw === '[object Event]') return false;
  if (raw.indexOf('://') < 0) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      || parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
  } catch (e) {
    return false;
  }
}

export function normalizeSnapcastControlUrl(value) {
  if (value == null) return '';
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const raw = String(value).trim();
  return isValidSnapcastControlUrl(raw) ? raw : '';
}

export function getStoredSnapcastControlUrl() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || '';
    const normalized = normalizeSnapcastControlUrl(raw);
    if (raw && !normalized) {
      localStorage.removeItem(STORAGE_KEY);
    }
    return normalized;
  } catch (e) {
    return '';
  }
}

export function setStoredSnapcastControlUrl(url) {
  const normalized = normalizeSnapcastControlUrl(url);
  try {
    if (!normalized) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, normalized);
    }
  } catch (e) {
    // ignore
  }
  return normalized;
}

export function controlUrlToJsonRpcWs(controlUrl) {
  const raw = normalizeSnapcastControlUrl(controlUrl);
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
  const override = normalizeSnapcastControlUrl(overrideUrl)
    || getStoredSnapcastControlUrl();
  if (override) return override;
  if (healthStatus && healthStatus.snapcast && healthStatus.snapcast.controlUrl) {
    return normalizeSnapcastControlUrl(healthStatus.snapcast.controlUrl);
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

export function snapcastMixedContentWarning(controlUrl) {
  if (typeof window === 'undefined' || !controlUrl) return '';
  try {
    if (window.location.protocol !== 'https:') return '';
    const url = new URL(controlUrl);
    if (url.protocol === 'http:') {
      return 'Snapcast control uses HTTP but this page is HTTPS. Set SNAPCAST_PUBLIC_URL on your resolver or use Settings override.';
    }
  } catch (e) {
    return '';
  }
  return '';
}
