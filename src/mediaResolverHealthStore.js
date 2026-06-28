import {
  clearActiveMediaProxyBase,
  isMediaProxyConfigured,
  probeMediaResolverCandidates,
} from './mediaProxyClient';

const initialState = {
  available: false,
  checked: false,
  status: null,
};

let state = Object.assign({}, initialState);
const listeners = new Set();
let activeAccessToken = null;
let probePromise = null;
let probeSeq = 0;
let settingsListenerAttached = false;

function notify() {
  listeners.forEach(function(listener) {
    listener(state);
  });
}

function setState(patch) {
  state = Object.assign({}, state, patch);
  notify();
}

export function getMediaResolverHealthState() {
  return state;
}

export function subscribeMediaResolverHealth(listener) {
  listeners.add(listener);
  return function unsubscribe() {
    listeners.delete(listener);
  };
}

export function probeMediaResolverHealth(accessToken, options) {
  const force = !!(options && options.force);

  if (!isMediaProxyConfigured()) {
    probeSeq += 1;
    probePromise = null;
    setState({ available: false, checked: true, status: null });
    return Promise.resolve(false);
  }

  if (!force && probePromise && activeAccessToken === accessToken && state.checked) {
    return probePromise;
  }

  activeAccessToken = accessToken;
  // Only the most recently issued probe may write state. Without this guard,
  // an earlier probe (e.g. the pre-login null-token request that returns
  // unauthorized) can resolve after a later authorized probe and clobber the
  // good result, making resolver-backed buttons disappear intermittently.
  probeSeq += 1;
  const mySeq = probeSeq;
  probePromise = probeMediaResolverCandidates(accessToken).then(function(nextStatus) {
    if (mySeq !== probeSeq) {
      return nextStatus.available;
    }
    setState({
      status: nextStatus,
      available: nextStatus.available,
      checked: true,
    });
    return nextStatus.available;
  });

  return probePromise;
}

export function refreshMediaResolverHealth() {
  clearActiveMediaProxyBase();
  return probeMediaResolverHealth(activeAccessToken, { force: true });
}

export function ensureMediaResolverHealthSettingsListener() {
  if (settingsListenerAttached || typeof window === 'undefined') return;
  settingsListenerAttached = true;
  window.addEventListener('mediaProxySettingsChanged', function() {
    clearActiveMediaProxyBase();
    probeMediaResolverHealth(activeAccessToken, { force: true });
  });
}
