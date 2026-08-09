import { isAndroidApp } from './platformUtils';
import { isRemoteOutputUiEnabled } from './remoteOutputUi';

const PREFERRED_OUTPUT_KEY = 'bookstorage_preferred_remote_output';
const YOUTUBE_ACK_KEY = 'bookstorage_snapcast_youtube_ack';
const AUTO_CONNECT_KEY = 'bookstorage_snapcast_auto_connect';
const FALLBACK_LOCAL_KEY = 'bookstorage_snapcast_fallback_local';
const SNAPCAST_OUTPUT_KEY = 'bookstorage_snapcast_output_enabled';
const CHROMECAST_OUTPUT_KEY = 'bookstorage_chromecast_output_enabled';

export const PREFERRED_OUTPUT_LOCAL = 'local';
export const PREFERRED_OUTPUT_SNAPCAST = 'snapcast';

export function notifyPreferredRemoteOutputChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('preferredRemoteOutputChanged'));
}

export function getPreferredRemoteOutput() {
  try {
    const value = localStorage.getItem(PREFERRED_OUTPUT_KEY);
    return value === PREFERRED_OUTPUT_SNAPCAST ? PREFERRED_OUTPUT_SNAPCAST : PREFERRED_OUTPUT_LOCAL;
  } catch (e) {
    return PREFERRED_OUTPUT_LOCAL;
  }
}

export function setPreferredRemoteOutput(value) {
  const next = value === PREFERRED_OUTPUT_SNAPCAST
    ? PREFERRED_OUTPUT_SNAPCAST
    : PREFERRED_OUTPUT_LOCAL;
  try {
    if (next === PREFERRED_OUTPUT_LOCAL) {
      localStorage.removeItem(PREFERRED_OUTPUT_KEY);
    } else {
      localStorage.setItem(PREFERRED_OUTPUT_KEY, next);
    }
  } catch (e) {
    return PREFERRED_OUTPUT_LOCAL;
  }
  notifyPreferredRemoteOutputChanged();
  return next;
}

export function isSnapcastPreferredOutput() {
  return getSnapcastOutputEnabled()
    && getPreferredRemoteOutput() === PREFERRED_OUTPUT_SNAPCAST;
}

export function getSnapcastYoutubeAcknowledged() {
  try {
    return localStorage.getItem(YOUTUBE_ACK_KEY) === '1';
  } catch (e) {
    return false;
  }
}

export function setSnapcastYoutubeAcknowledged(acknowledged) {
  try {
    if (acknowledged) {
      localStorage.setItem(YOUTUBE_ACK_KEY, '1');
    } else {
      localStorage.removeItem(YOUTUBE_ACK_KEY);
    }
  } catch (e) {
    return false;
  }
  notifyPreferredRemoteOutputChanged();
  return !!acknowledged;
}

export function getSnapcastAutoConnect() {
  try {
    const raw = localStorage.getItem(AUTO_CONNECT_KEY);
    if (raw === '0') return false;
    return true;
  } catch (e) {
    return true;
  }
}

export function setSnapcastAutoConnect(enabled) {
  try {
    localStorage.setItem(AUTO_CONNECT_KEY, enabled ? '1' : '0');
  } catch (e) {
    return false;
  }
  notifyPreferredRemoteOutputChanged();
  return !!enabled;
}

export function getSnapcastFallbackToLocal() {
  try {
    const raw = localStorage.getItem(FALLBACK_LOCAL_KEY);
    if (raw === '0') return false;
    return true;
  } catch (e) {
    return true;
  }
}

export function setSnapcastFallbackToLocal(enabled) {
  try {
    localStorage.setItem(FALLBACK_LOCAL_KEY, enabled ? '1' : '0');
  } catch (e) {
    return false;
  }
  notifyPreferredRemoteOutputChanged();
  return !!enabled;
}

function readOutputEnabledFlag(key, defaultWhenUnset) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === '0') return false;
    if (raw === '1') return true;
    return defaultWhenUnset;
  } catch (e) {
    return defaultWhenUnset;
  }
}

function writeOutputEnabledFlag(key, enabled) {
  try {
    localStorage.setItem(key, enabled ? '1' : '0');
  } catch (e) {
    return false;
  }
  notifyPreferredRemoteOutputChanged();
  return !!enabled;
}

export function getSnapcastOutputEnabled() {
  if (!isRemoteOutputUiEnabled()) return false;
  return readOutputEnabledFlag(SNAPCAST_OUTPUT_KEY, true);
}

export function setSnapcastOutputEnabled(enabled) {
  const next = !!enabled;
  writeOutputEnabledFlag(SNAPCAST_OUTPUT_KEY, next);
  if (!next && getPreferredRemoteOutput() === PREFERRED_OUTPUT_SNAPCAST) {
    setPreferredRemoteOutput(PREFERRED_OUTPUT_LOCAL);
  }
  return next;
}

export function getChromecastOutputEnabled() {
  if (!isRemoteOutputUiEnabled()) return false;
  return readOutputEnabledFlag(CHROMECAST_OUTPUT_KEY, !isAndroidApp());
}

export function setChromecastOutputEnabled(enabled) {
  return writeOutputEnabledFlag(CHROMECAST_OUTPUT_KEY, !!enabled);
}

export function isRemoteOutputEnabled() {
  return getSnapcastOutputEnabled() || getChromecastOutputEnabled();
}

export function setRemoteOutputEnabled(enabled) {
  const next = !!enabled;
  setSnapcastOutputEnabled(next);
  setChromecastOutputEnabled(next);
  if (!next && getPreferredRemoteOutput() === PREFERRED_OUTPUT_SNAPCAST) {
    setPreferredRemoteOutput(PREFERRED_OUTPUT_LOCAL);
  }
  return next;
}
