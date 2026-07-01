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
let identityScopeRequestFn = null;

export function setMediaResolverIdentityScopeRequest(fn) {
  identityScopeRequestFn = typeof fn === 'function' ? fn : null;
}

function shouldRetryResolverAuth(status) {
  return status
    && status.requireAuth
    && !status.available
    && status.authReason === 'invalid_token';
}

async function finishProbe(accessToken, mySeq) {
  const nextStatus = await probeMediaResolverCandidates(accessToken);
  if (mySeq !== probeSeq) {
    return nextStatus.available;
  }

  if (shouldRetryResolverAuth(nextStatus)
      && identityScopeRequestFn
      && typeof localStorage !== 'undefined'
      && localStorage.getItem('google_login_user')) {
    try {
      const tokenResponse = await identityScopeRequestFn();
      const upgradedToken = tokenResponse && tokenResponse.access_token
        ? tokenResponse.access_token
        : null;
      if (upgradedToken) {
        activeAccessToken = upgradedToken;
        const retriedStatus = await probeMediaResolverCandidates(upgradedToken);
        if (mySeq !== probeSeq) {
          return retriedStatus.available;
        }
        setState({
          status: retriedStatus,
          available: retriedStatus.available,
          checked: true,
        });
        return retriedStatus.available;
      }
    } catch (err) {
      console.warn('Media resolver auth: could not obtain Google identity scopes', err);
    }
  }

  setState({
    status: nextStatus,
    available: nextStatus.available,
    checked: true,
  });
  return nextStatus.available;
}

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
  probePromise = finishProbe(accessToken, mySeq);

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
  // A proxied request that could not reach any resolver means our cached
  // "available" status is stale. Re-probe so the UI reflects reality instead
  // of continuing to offer resolver-backed actions that immediately fail.
  window.addEventListener('mediaProxyUnreachable', function() {
    probeMediaResolverHealth(activeAccessToken, { force: true });
  });
}
