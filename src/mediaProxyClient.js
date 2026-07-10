import {
  getMediaProxyBaseCandidates as buildMediaProxyBaseCandidates,
} from './mediaProxyConfig';
import { trackResolverRequest } from './analytics';
import { parseResolverFeaturesFromHealthBody } from './resolverFeatures';

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

export function normalizeAccessToken(accessToken) {
  if (!accessToken) return '';
  if (typeof accessToken === 'string') return accessToken;
  if (typeof accessToken === 'object' && typeof accessToken.access_token === 'string') {
    return accessToken.access_token;
  }
  return '';
}

function buildAuthHeaders(accessToken) {
  const token = normalizeAccessToken(accessToken);
  if (!token) return {};
  return { Authorization: 'Bearer ' + token };
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

function notifyResolverUnreachable() {
  // Resolver health is cached and not re-checked on every request, so it can
  // report "available" while the resolver is actually down. When a proxied
  // request fails to reach any base, ask listeners (the health store) to
  // re-probe so the UI stops claiming the resolver is available.
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new Event('mediaProxyUnreachable'));
    } catch (e) {
      // Older environments without the Event constructor: ignore.
    }
  }
}

function wrapFetchError(error, bases) {
  const baseList = Array.isArray(bases) ? bases : [bases];
  if (error && error.name === 'TypeError' && String(error.message).indexOf('fetch') >= 0) {
    activeProxyBase = null;
    notifyResolverUnreachable();
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

function resolverEndpointForPath(pathAndQuery) {
  if (!pathAndQuery) return '';
  if (pathAndQuery.indexOf('/proxy-audio') === 0) return 'proxy-audio';
  if (pathAndQuery.indexOf('/youtube/') === 0) return 'youtube-audio';
  if (pathAndQuery.indexOf('/detect-chords') === 0) return 'detect-chords';
  if (pathAndQuery.indexOf('/detect-playback-region') === 0) return 'detect-playback-region';
  if (pathAndQuery.indexOf('/analyze-media') === 0) return 'analyze-media';
  if (pathAndQuery.indexOf('/search-lyrics') === 0) return 'search-lyrics';
  if (pathAndQuery.indexOf('/lyrics-dictionary') === 0) return 'lyrics-dictionary';
  if (pathAndQuery.indexOf('/lyrics-thesaurus') === 0) return 'lyrics-thesaurus';
  if (pathAndQuery.indexOf('/lyrics-rhyme') === 0) return 'lyrics-rhyme';
  if (pathAndQuery.indexOf('/lyrics-reverse-dictionary') === 0) return 'lyrics-reverse-dictionary';
  if (pathAndQuery.indexOf('/lyrics-phrases') === 0) return 'lyrics-phrases';
  if (pathAndQuery.indexOf('/lyrics-alliteration') === 0) return 'lyrics-alliteration';
  if (pathAndQuery.indexOf('/search-chords') === 0) return 'search-chords';
  if (pathAndQuery.indexOf('/search-notation') === 0) return 'search-notation';
  if (pathAndQuery.indexOf('/research-tune-background') === 0) return 'research-tune-background';
  if (pathAndQuery.indexOf('/help-query') === 0) return 'help-query';
  if (pathAndQuery.indexOf('/discover-composer') === 0) return 'discover-composer';
  if (pathAndQuery.indexOf('/separate-stems') === 0) return 'separate-stems';
  if (pathAndQuery.indexOf('/transcribe-sheet-image') === 0) return 'transcribe-sheet-image';
  if (pathAndQuery.indexOf('/search-images') === 0) return 'search-images';
  if (pathAndQuery.indexOf('/midi2xml') === 0) return 'midi2xml';
  if (pathAndQuery.indexOf('/abc2xml') === 0) return 'abc2xml';
  if (/^\/stems\/[^/]+\/status/.test(pathAndQuery)) return 'stem-status';
  if (pathAndQuery.indexOf('/stems/') === 0) return 'stem-audio';
  return '';
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
      demucsModel: typeof body.demucsModel === 'string' ? body.demucsModel : 'htdemucs',
      demucsStems: Array.isArray(body.demucsStems) ? body.demucsStems : null,
      features: parseResolverFeaturesFromHealthBody(body),
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
  let activeCandidate = null;
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i].reachable && candidates[i].available) {
      activeBase = candidates[i].base;
      activeCandidate = candidates[i];
      break;
    }
  }

  activeProxyBase = activeBase;
  return {
    available: !!activeBase,
    activeBase: activeBase,
    candidates: candidates,
    // Surface the active resolver's Demucs model/stems so the UI can show the
    // correct stem sliders (eg. guitar/piano for htdemucs_6s). Without this the
    // aggregate status dropped these fields and getDemucsModel() always fell
    // back to the 4-stem 'htdemucs'.
    demucsModel: activeCandidate && activeCandidate.demucsModel
      ? activeCandidate.demucsModel
      : 'htdemucs',
    demucsStems: activeCandidate && activeCandidate.demucsStems
      ? activeCandidate.demucsStems
      : null,
    features: activeCandidate && activeCandidate.features
      ? activeCandidate.features
      : null,
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
        trackResolverRequest(resolverEndpointForPath(pathAndQuery));
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
      if ((response.status === 401 || response.status === 403 || response.status === 404 || response.status === 405) && i < bases.length - 1) {
        lastError = proxyError;
        activeProxyBase = null;
        continue;
      }
      throw proxyError;
    } catch (error) {
      lastError = error;
      if (error && error.message && error.message.indexOf('Media proxy error') === 0) {
        if (error.message.indexOf('Media proxy error 401') === 0
          || error.message.indexOf('Media proxy error 403') === 0
          || error.message.indexOf('Media proxy error 405') === 0) {
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

export function isMediaResolverInfrastructureError(error) {
  const message = error && error.message ? String(error.message) : '';
  if (!message) return false;
  if (message.indexOf('Could not reach any media resolver') >= 0) return true;
  if (message.indexOf('Could not reach the media resolver') >= 0) return true;
  if (message.indexOf('mixed content') >= 0) return true;
  if (message.indexOf('Media proxy not configured') >= 0) return true;
  if (message.indexOf('Media proxy error 404') >= 0) return true;
  if (message.indexOf('Media proxy error 502') >= 0) return true;
  if (message.indexOf('Media proxy error 503') >= 0) return true;
  if (message.indexOf('Media proxy error 504') >= 0) return true;
  if (message === 'Network Error') return true;
  if (message.indexOf('Failed to fetch') >= 0) return true;
  return false;
}

export function isNotationSearchEmptyError(error) {
  const message = error && error.message ? String(error.message) : '';
  if (!message) return false;
  return message.indexOf('No ABC notation found') >= 0
    || message.indexOf('No notation found') >= 0;
}
