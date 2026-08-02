import {
  getMediaProxyBaseCandidates as buildMediaProxyBaseCandidates,
  DEFAULT_CLOUD_LIGHT_MEDIA_PROXY,
} from './mediaProxyConfig';
import { AUTH_SESSION_HEADER, readStoredAuthSessionId } from './authResolverClient';
import { trackResolverRequest } from './analytics';
import { parseResolverFeaturesFromHealthBody } from './resolverFeatures';
import { pickAuthResolverBase, resolveStickyAuthBase } from './authResolverClient';
import { tryRefreshAccessToken } from './googleLoginRefreshRegistry';
import { getActiveProviderHeaders, loadProviderSettings } from './providerSettings';
import { getYoutubeEgressHeaders } from './youtubeUnlock';
import { isMusicCollectionLinkUri, musicCollectionProxyPathFromUri } from './musicCollectionLinkUtils';
import { isBandcampLinkUri } from './bandcampLinkUtils';
import { isArchiveOrgLinkUri, isArchiveOrgDirectDownloadUri } from './archiveOrgLinkUtils';
import { isLocGovLinkUri } from './locGovLinkUtils';
import { isOwnedMediaLinkUri } from './linkRecording';
import { isLocalhostCastBase, setCastPublicBaseFromHealth } from './castSupport';

let activeProxyBase = null;
let heavyMlProxyBase = null;
let snapcastPlaybackProxyBase = null;
let castPlaybackProxyBase = null;
let midiImportProxyBase = null;
let musicCollectionProxyBase = null;
let billingProxyBase = null;
let billingAdminProxyBase = null;
let lastProbeCandidates = [];

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

export function getHeavyMlMediaProxyBase() {
  return heavyMlProxyBase || activeProxyBase || '';
}

export function getMusicCollectionMediaProxyBase() {
  return musicCollectionProxyBase || '';
}

function isLikelyLocalResolverBase(base) {
  try {
    const host = new URL(base).hostname;
    return host === 'localhost'
      || host === '127.0.0.1'
      || host.startsWith('192.168.')
      || host.startsWith('10.')
      || host.startsWith('172.');
  } catch (e) {
    return false;
  }
}

function isDevServerMediaProxyBase(base) {
  if (!base) return false;
  try {
    const parsed = new URL(base);
    const host = parsed.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') return false;
    if (parsed.port === '8787') return false;
    if (typeof window !== 'undefined' && window.location && window.location.origin) {
      if (base === window.location.origin) return true;
    }
    // npm start (3000) and Vite (5173) proxy resolver API paths to :8787.
    return parsed.port === '3000' || parsed.port === '5173';
  } catch (e) {
    return false;
  }
}

function candidateHasHeavyMl(candidate) {
  const f = candidate && candidate.features;
  if (!f) return false;
  return !!(f.stems || f.sheetImage || f.sheetImageOmr || f.practiceAnalysis || f.practiceTrack);
}

function pickHeavyMlBase(candidates) {
  let fallback = null;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (!c.reachable || !c.available) continue;
    if (c.resolverAccess === false) continue;
    if (c.freeAccess === false) continue;
    if (!candidateHasHeavyMl(c)) continue;
    if (isLikelyLocalResolverBase(c.base)) return c.base;
    if (!fallback) fallback = c.base;
  }
  return fallback;
}

function candidateHasMusicCollectionHost(candidate) {
  const f = candidate && candidate.features;
  return !!(f && f.musicCollection);
}

function pickMusicCollectionBase(candidates) {
  let remoteFallback = null;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (!c.reachable || !c.musicCollectionAccess) continue;
    if (!candidateHasMusicCollectionHost(c)) continue;
    if (isCloudLightResolverBase(c.base)) continue;
    if (isLikelyLocalResolverBase(c.base)) return c.base;
    if (!remoteFallback) remoteFallback = c.base;
  }
  return remoteFallback;
}

function pickBillingProxyBase(candidates) {
  let remoteFallback = null;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (!c.reachable || !c.available) continue;
    if (!c.billingEnabled) continue;
    if (isLikelyLocalResolverBase(c.base)) return c.base;
    if (!remoteFallback) remoteFallback = c.base;
  }
  return remoteFallback;
}

function pickBillingAdminBase(candidates) {
  let remoteFallback = null;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (!c.reachable) continue;
    if (!c.adminAccess || !c.billingEnabled) continue;
    if (isLikelyLocalResolverBase(c.base)) return c.base;
    if (!remoteFallback) remoteFallback = c.base;
  }
  return remoteFallback;
}

export function hasMusicCollectionAccess(candidates) {
  if (!Array.isArray(candidates)) return false;
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i].musicCollectionAccess) return true;
  }
  return false;
}

export function hasAdminAccess(candidates) {
  if (!Array.isArray(candidates)) return false;
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i].adminAccess) return true;
  }
  return false;
}

export function hasBillingAdminAccess(candidates) {
  return !!pickBillingAdminBase(candidates);
}

export function getBillingAdminProxyBase() {
  if (billingAdminProxyBase) return billingAdminProxyBase;
  if (lastProbeCandidates.length > 0) {
    const resolved = pickBillingAdminBase(lastProbeCandidates);
    if (resolved) {
      billingAdminProxyBase = resolved;
      return resolved;
    }
  }
  return '';
}

export function isMediaProxyConfigured() {
  return getMediaProxyBaseCandidates().length > 0;
}

export function clearActiveMediaProxyBase() {
  // Only clear the last successful fetch target. Playback routing bases come from
  // the last /health probe and are refreshed in probeMediaResolverCandidates;
  // wiping them here caused cast/snapcast requests to fail mid-session while the
  // Settings UI still showed a resolver as "in use".
  activeProxyBase = null;
}

export function isCloudLightResolverBase(base) {
  if (!base) return false;
  if (base === DEFAULT_CLOUD_LIGHT_MEDIA_PROXY) return true;
  return /resolver-light/i.test(String(base));
}

function candidateHasSnapcastPlayback(candidate) {
  const features = candidate && candidate.features;
  return !!(features && features.snapcastPlayback);
}

export function resolveSnapcastPlaybackBase(candidates) {
  const preferredAuth = pickAuthResolverBase(candidates);
  if (preferredAuth) {
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      if (candidate.base !== preferredAuth) continue;
      if (!candidate.reachable || !candidate.available) continue;
      if (candidate.resolverAccess === false) continue;
      if (!candidateHasSnapcastPlayback(candidate)) continue;
      return candidate.base;
    }
  }
  let remoteFallback = null;
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (!candidate.reachable || !candidate.available) continue;
    if (candidate.resolverAccess === false) continue;
    if (!candidateHasSnapcastPlayback(candidate)) continue;
    if (isCloudLightResolverBase(candidate.base)) continue;
    if (isLikelyLocalResolverBase(candidate.base)) return candidate.base;
    if (!remoteFallback) remoteFallback = candidate.base;
  }
  return remoteFallback;
}

export function getSnapcastPlaybackProxyBase() {
  if (snapcastPlaybackProxyBase) return snapcastPlaybackProxyBase;
  if (lastProbeCandidates.length > 0) {
    const resolved = resolveSnapcastPlaybackBase(lastProbeCandidates);
    if (resolved) {
      snapcastPlaybackProxyBase = resolved;
      return resolved;
    }
  }
  return '';
}

function candidateHasCastPlayback(candidate) {
  const features = candidate && candidate.features;
  if (features && features.castPlayback) return true;
  const cast = candidate && candidate.cast;
  return !!(cast && cast.enabled !== false && cast.publicBase);
}

function candidateSupportsCastPlayback(candidate, candidates) {
  if (candidateHasCastPlayback(candidate)) return true;
  if (!isDevServerMediaProxyBase(candidate.base)) return false;
  for (let i = 0; i < candidates.length; i++) {
    const loopback = candidates[i];
    if (loopback.base !== 'http://localhost:8787' && loopback.base !== 'http://127.0.0.1:8787') {
      continue;
    }
    if (candidateHasCastPlayback(loopback)) return true;
  }
  return false;
}

function preferDirectLocalResolverBase(base, candidates) {
  if (!isDevServerMediaProxyBase(base)) return base;
  for (let i = 0; i < candidates.length; i++) {
    const direct = candidates[i];
    if (direct.base !== 'http://localhost:8787' && direct.base !== 'http://127.0.0.1:8787') {
      continue;
    }
    if (!direct.reachable || !direct.available || direct.resolverAccess === false) continue;
    if (!candidateSupportsCastPlayback(direct, candidates)) continue;
    return direct.base;
  }
  return base;
}

export function resolveCastPlaybackBase(candidates) {
  const preferredAuth = pickAuthResolverBase(candidates);
  if (preferredAuth) {
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      if (candidate.base !== preferredAuth) continue;
      if (!candidate.reachable || !candidate.available) continue;
      if (candidate.resolverAccess === false) continue;
      if (!candidateSupportsCastPlayback(candidate, candidates)) continue;
      return preferDirectLocalResolverBase(candidate.base, candidates);
    }
  }
  let remoteFallback = null;
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (!candidate.reachable || !candidate.available) continue;
    if (candidate.resolverAccess === false) continue;
    if (!candidateSupportsCastPlayback(candidate, candidates)) continue;
    if (isCloudLightResolverBase(candidate.base)) continue;
    if (isLikelyLocalResolverBase(candidate.base)) {
      return preferDirectLocalResolverBase(candidate.base, candidates);
    }
    if (!remoteFallback) remoteFallback = candidate.base;
  }
  return remoteFallback;
}

export function getCastPlaybackProxyBase() {
  if (castPlaybackProxyBase) return castPlaybackProxyBase;
  if (lastProbeCandidates.length > 0) {
    const resolved = resolveCastPlaybackBase(lastProbeCandidates);
    if (resolved) {
      castPlaybackProxyBase = resolved;
      return resolved;
    }
  }
  return '';
}

function pickMidiImportBase(candidates) {
  let remoteFallback = null;
  let anyFallback = null;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (!c.reachable || !c.available) continue;
    if (c.resolverAccess === false) continue;
    if (!anyFallback) anyFallback = c.base;
    if (isCloudLightResolverBase(c.base)) continue;
    if (isLikelyLocalResolverBase(c.base)) return c.base;
    if (!remoteFallback) remoteFallback = c.base;
  }
  return remoteFallback || anyFallback;
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
  const headers = {};
  const token = normalizeAccessToken(accessToken);
  if (token) {
    headers.Authorization = 'Bearer ' + token;
  }
  const sessionId = readStoredAuthSessionId();
  if (sessionId) {
    headers[AUTH_SESSION_HEADER] = sessionId;
  }
  return headers;
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
  if (pathAndQuery.indexOf('/bandcamp/audio') === 0) return 'bandcamp-audio';
  if (pathAndQuery.indexOf('/internet-archive/audio') === 0) return 'internet-archive-audio';
  if (pathAndQuery.indexOf('/loc/audio') === 0) return 'loc-audio';
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
  if (pathAndQuery.indexOf('/search-music-collection') === 0) return 'search-music-collection';
  if (pathAndQuery.indexOf('/browse-music-collection') === 0) return 'browse-music-collection';
  if (pathAndQuery.indexOf('/music-collection-duplicates') === 0) return 'music-collection-duplicates';
  if (pathAndQuery.indexOf('/music-collection-triage') === 0) return 'music-collection-triage';
  if (pathAndQuery.indexOf('/music-collection-move-plan') === 0) return 'music-collection-move-plan';
  if (pathAndQuery.indexOf('/music-collection-registry') === 0) return 'music-collection-registry';
  if (pathAndQuery.indexOf('/music-collection-artists') === 0) return 'music-collection-artists';
  if (pathAndQuery.indexOf('/music-collection-chunks') === 0) return 'music-collection-chunks';
  if (pathAndQuery.indexOf('/music-collection-triage/bulk') === 0) return 'music-collection-triage-bulk';
  if (pathAndQuery.indexOf('/search-bandcamp') === 0) return 'search-bandcamp';
  if (pathAndQuery.indexOf('/search-internet-archive') === 0) return 'search-internet-archive';
  if (pathAndQuery.indexOf('/search-europeana') === 0) return 'search-europeana';
  if (pathAndQuery.indexOf('/search-loc-audio') === 0) return 'search-loc-audio';
  if (pathAndQuery.indexOf('/rebuild-music-collection-index') === 0) return 'rebuild-music-collection-index';
  if (pathAndQuery.indexOf('/music-collection/') === 0) return 'music-collection';
  if (pathAndQuery.indexOf('/music-collection-art/') === 0) return 'music-collection-art';
  if (pathAndQuery.indexOf('/research-tune-background') === 0) return 'research-tune-background';
  if (pathAndQuery.indexOf('/generate-feed-articles') === 0) return 'generate-feed-articles';
  if (pathAndQuery.indexOf('/generate-feed-quizzes') === 0) return 'generate-feed-quizzes';
  if (pathAndQuery.indexOf('/enrich-feed-sources') === 0) return 'enrich-feed-sources';
  if (pathAndQuery.indexOf('/help-query') === 0) return 'help-query';
  if (pathAndQuery.indexOf('/discover-composer') === 0) return 'discover-composer';
  if (pathAndQuery.indexOf('/discover-genre') === 0) return 'discover-genre';
  if (pathAndQuery.indexOf('/separate-stems') === 0) return 'separate-stems';
  if (pathAndQuery.indexOf('/generate-practice-track') === 0) return 'generate-practice-track';
  if (pathAndQuery.indexOf('/generate-audio') === 0) return 'generate-audio';
  if (pathAndQuery.indexOf('/render-midi') === 0) return 'render-midi';
  if (pathAndQuery.indexOf('/transcribe-sheet-image') === 0) return 'transcribe-sheet-image';
  if (pathAndQuery.indexOf('/search-images') === 0) return 'search-images';
  if (pathAndQuery.indexOf('/midi2abc') === 0) return 'midi2abc';
  if (pathAndQuery.indexOf('/midi2xml') === 0) return 'midi2xml';
  if (pathAndQuery.indexOf('/score2xml') === 0) return 'score2xml';
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
    oauthBff: false,
    freeAccess: false,
    embeddedCreds: false,
    billingEnabled: false,
    creditRequired: false,
    creditBalanceCents: null,
    creditUnlimited: false,
    resolverAccess: false,
    adminAccess: false,
    musicCollectionAccess: false,
    providers: null,
    lightMode: false,
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
  const sessionId = readStoredAuthSessionId();
  if (sessionId) {
    headers[AUTH_SESSION_HEADER] = sessionId;
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
        oauthBff: false,
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
        oauthBff: false,
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
        oauthBff: false,
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

    const features = parseResolverFeaturesFromHealthBody(body);
    const oauthBff = body.oauthBff === true || features.oauthBff === true;
    if (oauthBff) features.oauthBff = true;
    if (body.soundfontsReady === true || body.soundfontsReady === false) {
      features.soundfonts = true;
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
      features: features,
      oauthBff: oauthBff,
      freeAccess: body.freeAccess === true || (!requireAuth && available),
      embeddedCreds: body.embeddedCreds === true,
      billingEnabled: body.billingEnabled === true,
      creditRequired: body.creditRequired === true,
      creditBalanceCents: typeof body.creditBalanceCents === 'number' ? body.creditBalanceCents : null,
      creditUnlimited: body.creditUnlimited === true,
      resolverAccess: body.resolverAccess !== false,
      adminAccess: body.adminAccess === true,
      musicCollectionAccess: body.musicCollectionAccess === true,
      providers: body.providers && typeof body.providers === 'object' ? body.providers : null,
      lightMode: body.lightMode === true || features.lightMode === true,
      soundfontsReady: body.soundfontsReady === true,
      soundfontsProgress: body.soundfontsProgress && typeof body.soundfontsProgress === 'object'
        ? body.soundfontsProgress
        : null,
      soundfontsRunning: body.soundfontsRunning === true,
      musicCollectionCount: typeof body.musicCollectionCount === 'number'
        ? body.musicCollectionCount
        : 0,
      musicCollectionDir: typeof body.musicCollectionDir === 'string' ? body.musicCollectionDir : null,
      musicCollectionIndex: typeof body.musicCollectionIndex === 'string' ? body.musicCollectionIndex : null,
      musicCollectionStats: typeof body.musicCollectionStats === 'string' ? body.musicCollectionStats : null,
      musicCollectionBuiltAt: typeof body.musicCollectionBuiltAt === 'string' ? body.musicCollectionBuiltAt : null,
      musicCollectionSummary: body.musicCollectionSummary && typeof body.musicCollectionSummary === 'object'
        ? body.musicCollectionSummary
        : null,
      practiceTrackBackend: body.practiceTrackBackend && typeof body.practiceTrackBackend === 'object'
        ? body.practiceTrackBackend
        : null,
      snapcast: body.snapcast && typeof body.snapcast === 'object' ? body.snapcast : null,
      cast: body.cast && typeof body.cast === 'object' ? body.cast : null,
    };
  } catch (e) {
    return {
      base: base,
      reachable: false,
      available: false,
      requireAuth: false,
      authReason: '',
      mixedContent: isMixedContentBlocked(base),
      oauthBff: false,
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
  lastProbeCandidates = [];

  // Probe all candidates concurrently so one slow/unreachable base (typically
  // the public resolver) can't block the others. Promise.all preserves order,
  // so the active base is still chosen by candidate priority.
  const candidates = await Promise.all(bases.map(function(base) {
    return probeBaseWithHardTimeout(base, accessToken);
  }));
  lastProbeCandidates = candidates;

  let activeBase = null;
  let activeCandidate = null;
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i].reachable && candidates[i].available) {
      activeBase = candidates[i].base;
      activeCandidate = candidates[i];
      break;
    }
  }

  if (activeCandidate && activeCandidate.cast && activeCandidate.cast.publicBase) {
    setCastPublicBaseFromHealth(activeCandidate.cast.publicBase);
  } else if (activeBase && !isLocalhostCastBase(activeBase)) {
    setCastPublicBaseFromHealth(activeBase);
  } else {
    setCastPublicBaseFromHealth(null);
  }

  heavyMlProxyBase = pickHeavyMlBase(candidates);
  snapcastPlaybackProxyBase = resolveSnapcastPlaybackBase(candidates);
  castPlaybackProxyBase = resolveCastPlaybackBase(candidates);
  midiImportProxyBase = pickMidiImportBase(candidates);
  musicCollectionProxyBase = pickMusicCollectionBase(candidates);
  billingProxyBase = pickBillingProxyBase(candidates);
  billingAdminProxyBase = pickBillingAdminBase(candidates);
  const preferredAuthBase = pickAuthResolverBase(candidates);
  const authBase = resolveStickyAuthBase(candidates, null);
  const collectionCandidate = musicCollectionProxyBase
    ? candidates.find(function(c) { return c.base === musicCollectionProxyBase; })
    : null;
  const collectionFieldsSource = collectionCandidate || activeCandidate;
  return {
    available: !!activeBase,
    activeBase: activeBase,
    heavyMlBase: heavyMlProxyBase,
    snapcastPlaybackBase: snapcastPlaybackProxyBase,
    castPlaybackBase: castPlaybackProxyBase,
    musicCollectionBase: musicCollectionProxyBase,
    authBase: authBase,
    preferredAuthBase: preferredAuthBase,
    candidates: candidates,
    demucsModel: activeCandidate && activeCandidate.demucsModel
      ? activeCandidate.demucsModel
      : 'htdemucs',
    demucsStems: activeCandidate && activeCandidate.demucsStems
      ? activeCandidate.demucsStems
      : null,
    features: activeCandidate && activeCandidate.features
      ? activeCandidate.features
      : null,
    freeAccess: activeCandidate ? !!activeCandidate.freeAccess : false,
    embeddedCreds: activeCandidate ? !!activeCandidate.embeddedCreds : false,
    billingEnabled: activeCandidate ? !!activeCandidate.billingEnabled : false,
    creditRequired: activeCandidate ? !!activeCandidate.creditRequired : false,
    creditBalanceCents: activeCandidate && typeof activeCandidate.creditBalanceCents === 'number'
      ? activeCandidate.creditBalanceCents
      : null,
    creditUnlimited: activeCandidate ? !!activeCandidate.creditUnlimited : false,
    resolverAccess: activeCandidate ? activeCandidate.resolverAccess !== false : false,
    adminAccess: hasAdminAccess(candidates),
    billingAdminAccess: hasBillingAdminAccess(candidates),
    musicCollectionAccess: hasMusicCollectionAccess(candidates),
    requireAuth: activeCandidate ? !!activeCandidate.requireAuth : false,
    authReason: activeCandidate ? (activeCandidate.authReason || '') : '',
    providers: activeCandidate && activeCandidate.providers
      ? activeCandidate.providers
      : null,
    musicCollectionCount: collectionFieldsSource && typeof collectionFieldsSource.musicCollectionCount === 'number'
      ? collectionFieldsSource.musicCollectionCount
      : 0,
    musicCollectionDir: collectionFieldsSource && collectionFieldsSource.musicCollectionDir
      ? collectionFieldsSource.musicCollectionDir
      : null,
    musicCollectionIndex: collectionFieldsSource && collectionFieldsSource.musicCollectionIndex
      ? collectionFieldsSource.musicCollectionIndex
      : null,
    musicCollectionStats: collectionFieldsSource && collectionFieldsSource.musicCollectionStats
      ? collectionFieldsSource.musicCollectionStats
      : null,
    musicCollectionBuiltAt: collectionFieldsSource && collectionFieldsSource.musicCollectionBuiltAt
      ? collectionFieldsSource.musicCollectionBuiltAt
      : null,
    musicCollectionSummary: collectionFieldsSource && collectionFieldsSource.musicCollectionSummary
      ? collectionFieldsSource.musicCollectionSummary
      : null,
    practiceTrackBackend: activeCandidate && activeCandidate.practiceTrackBackend
      ? activeCandidate.practiceTrackBackend
      : null,
    snapcast: activeCandidate && activeCandidate.snapcast
      ? activeCandidate.snapcast
      : null,
    cast: activeCandidate && activeCandidate.cast
      ? activeCandidate.cast
      : null,
  };
}

export async function checkMediaResolverHealth(accessToken) {
  const status = await probeMediaResolverCandidates(accessToken);
  return status.available;
}

const HEAVY_ML_PATH_PREFIXES = [
  '/separate-stems',
  '/stems/',
  '/transcribe-sheet-image',
  '/extract-sheet-metadata',
  '/analyze-media',
  '/detect-chords',
  '/analyze-practice',
  '/generate-practice-track',
  '/generate-audio',
  '/render-midi',
];

function pathNeedsSnapcastPlayback(pathAndQuery) {
  const path = String(pathAndQuery || '').split('?')[0];
  return path.indexOf('/snapcast-playback/') === 0;
}

function pathNeedsCastPlayback(pathAndQuery) {
  const path = String(pathAndQuery || '').split('?')[0];
  return path.indexOf('/cast-playback/') === 0;
}

function pathNeedsHomeRemotePlayback(pathAndQuery) {
  return pathNeedsSnapcastPlayback(pathAndQuery) || pathNeedsCastPlayback(pathAndQuery);
}

function pathNeedsHeavyMl(pathAndQuery) {
  const path = String(pathAndQuery || '').split('?')[0];
  for (let i = 0; i < HEAVY_ML_PATH_PREFIXES.length; i++) {
    if (path.indexOf(HEAVY_ML_PATH_PREFIXES[i]) === 0) return true;
  }
  return false;
}

function pathNeedsYoutubeEgress(pathAndQuery) {
  const path = String(pathAndQuery || '').split('?')[0];
  return path.indexOf('/youtube/') === 0;
}

function pathNeedsMidiAnalyze(pathAndQuery) {
  const path = String(pathAndQuery || '').split('?')[0];
  return path.indexOf('/midi2analyze') === 0;
}

function pathNeedsMusicCollection(pathAndQuery) {
  const endpoint = resolverEndpointForPath(pathAndQuery);
  return endpoint === 'search-music-collection'
    || endpoint === 'browse-music-collection'
    || endpoint === 'music-collection-duplicates'
    || endpoint === 'music-collection-triage'
    || endpoint === 'music-collection-triage-bulk'
    || endpoint === 'music-collection-move-plan'
    || endpoint === 'music-collection-registry'
    || endpoint === 'music-collection-artists'
    || endpoint === 'music-collection-chunks'
    || endpoint === 'rebuild-music-collection-index'
    || endpoint === 'music-collection'
    || endpoint === 'music-collection-art';
}

function pathNeedsBilling(pathAndQuery) {
  const path = String(pathAndQuery || '').split('?')[0];
  return path.indexOf('/billing/') === 0;
}

function pathNeedsBillingAdmin(pathAndQuery) {
  const path = String(pathAndQuery || '').split('?')[0];
  return path.indexOf('/billing/admin/') === 0;
}

function formatSnapcastPlaybackResolverError(error, bases) {
  const message = error && error.message ? String(error.message) : '';
  if (message.indexOf('Media proxy error 401') === 0
    || message.indexOf('Media proxy error 403') === 0) {
    throw new Error(
      'Sign in to Tune Book to route audio through your home resolver (Snapcast requires peppertrees).'
    );
  }
  if (getSnapcastPlaybackProxyBase()) {
    throw new Error(
      'Could not reach your home resolver for Snapcast (' + getSnapcastPlaybackProxyBase() + '). '
      + 'Check that docker compose --profile snapcast is running on peppertrees.'
    );
  }
  throw new Error(
    'No Snapcast-capable resolver is reachable. Snapcast needs your home resolver '
    + '(https://peppertrees.syntithenai.com), not the cloud fallback. '
    + 'Sign in, then try again.'
  );
}

function formatCastPlaybackResolverError(error, bases) {
  const message = error && error.message ? String(error.message) : '';
  const castBase = getCastPlaybackProxyBase();
  if (message.indexOf('Media proxy error 401') === 0
    || message.indexOf('Media proxy error 403') === 0) {
    throw new Error(
      'Sign in to Tune Book to route audio through your home resolver for Chromecast.'
    );
  }
  if (message.indexOf('Media proxy error 402') === 0) {
    throw new Error(
      'Your resolver credit balance is empty. Buy credit or use your own local resolver for Chromecast.'
    );
  }
  if (castBase) {
    throw new Error(
      'Could not reach your home resolver for Chromecast (' + castBase + '). '
      + 'Check that your resolver is running and CAST_PUBLIC_URL is set.'
    );
  }
  throw new Error(
    'No Chromecast-capable resolver is reachable. Chromecast needs your home resolver with ffmpeg, '
    + 'not the cloud fallback. Sign in, then try again.'
  );
}

function formatRemotePlaybackResolverError(error, bases, pathAndQuery) {
  if (pathNeedsCastPlayback(pathAndQuery)) {
    formatCastPlaybackResolverError(error, bases);
    return;
  }
  if (pathNeedsSnapcastPlayback(pathAndQuery)) {
    formatSnapcastPlaybackResolverError(error, bases);
    return;
  }
  wrapFetchError(error, bases);
}

function resolvePreferredProxyBase(pathAndQuery) {
  if (pathNeedsSnapcastPlayback(pathAndQuery)) {
    const snapcastBase = getSnapcastPlaybackProxyBase();
    if (snapcastBase) return snapcastBase;
  }
  if (pathNeedsCastPlayback(pathAndQuery)) {
    const castBase = getCastPlaybackProxyBase();
    if (castBase) return castBase;
  }
  if (pathNeedsHeavyMl(pathAndQuery) && heavyMlProxyBase) {
    return heavyMlProxyBase;
  }
  if (pathNeedsMusicCollection(pathAndQuery) && musicCollectionProxyBase) {
    return musicCollectionProxyBase;
  }
  if (pathNeedsBillingAdmin(pathAndQuery) && billingAdminProxyBase) {
    return billingAdminProxyBase;
  }
  if (pathNeedsBilling(pathAndQuery) && billingProxyBase) {
    return billingProxyBase;
  }
  if (pathNeedsMidiAnalyze(pathAndQuery) && midiImportProxyBase) {
    return midiImportProxyBase;
  }
  return activeProxyBase;
}

export async function fetchViaMediaProxy(pathAndQuery, accessToken, requestOptions = {}) {
  const billingAdminPath = pathNeedsBillingAdmin(pathAndQuery);
  const preferredBase = resolvePreferredProxyBase(pathAndQuery);
  let bases = billingAdminPath && billingAdminProxyBase
    ? [billingAdminProxyBase]
    : preferredBase
      ? [preferredBase].concat(getMediaProxyBaseCandidates().filter(function(b) { return b !== preferredBase; }))
      : getMediaProxyBaseCandidates();

  if (bases.length === 0) {
    throw new Error('Media proxy not configured');
  }
  if (billingAdminPath && !billingAdminProxyBase) {
    throw new Error(
      'No resolver with billing admin access is reachable. '
      + 'Sign in with an admin account and ensure ALLOWED_ADMIN_EMAILS is set on a running billing resolver.'
    );
  }

  let tokenForRequest = accessToken;
  let didAuthRetry = false;

  async function attemptAllBases() {
    let lastError = null;
    for (let i = 0; i < bases.length; i++) {
      const proxyBase = bases[i];
      if (isMixedContentBlocked(proxyBase)) {
        continue;
      }
      if (pathNeedsHomeRemotePlayback(pathAndQuery)
        && isCloudLightResolverBase(proxyBase)
        && proxyBase !== getSnapcastPlaybackProxyBase()
        && proxyBase !== getCastPlaybackProxyBase()) {
        continue;
      }
      if (pathNeedsMidiAnalyze(pathAndQuery)
        && isCloudLightResolverBase(proxyBase)
        && proxyBase !== midiImportProxyBase) {
        continue;
      }
      if (pathNeedsMusicCollection(pathAndQuery)
        && isCloudLightResolverBase(proxyBase)
        && proxyBase !== musicCollectionProxyBase) {
        continue;
      }
      const url = proxyBase + pathAndQuery;
      try {
        const mergedHeaders = Object.assign(
          {},
          buildAuthHeaders(tokenForRequest),
          getActiveProviderHeaders(loadProviderSettings()),
          pathNeedsYoutubeEgress(pathAndQuery) ? getYoutubeEgressHeaders() : {},
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
          detail = body.error || body.detail || '';
          if (detail && typeof detail !== 'string') {
            detail = JSON.stringify(detail);
          }
          hint = body.hint || '';
        } catch (e) {}
        const proxyError = new Error(
          'Media proxy error ' + response.status
          + (detail ? ': ' + detail : '')
          + (hint ? ' (' + hint + ')' : '')
        );
        proxyError.status = response.status;
        if (billingAdminPath) {
          throw proxyError;
        }
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
    if (pathNeedsHomeRemotePlayback(pathAndQuery)) {
      formatRemotePlaybackResolverError(lastError || new Error('fetch failed'), bases, pathAndQuery);
    }
    if (billingAdminPath) {
      const message = lastError && lastError.message ? String(lastError.message) : '';
      if (message.indexOf('Media proxy error 403') === 0) {
        throw new Error('Admin access required on the billing resolver. Check ALLOWED_ADMIN_EMAILS on that host.');
      }
      if (message.indexOf('Media proxy error 404') === 0) {
        throw new Error(
          'Billing admin API is not available on '
          + (billingAdminProxyBase || 'the resolver')
          + '. Deploy the updated resolver or use a host that supports /billing/admin.'
        );
      }
      const adminBase = billingAdminProxyBase || bases[0] || 'the billing resolver';
      throw new Error(
        'Could not reach the billing admin resolver (' + adminBase + '). '
        + 'Ensure that resolver is running and your account is in ALLOWED_ADMIN_EMAILS.'
      );
    }
    wrapFetchError(lastError || new Error('fetch failed'), bases);
  }

  try {
    return await attemptAllBases();
  } catch (error) {
    const is401 = error && (
      error.status === 401
      || (error.message && error.message.indexOf('Media proxy error 401') === 0)
    );
    if (is401 && !didAuthRetry) {
      didAuthRetry = true;
      const refreshed = await tryRefreshAccessToken();
      if (refreshed && refreshed.access_token) {
        tokenForRequest = refreshed.access_token;
        return attemptAllBases();
      }
    }
    throw error;
  }
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

function isPrivateOrLocalHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host || host === 'localhost' || host === '127.0.0.1') return true;
  if (host.startsWith('192.168.') || host.startsWith('10.')) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  return false;
}

/**
 * Resolver /proxy-audio only accepts https upstream URLs. Upgrade public http://
 * links (archive.org, bandcamp, direct .mp3, remote MIDI, etc.). Local music-
 * collection URLs keep http when they point at a home resolver host.
 */
export function normalizeMediaProxyTargetUrl(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed || !/^http:\/\//i.test(trimmed)) return trimmed;
  if (isMusicCollectionLinkUri(trimmed)) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (isPrivateOrLocalHost(parsed.hostname)) return trimmed;
    parsed.protocol = 'https:';
    return parsed.toString();
  } catch (e) {
    return trimmed;
  }
}

export async function fetchDirectOrProxy(options) {
  const { srcType, youtubeGetId, accessToken, resolveDirectUrl } = options;
  const src = normalizeMediaProxyTargetUrl(options.src);

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

    throw new Error(
      'Could not resolve YouTube audio stream (install the TuneBook Helper extension, or configure a media resolver)'
    );
  }

  if (isMusicCollectionLinkUri(src)) {
    if (!isMediaProxyConfigured()) {
      throw new Error('Music collection playback requires a configured media resolver');
    }
    const proxyPath = musicCollectionProxyPathFromUri(src);
    if (!proxyPath) {
      throw new Error('Invalid music collection link');
    }
    const response = await fetchViaMediaProxy(proxyPath, accessToken);
    return { response: response, viaProxy: true };
  }

  if (isBandcampLinkUri(src)) {
    if (!isMediaProxyConfigured()) {
      throw new Error('Bandcamp playback requires a configured media resolver');
    }
    const response = await fetchViaMediaProxy(
      '/bandcamp/audio?url=' + encodeURIComponent(src),
      accessToken
    );
    return { response: response, viaProxy: true };
  }

  if (isArchiveOrgLinkUri(src)) {
    if (!isMediaProxyConfigured()) {
      throw new Error('Internet Archive playback requires a configured media resolver');
    }
    if (isArchiveOrgDirectDownloadUri(src)) {
      const response = await fetchViaMediaProxy(
        '/proxy-audio?url=' + encodeURIComponent(src),
        accessToken
      );
      return { response: response, viaProxy: true };
    }
    const response = await fetchViaMediaProxy(
      '/internet-archive/audio?url=' + encodeURIComponent(src),
      accessToken
    );
    return { response: response, viaProxy: true };
  }

  if (isLocGovLinkUri(src)) {
    if (!isMediaProxyConfigured()) {
      throw new Error('Library of Congress playback requires a configured media resolver');
    }
    const response = await fetchViaMediaProxy(
      '/loc/audio?url=' + encodeURIComponent(src),
      accessToken
    );
    return { response: response, viaProxy: true };
  }

  if (isOwnedMediaLinkUri(src)) {
    throw new Error('Owned recording links must be resolved locally before proxy playback');
  }

  if (isMusicCollectionLinkUri(src)) {
    if (!isMediaProxyConfigured()) {
      throw new Error('Music collection playback requires a configured media resolver');
    }
    const proxyPath = musicCollectionProxyPathFromUri(src);
    if (!proxyPath) {
      throw new Error('Invalid music collection link');
    }
    const response = await fetchViaMediaProxy(proxyPath, accessToken);
    return { response: response, viaProxy: true };
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

/** True when the browser cannot play the link URL directly (resolver auth required). */
export function requiresResolverProxiedPlayback(src) {
  const trimmed = String(src || '').trim();
  if (!trimmed) return false;
  return isMusicCollectionLinkUri(trimmed)
    || isBandcampLinkUri(trimmed)
    || isArchiveOrgLinkUri(trimmed)
    || isLocGovLinkUri(trimmed);
}

/** Fetch audio through the media resolver and return a blob: URL for <audio> playback. */
export async function fetchProxiedAudioBlobUrl(src, srcType, options) {
  const opts = options || {};
  const { response } = await fetchDirectOrProxy({
    src: src,
    srcType: srcType,
    youtubeGetId: opts.youtubeGetId,
    accessToken: opts.accessToken,
    resolveDirectUrl: opts.resolveDirectUrl,
  });
  const blob = await response.blob();
  if (!blob || !blob.size) {
    throw new Error('Could not load audio');
  }
  return URL.createObjectURL(blob);
}

export function describeResolverAuthReason(authReason) {
  if (authReason === 'login_required') return 'Login required';
  if (authReason === 'email_not_authorized') return 'Google account not authorized';
  if (authReason === 'resolver_access_denied') return 'Resolver access denied for this account';
  if (authReason === 'invalid_token') return 'Login expired or invalid';
  if (authReason === 'insufficient_credit') return 'Insufficient resolver credit';
  return '';
}

/**
 * Block starting new resolver-proxied playback when billing requires credit and balance is empty.
 * Returns { message } or null.
 */
export function getResolverProxiedPlaybackBlock(resolverStatus, accessToken) {
  if (!resolverStatus || !isMediaProxyConfigured()) return null;
  if (!accessToken) return null;
  if (resolverStatus.creditUnlimited) return null;
  if (!resolverStatus.billingEnabled) return null;

  const balance = typeof resolverStatus.creditBalanceCents === 'number'
    ? resolverStatus.creditBalanceCents
    : null;
  const creditRequired = !!resolverStatus.creditRequired;
  const insufficientFromAuth = (resolverStatus.candidates || []).some(function(candidate) {
    return candidate.authReason === 'insufficient_credit';
  });

  if ((creditRequired && balance !== null && balance <= 0) || insufficientFromAuth) {
    return {
      message: 'Your resolver credit balance is empty. Buy credit to play library and streaming links through the hosted resolver.',
    };
  }
  return null;
}

/**
 * Warn when prepaid credit is running low (< 10¢).
 */
export function getResolverCreditLowBalanceWarning(resolverStatus) {
  if (!resolverStatus || !resolverStatus.billingEnabled || resolverStatus.creditUnlimited) {
    return null;
  }
  const balance = resolverStatus.creditBalanceCents;
  if (typeof balance !== 'number' || balance > 10 || balance <= 0) return null;
  const dollars = (balance / 100).toFixed(2);
  return {
    message: 'Low resolver credit ($' + dollars + ' remaining). Buy credit to keep using hosted playback and APIs.',
  };
}

/**
 * When shared resolver providers are reachable but blocked on auth.
 * Returns { message, showLoginButton } or null.
 */
export function getResolverLoginWarning(resolverStatus, accessToken) {
  if (!resolverStatus || resolverStatus.available) return null;

  const candidates = resolverStatus.candidates || [];
  const authBlocked = candidates.filter(function(candidate) {
    return candidate.reachable && candidate.requireAuth && !candidate.available;
  });
  if (authBlocked.length === 0) return null;

  const hasToken = !!accessToken;
  const loginRequired = authBlocked.some(function(candidate) {
    return candidate.authReason === 'login_required' || (!candidate.authReason && !hasToken);
  });
  const invalidToken = authBlocked.some(function(candidate) {
    return candidate.authReason === 'invalid_token';
  });
  const notAuthorized = authBlocked.some(function(candidate) {
    return candidate.authReason === 'email_not_authorized';
  });

  if (loginRequired && !hasToken) {
    return {
      message: 'Shared resolver providers (LLM, Whisper, OCR, Stems) are online but need a Google login. Log in to use them, or run your own local resolver.',
      showLoginButton: true,
    };
  }
  if (invalidToken) {
    return {
      message: 'Your Google login has expired. Sign in again to use shared resolver providers.',
      showLoginButton: true,
    };
  }
  const insufficientCredit = authBlocked.some(function(candidate) {
    return candidate.authReason === 'insufficient_credit';
  });
  if (insufficientCredit && hasToken) {
    return {
      message: 'Your resolver credit balance is empty. Buy credit to use hosted features, or add your own API keys under Providers.',
      showLoginButton: false,
      showBuyCreditButton: true,
    };
  }
  if (notAuthorized) {
    return {
      message: 'Your Google account is not authorized on the shared resolver. Add your own API keys under Providers, or run a local resolver.',
      showLoginButton: false,
    };
  }

  return {
    message: 'Shared resolver providers are reachable but not available to this account. Log in with an authorized Google account or configure your own API keys.',
    showLoginButton: !hasToken,
  };
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
