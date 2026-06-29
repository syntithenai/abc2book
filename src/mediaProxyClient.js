import {
  getMediaProxyBaseCandidates as buildMediaProxyBaseCandidates,
} from './mediaProxyConfig';

let activeProxyBase = null;

// Health checks must fail fast. A configured-but-unreachable candidate (e.g. the
// public resolver when the browser can't reach it via NAT loopback) would
// otherwise hang for ~70s on the browser's default connect timeout, blocking the
// whole probe and hiding resolver-backed UI until it eventually fails.
const HEALTH_TIMEOUT_MS = 6000;

export function getMediaProxyBaseCandidates() {
  return buildMediaProxyBaseCandidates();
}

function fetchWithTimeout(url, options, timeoutMs) {
  if (typeof AbortController === 'undefined') {
    return fetch(url, options);
  }
  const controller = new AbortController();
  const timer = setTimeout(function() { controller.abort(); }, timeoutMs);
  const merged = Object.assign({}, options, { signal: controller.signal });
  return fetch(url, merged).finally(function() {
    clearTimeout(timer);
  });
}

export function getMediaProxyBase() {
  if (activeProxyBase) return activeProxyBase;
  const candidates = getMediaProxyBaseCandidates();
  return candidates.length > 0 ? candidates[0] : '';
}

export function getActiveMediaProxyBase() {
  return activeProxyBase || '';
}

export function isMediaProxyConfigured() {
  return getMediaProxyBaseCandidates().length > 0;
}

export function clearActiveMediaProxyBase() {
  activeProxyBase = null;
}

function buildAuthHeaders(accessToken) {
  if (!accessToken) return {};
  return { Authorization: 'Bearer ' + accessToken };
}

function isMixedContentBlocked(base) {
  if (typeof window === 'undefined' || !window.location) return false;
  if (window.location.protocol !== 'https:') return false;
  return /^http:\/\//i.test(base);
}

function detectMixedContent(bases) {
  const baseList = Array.isArray(bases) ? bases : [bases];
  return baseList.some(isMixedContentBlocked);
}

function wrapFetchError(error, bases) {
  const baseList = Array.isArray(bases) ? bases : [bases];
  if (error && error.name === 'TypeError' && String(error.message).indexOf('fetch') >= 0) {
    if (detectMixedContent(baseList)) {
      throw new Error(
        'Could not reach the media resolver because this page is served over HTTPS '
        + 'but the resolver uses HTTP (' + baseList.join(', ') + '). '
        + 'Browsers block these "mixed content" requests. Serve the resolver over HTTPS '
        + 'or open the app over HTTP to use it.'
      );
    }
    throw new Error(
      'Could not reach any media resolver (tried: ' + baseList.join(', ') + '). '
      + 'Start it with: cd local-resolver && docker compose up --build'
    );
  }
  throw error;
}

function unreachableHealthResult(base) {
  return {
    base: base,
    reachable: false,
    available: false,
    requireAuth: false,
    authReason: '',
    mixedContent: isMixedContentBlocked(base),
  };
}

async function tryHealthAtBase(base, accessToken) {
  // An HTTPS page can never reach an http:// resolver. Skip the fetch entirely:
  // besides being pointless, requests to http://localhost from a public HTTPS
  // origin can get stuck pending in some browsers (mixed-content / private
  // network access gating) without ever rejecting, which would hang the probe.
  if (isMixedContentBlocked(base)) {
    return unreachableHealthResult(base);
  }

  const headers = { Accept: 'application/json' };
  if (accessToken) {
    headers.Authorization = 'Bearer ' + accessToken;
  }

  try {
    const response = await fetchWithTimeout(base + '/health', {
      cache: 'no-store',
      headers: headers,
    }, HEALTH_TIMEOUT_MS);
    if (!response.ok) {
      return {
        base: base,
        reachable: false,
        available: false,
        requireAuth: false,
        authReason: '',
        mixedContent: false,
      };
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.indexOf('application/json') === -1) {
      return {
        base: base,
        reachable: false,
        available: false,
        requireAuth: false,
        authReason: '',
        mixedContent: false,
      };
    }

    const body = await response.json();
    if (!body || !body.ok) {
      return {
        base: base,
        reachable: false,
        available: false,
        requireAuth: false,
        authReason: '',
        mixedContent: false,
      };
    }

    const requireAuth = !!body.requireAuth;
    let available = true;
    let authReason = body.authReason || '';

    if (requireAuth) {
      if (body.authorized === true) {
        available = true;
      } else {
        available = false;
        authReason = authReason || 'login_required';
      }
    }

    return {
      base: base,
      reachable: true,
      available: available,
      requireAuth: requireAuth,
      authReason: authReason,
      mixedContent: false,
    };
  } catch (e) {
    return {
      base: base,
      reachable: false,
      available: false,
      requireAuth: false,
      authReason: '',
      mixedContent: isMixedContentBlocked(base),
    };
  }
}

// Guarantees the probe for a single base always settles, even if the underlying
// fetch never resolves or its AbortController fails to reject (observed for
// blocked cross-origin/local requests on some browsers). Without this a single
// stuck candidate would hang the whole Promise.all and the Settings page would
// show "Checking resolvers..." forever.
function probeBaseWithHardTimeout(base, accessToken) {
  return new Promise(function(resolve) {
    let settled = false;
    const timer = setTimeout(function() {
      if (settled) return;
      settled = true;
      resolve(unreachableHealthResult(base));
    }, HEALTH_TIMEOUT_MS + 1000);

    function finish(result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    }

    tryHealthAtBase(base, accessToken).then(finish, function() {
      finish(unreachableHealthResult(base));
    });
  });
}

export async function probeMediaResolverCandidates(accessToken) {
  const bases = getMediaProxyBaseCandidates();

  // Probe all candidates concurrently so one slow/unreachable base (typically
  // the public resolver) can't block the others. Promise.all preserves order,
  // so the active base is still chosen by candidate priority.
  const candidates = await Promise.all(bases.map(function(base) {
    return probeBaseWithHardTimeout(base, accessToken);
  }));

  let activeBase = null;
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i].reachable && candidates[i].available) {
      activeBase = candidates[i].base;
      break;
    }
  }

  activeProxyBase = activeBase;
  return {
    available: !!activeBase,
    activeBase: activeBase,
    candidates: candidates,
  };
}

export async function checkMediaResolverHealth(accessToken) {
  const status = await probeMediaResolverCandidates(accessToken);
  return status.available;
}

export async function fetchViaMediaProxy(pathAndQuery, accessToken, requestOptions = {}) {
  const bases = activeProxyBase
    ? [activeProxyBase].concat(getMediaProxyBaseCandidates().filter(function(b) { return b !== activeProxyBase; }))
    : getMediaProxyBaseCandidates();

  if (bases.length === 0) {
    throw new Error('Media proxy not configured');
  }

  let lastError = null;
  for (let i = 0; i < bases.length; i++) {
    const proxyBase = bases[i];
    const url = proxyBase + pathAndQuery;
    try {
      const mergedHeaders = Object.assign(
        {},
        buildAuthHeaders(accessToken),
        requestOptions.headers || {}
      );
      const response = await fetch(url, {
        ...requestOptions,
        headers: mergedHeaders,
      });
      if (response.ok) {
        activeProxyBase = proxyBase;
        return response;
      }
      let detail = '';
      let hint = '';
      try {
        const body = await response.json();
        detail = body.error || '';
        hint = body.hint || '';
      } catch (e) {}
      const proxyError = new Error(
        'Media proxy error ' + response.status
        + (detail ? ': ' + detail : '')
        + (hint ? ' (' + hint + ')' : '')
      );
      if ((response.status === 401 || response.status === 403 || response.status === 404) && i < bases.length - 1) {
        lastError = proxyError;
        activeProxyBase = null;
        continue;
      }
      throw proxyError;
    } catch (error) {
      lastError = error;
      if (error && error.message && error.message.indexOf('Media proxy error') === 0) {
        if (error.message.indexOf('Media proxy error 401') === 0
          || error.message.indexOf('Media proxy error 403') === 0) {
          activeProxyBase = null;
          if (i < bases.length - 1) continue;
        }
        throw error;
      }
    }
  }

  wrapFetchError(lastError || new Error('fetch failed'), bases);
}

async function tryDirectFetch(url) {
  try {
    const response = await fetch(url);
    if (response.ok) {
      return response;
    }
  } catch (e) {
    // direct fetch blocked (e.g. CORS)
  }
  return null;
}

export async function fetchDirectOrProxy(options) {
  const { src, srcType, youtubeGetId, accessToken, resolveDirectUrl } = options;

  if (srcType === 'youtube') {
    const videoId = youtubeGetId(src);
    if (!videoId) throw new Error('Invalid YouTube URL');

    if (isMediaProxyConfigured()) {
      const response = await fetchViaMediaProxy('/youtube/' + encodeURIComponent(videoId) + '/audio', accessToken);
      return { response: response, viaProxy: true };
    }

    if (resolveDirectUrl) {
      const directUrl = await resolveDirectUrl(src, srcType, youtubeGetId);
      if (directUrl) {
        const response = await tryDirectFetch(directUrl);
        if (response) {
          return { response: response, viaProxy: false };
        }
      }
    }

    throw new Error('Could not resolve YouTube audio stream (configure REACT_APP_MEDIA_PROXY_BASE and start local-resolver)');
  }

  const directResponse = await tryDirectFetch(src);
  if (directResponse) {
    return { response: directResponse, viaProxy: false };
  }

  if (!isMediaProxyConfigured()) {
    throw new Error('Direct fetch failed and media proxy is not configured');
  }

  const response = await fetchViaMediaProxy(
    '/proxy-audio?url=' + encodeURIComponent(src),
    accessToken
  );
  return { response: response, viaProxy: true };
}

export function describeResolverAuthReason(authReason) {
  if (authReason === 'login_required') return 'Login required';
  if (authReason === 'email_not_authorized') return 'Google account not authorized';
  if (authReason === 'invalid_token') return 'Login expired or invalid';
  return '';
}
