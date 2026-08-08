import { getMediaProxyBaseCandidates } from './mediaProxyConfig';

const MUSIC_COLLECTION_PATH = '/music-collection/';

function normalizeHost(url) {
  try {
    const parsed = new URL(String(url || '').trim());
    return parsed.protocol + '//' + parsed.host;
  } catch (e) {
    return '';
  }
}

export function musicCollectionResolverBases() {
  const bases = [];
  const seen = {};
  getMediaProxyBaseCandidates().forEach(function(base) {
    const host = normalizeHost(base);
    if (!host || seen[host]) return;
    seen[host] = true;
    bases.push(host);
  });
  return bases;
}

export function isMusicCollectionLinkUri(uri) {
  const src = String(uri || '').trim();
  if (!src || src.indexOf(MUSIC_COLLECTION_PATH) < 0) return false;
  try {
    const parsed = new URL(src);
    return parsed.pathname.indexOf(MUSIC_COLLECTION_PATH) === 0;
  } catch (e) {
    return src.indexOf(MUSIC_COLLECTION_PATH) === 0;
  }
}

export function isShareableCollectionLink(link) {
  if (!link || !link.link) return false;
  if (link.googleId) return false;
  return isMusicCollectionLinkUri(link.link);
}

export function getCollectionLinkSyncStatus(link) {
  if (!isMusicCollectionLinkUri(link && link.link)) return null;
  if (link && link.googleId) return 'synced';
  return 'local';
}

const BROWSER_TRANSCODE_EXTENSIONS = ['.wma'];

export function musicCollectionNeedsBrowserTranscode(uri) {
  const src = String(uri || '').trim();
  if (!src) return false;
  let pathname = src;
  try {
    pathname = new URL(src).pathname;
  } catch (e) {
    const idx = src.indexOf(MUSIC_COLLECTION_PATH);
    if (idx >= 0) pathname = src.slice(idx).split('?')[0];
  }
  const lower = pathname.toLowerCase();
  return BROWSER_TRANSCODE_EXTENSIONS.some(function(ext) {
    return lower.endsWith(ext);
  });
}

export function musicCollectionProxyPathFromUri(uri) {
  const src = String(uri || '').trim();
  if (!isMusicCollectionLinkUri(src)) return '';
  try {
    const parsed = new URL(src);
    return parsed.pathname + (parsed.search || '');
  } catch (e) {
    const idx = src.indexOf(MUSIC_COLLECTION_PATH);
    if (idx < 0) return '';
    return src.slice(idx);
  }
}

/** Resolver path for in-browser playback (adds ?playable=1 when ffmpeg transcode is needed). */
export function musicCollectionPlaybackProxyPathFromUri(uri) {
  const proxyPath = musicCollectionProxyPathFromUri(uri);
  if (!proxyPath) return '';
  if (!musicCollectionNeedsBrowserTranscode(uri)) return proxyPath;
  const queryStart = proxyPath.indexOf('?');
  const pathname = queryStart >= 0 ? proxyPath.slice(0, queryStart) : proxyPath;
  const params = new URLSearchParams(queryStart >= 0 ? proxyPath.slice(queryStart + 1) : '');
  params.set('playable', '1');
  return pathname + '?' + params.toString();
}

const MUSIC_COLLECTION_ART_PATH = '/music-collection-art/';

export function musicCollectionArtProxyPathFromUrl(url) {
  const src = String(url || '').trim();
  if (!src) return '';
  try {
    const parsed = new URL(src);
    if (parsed.pathname.indexOf(MUSIC_COLLECTION_ART_PATH) === 0) {
      return parsed.pathname;
    }
  } catch (e) {
  }
  if (src.indexOf(MUSIC_COLLECTION_ART_PATH) === 0) {
    return src.split('?')[0];
  }
  const idx = src.indexOf(MUSIC_COLLECTION_ART_PATH);
  if (idx >= 0) {
    return src.slice(idx).split('?')[0];
  }
  return '';
}
