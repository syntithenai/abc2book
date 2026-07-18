import {
  clearActiveMediaProxyBase,
  isMediaProxyConfigured,
  probeMediaResolverCandidates,
} from './mediaProxyClient';
import { readStoredAuthBase, resolveStickyAuthBase } from './authResolverClient';

const initialState = {
  available: false,
  checked: false,
  status: null,
  authBase: '',
  authBaseChecked: false,
};

let state = Object.assign({}, initialState);
const listeners = new Set();
let activeAccessToken = null;
let probePromise = null;
let probeSeq = 0;
let probeInFlight = false;
let lastUnreachableProbeAt = 0;
let settingsListenerAttached = false;
let identityScopeRequestFn = null;

// Failed proxied requests trigger re-probes; without a cooldown a burst of
// failures (resolver down, several resolver-backed features in use) floods
// /health with parallel probes.
const UNREACHABLE_REPROBE_COOLDOWN_MS = 30000;

export function setMediaResolverIdentityScopeRequest(fn) {
  identityScopeRequestFn = typeof fn === 'function' ? fn : null;
}

function shouldRetryResolverAuth(status) {
  return status
    && status.requireAuth
    && !status.available
    && status.authReason === 'invalid_token';
}

function applyProbeResult(nextStatus) {
  const candidates = nextStatus && nextStatus.candidates ? nextStatus.candidates : [];
  const authBase = resolveStickyAuthBase(candidates, readStoredAuthBase());
  setState({
    status: nextStatus,
    available: !!(nextStatus && nextStatus.available),
    checked: true,
    authBase: authBase || '',
    authBaseChecked: true,
  });
  return !!(nextStatus && nextStatus.available);
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
        return applyProbeResult(retriedStatus);
      }
    } catch (err) {
      console.warn('Media resolver auth: could not obtain Google identity scopes', err);
    }
  }

  return applyProbeResult(nextStatus);
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

export function getAuthResolverBase() {
  return state.authBase || '';
}

export function subscribeMediaResolverHealth(listener) {
  listeners.add(listener);
  return function unsubscribe() {
    listeners.delete(listener);
  };
}

/** Wait until authBaseChecked (or timeout). Resolves with current authBase. */
export function waitForAuthBase(timeoutMs) {
  const limit = typeof timeoutMs === 'number' ? timeoutMs : 3000;
  if (state.authBaseChecked) {
    return Promise.resolve(state.authBase || '');
  }
  if (!isMediaProxyConfigured()) {
    setState({ authBaseChecked: true, authBase: '', checked: true, available: false, status: null });
    return Promise.resolve('');
  }
  return new Promise(function(resolve) {
    let settled = false;
    const timer = setTimeout(function() {
      if (settled) return;
      settled = true;
      unsubscribe();
      // Timed out — mark checked so login can proceed with Token Client.
      if (!state.authBaseChecked) {
        setState({ authBaseChecked: true });
      }
      resolve(state.authBase || '');
    }, limit);

    const unsubscribe = subscribeMediaResolverHealth(function(next) {
      if (settled) return;
      if (next.authBaseChecked) {
        settled = true;
        clearTimeout(timer);
        unsubscribe();
        resolve(next.authBase || '');
      }
    });
  });
}

export function probeMediaResolverHealth(accessToken, options) {
  const force = !!(options && options.force);

  if (!isMediaProxyConfigured()) {
    probeSeq += 1;
    probePromise = null;
    setState({
      available: false,
      checked: true,
      status: null,
      authBase: '',
      authBaseChecked: true,
    });
    return Promise.resolve(false);
  }

  if (!force && probePromise && activeAccessToken === accessToken && state.checked) {
    return probePromise;
  }

  // A probe is already running for this token; share it instead of stacking
  // another round of /health requests behind it.
  if (probeInFlight && probePromise && activeAccessToken === accessToken) {
    return probePromise;
  }

  activeAccessToken = accessToken;
  // Only the most recently issued probe may write state. Without this guard,
  // an earlier probe (e.g. the pre-login null-token request that returns
  // unauthorized) can resolve after a later authorized probe and clobber the
  // good result, making resolver-backed buttons disappear intermittently.
  probeSeq += 1;
  const mySeq = probeSeq;
  probeInFlight = true;
  probePromise = finishProbe(accessToken, mySeq).finally(function() {
    if (mySeq === probeSeq) probeInFlight = false;
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
  // A proxied request that could not reach any resolver means our cached
  // "available" status is stale. Re-probe so the UI stops claiming the
  // resolver is available instead of continuing to offer resolver-backed
  // actions that immediately fail. Rate-limited: a burst of failing requests
  // must not turn into a burst of /health probes.
  window.addEventListener('mediaProxyUnreachable', function() {
    const now = Date.now();
    if (probeInFlight) return;
    if (now - lastUnreachableProbeAt < UNREACHABLE_REPROBE_COOLDOWN_MS) return;
    lastUnreachableProbeAt = now;
    probeMediaResolverHealth(activeAccessToken, { force: true });
  });
}
