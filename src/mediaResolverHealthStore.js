import {
  clearActiveMediaProxyBase,
  isMediaProxyConfigured,
  probeMediaResolverCandidates,
} from './mediaProxyClient';
import { readStoredAuthBase, readStoredAuthSessionId, isOAuthLoginInFlight, resolveStickyAuthBase } from './authResolverClient';

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

function authBaseUsesOauthBff() {
  const authBase = state.authBase || readStoredAuthBase();
  if (!authBase) return false;
  const candidates = state.status && state.status.candidates ? state.status.candidates : [];
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i].base === authBase && candidates[i].oauthBff) return true;
  }
  return false;
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
    // OAuth BFF handles identity + refresh; never stack extra GIS popups here.
    if (isOAuthLoginInFlight() || authBaseUsesOauthBff()
        || (readStoredAuthSessionId() && readStoredAuthBase())) {
      return applyProbeResult(nextStatus);
    }
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

export function getActiveResolverAccessToken() {
  return activeAccessToken || '';
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

// Resolver /health probes can take up to ~6s per candidate; do not treat the
// auth base as settled while a probe is still in flight.
const AUTH_PROBE_HARD_CAP_MS = 12000;

function authProbeSettled() {
  return state.authBaseChecked && !probeInFlight;
}

/** Wait until authBaseChecked (or timeout). Resolves with current authBase. */
export function waitForAuthBase(timeoutMs, options) {
  const limit = typeof timeoutMs === 'number' ? timeoutMs : 3000;
  const untilProbeSettled = !!(options && options.untilProbeSettled);
  if (authProbeSettled()) {
    return Promise.resolve(state.authBase || '');
  }
  if (!isMediaProxyConfigured()) {
    setState({ authBaseChecked: true, authBase: '', checked: true, available: false, status: null });
    return Promise.resolve('');
  }
  return new Promise(function(resolve) {
    let settled = false;
    const startedAt = Date.now();

    function finish() {
      if (settled) return;
      settled = true;
      clearTimeout(softTimer);
      clearInterval(pollTimer);
      unsubscribe();
      if (!state.authBaseChecked && !probeInFlight) {
        setState({ authBaseChecked: true });
      }
      resolve(state.authBase || '');
    }

    function maybeFinish() {
      if (settled) return;
      const elapsed = Date.now() - startedAt;
      if (authProbeSettled()) {
        finish();
        return;
      }
      if (elapsed >= AUTH_PROBE_HARD_CAP_MS) {
        finish();
        return;
      }
      if (untilProbeSettled) return;
      if (elapsed >= limit && !probeInFlight) finish();
    }

    const softTimer = setTimeout(maybeFinish, limit);
    const pollTimer = setInterval(maybeFinish, 100);

    const unsubscribe = subscribeMediaResolverHealth(function() {
      maybeFinish();
    });

    maybeFinish();
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

  // Only the most recently issued probe may write state. Without this guard,
  // an earlier probe (e.g. the pre-login null-token request that returns
  // unauthorized) can resolve after a later authorized probe and clobber the
  // good result, making resolver-backed buttons disappear intermittently.
  //
  // When probing without a token for OAuth discovery, keep any already-known
  // bearer so TTS / collection art / cache jobs do not suddenly strip Authorization
  // and trip media-proxy 401 → refresh → logout races.
  if (accessToken) {
    activeAccessToken = accessToken;
  } else if (options && options.clearActiveToken) {
    activeAccessToken = null;
  }
  // else: leave activeAccessToken unchanged
  probeSeq += 1;
  const mySeq = probeSeq;
  probeInFlight = true;
  probePromise = finishProbe(accessToken, mySeq).finally(function() {
    if (mySeq === probeSeq) probeInFlight = false;
  });

  return probePromise;
}

export function refreshMediaResolverHealth(accessToken) {
  clearActiveMediaProxyBase();
  const token = accessToken !== undefined ? accessToken : activeAccessToken;
  return probeMediaResolverHealth(token, { force: true });
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
