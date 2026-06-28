import {
  getMediaProxyBaseCandidates as buildMediaProxyBaseCandidates,
} from './mediaProxyConfig';

let activeProxyBase = null;

export function getMediaProxyBaseCandidates() {
  return buildMediaProxyBaseCandidates();
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

async function tryHealthAtBase(base, accessToken) {
  const headers = { Accept: 'application/json' };
  if (accessToken) {
    headers.Authorization = 'Bearer ' + accessToken;
  }

  try {
    const response = await fetch(base + '/health', {
      cache: 'no-store',
      headers: headers,
    });
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

export async function probeMediaResolverCandidates(accessToken) {
  const bases = getMediaProxyBaseCandidates();
  const candidates = [];
  let activeBase = null;

  for (let i = 0; i < bases.length; i++) {
    const probe = await tryHealthAtBase(bases[i], accessToken);
    candidates.push(probe);
    if (probe.reachable && probe.available && !activeBase) {
      activeBase = probe.base;
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
