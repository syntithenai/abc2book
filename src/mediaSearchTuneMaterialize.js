import { Capacitor } from '@capacitor/core';
import {
  isDeviceFileResult,
  isMusicCollectionResult,
  isWebMediaSearchResult,
  isYoutubeResult,
} from './mediaLinkSearchDisplay';
import { normalizeMediaIdentityKey } from './mediaImportCandidates';
import { openAndroidAudioFileForImport } from './androidLocalMediaSearchClient';
import { resolveMediaFileIdentity } from './mediaImportCandidates';
import { createAttachedAudioLink } from './linkRecording';
import {
  runAddTuneAutoEnrich,
  isAddTuneAutoEnrichPending,
} from './addTuneAutoEnrich';
import { inferNotationSongType } from './textSearchIndexUtils';
import { mediaArtistTitleIdentityKey } from './importTitleMatch';
import { artistNamesMatch } from './artistDiscographyPlaybackResolver';

export const MYMEDIA_BOOK = 'mymedia';

const inFlightByKey = new Map();

function normalizeLinkUri(uri) {
  return String(uri || '').trim();
}

function candidateYoutubeId(candidate) {
  if (!candidate) return '';
  if (candidate.youtubeId) return String(candidate.youtubeId).trim();
  if (candidate.source === 'youtube' && candidate.id) return String(candidate.id).trim();
  return '';
}

function candidateLinkUri(candidate) {
  if (!candidate) return '';
  const youtubeId = candidateYoutubeId(candidate);
  if (youtubeId) return 'https://www.youtube.com/watch?v=' + youtubeId;
  return normalizeLinkUri(candidate.link);
}

export function materializeKey(candidate) {
  if (!candidate) return '';
  if (isMusicCollectionResult(candidate)) {
    const identity = musicCollectionCandidateIdentityKey(candidate);
    if (identity) return identity;
    return 'music-collection:' + String(candidate.id || candidate.path || candidate.link || '').trim();
  }
  if (isDeviceFileResult(candidate)) {
    return 'device-file:' + String(candidate.uri || candidate.title || '').trim();
  }
  const link = candidateLinkUri(candidate);
  if (link && isWebMediaSearchResult(candidate)) {
    return String(candidate.source || 'web-media') + ':' + link;
  }
  return '';
}

/**
 * Canonical path for the same music-collection file across id/path/link variants.
 */
export function normalizeMusicCollectionRelativePath(value) {
  let text = String(value || '').trim();
  if (!text) return '';
  text = text.replace(/^\/+/, '');
  const prefix = 'music-collection/';
  if (text.toLowerCase().startsWith(prefix)) {
    text = text.slice(prefix.length);
  }
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      text = String(url.pathname || '').replace(/^\/+/, '');
      if (text.toLowerCase().startsWith(prefix)) {
        text = text.slice(prefix.length);
      }
    } catch (e) {
      // keep text as-is
    }
  }
  return text.replace(/^\/+/, '').toLowerCase();
}

export function musicCollectionCandidateIdentityKey(candidate) {
  if (!candidate) return '';
  const path = normalizeMusicCollectionRelativePath(candidate.path);
  const linkPath = normalizeMusicCollectionRelativePath(candidate.link);
  const id = String(candidate.id || '').trim();
  if (path) return 'music-collection:path:' + path;
  if (linkPath) return 'music-collection:path:' + linkPath;
  if (id) return 'music-collection:id:' + id;
  return '';
}

function collectionPathsMatch(left, right) {
  const a = normalizeMusicCollectionRelativePath(left);
  const b = normalizeMusicCollectionRelativePath(right);
  return a && b && a === b;
}

export function isMaterializableMediaSearchCandidate(candidate) {
  return isMusicCollectionResult(candidate)
    || isDeviceFileResult(candidate)
    || isWebMediaSearchResult(candidate);
}

function linkMatchesCollectionCandidate(link, candidate) {
  if (!link || !candidate) return false;
  const entryId = String(candidate.id || '').trim();
  const path = String(candidate.path || '').trim();
  const linkUri = normalizeLinkUri(link.link);
  const candidateLink = normalizeLinkUri(candidate.link);
  if (entryId && String(link.collectionEntryId || '').trim() === entryId) return true;
  if (path && String(link.collectionPath || '').trim() === path) return true;
  if (path && collectionPathsMatch(link.collectionPath, candidate.path)) return true;
  if (candidateLink && linkUri && candidateLink === linkUri) return true;
  if (candidateLink && collectionPathsMatch(linkUri, candidate.link)) return true;
  if (path && collectionPathsMatch(link.link, candidate.path)) return true;
  return false;
}

function linkMatchesDeviceFileCandidate(link, candidate) {
  if (!link || !candidate) return false;
  const uri = String(candidate.uri || '').trim();
  if (uri && String(link.deviceFileUri || '').trim() === uri) return true;
  return false;
}

function linkMatchesWebMediaCandidate(link, candidate) {
  if (!link || !candidate) return false;
  const linkUri = normalizeLinkUri(link.link);
  const candidateUri = candidateLinkUri(candidate);
  if (!linkUri || !candidateUri || linkUri !== candidateUri) return false;
  const linkSource = String(link.source || '').trim();
  const candidateSource = String(candidate.source || '').trim();
  if (linkSource && candidateSource && linkSource !== candidateSource) return false;
  return true;
}

function tuneMatchesDeviceFileCandidate(tune, candidate) {
  if (!tune || !Array.isArray(tune.links)) return false;
  if (tune.links.some(function(link) { return linkMatchesDeviceFileCandidate(link, candidate); })) {
    return true;
  }
  const key = normalizeMediaIdentityKey(candidate.title, candidate.artist);
  if (!key || key === '\0') return false;
  if (normalizeMediaIdentityKey(tune.name, tune.composer) !== key) return false;
  return tune.links.some(function(link) {
    return link.source === 'device-file' || String(link.deviceFileUri || '').trim();
  });
}

function tuneHasMatchingLink(tune, candidate) {
  if (!tune) return false;
  if (isDeviceFileResult(candidate)) return tuneMatchesDeviceFileCandidate(tune, candidate);
  if (!Array.isArray(tune.links)) return false;
  return tune.links.some(function(link) {
    if (isMusicCollectionResult(candidate)) return linkMatchesCollectionCandidate(link, candidate);
    if (isWebMediaSearchResult(candidate)) return linkMatchesWebMediaCandidate(link, candidate);
    return false;
  });
}

function tuneHasMediaIdentity(tune) {
  if (!tune) return false;
  if (Array.isArray(tune.books) && tune.books.indexOf(MYMEDIA_BOOK) >= 0) return true;
  if (!Array.isArray(tune.links)) return false;
  return tune.links.some(function(link) {
    const source = String(link && link.source || '').trim();
    return source === 'music-collection'
      || source === 'device-file'
      || link.collectionEntryId
      || link.collectionPath
      || link.deviceFileUri;
  });
}

function tuneMatchesCandidateArtistTitle(tune, candidate) {
  if (!tune || !candidate) return false;
  const candidateTitle = String(candidate.title || '').trim();
  if (!candidateTitle) return false;
  const tuneTitle = String(tune.name || tune.title || '').trim();
  if (!tuneTitle) return false;
  const candidateArtist = String(candidate.artist || '').trim();
  const tuneArtist = String(tune.composer || '').trim();
  if (candidateArtist && tuneArtist && !artistNamesMatch(tuneArtist, candidateArtist)) return false;
  const candidateKey = mediaArtistTitleIdentityKey(candidate.title, candidate.artist);
  const tuneKey = mediaArtistTitleIdentityKey(tune.name || tune.title, tune.composer);
  return candidateKey && tuneKey && candidateKey === tuneKey;
}

export function findExistingMediaSearchTuneByLink(tunes, candidate) {
  if (!candidate || !tunes) return null;
  const ids = Object.keys(tunes);
  for (let i = 0; i < ids.length; i += 1) {
    const tune = tunes[ids[i]];
    if (tuneHasMatchingLink(tune, candidate)) return tune;
  }
  return null;
}

export function findExistingMediaSearchTune(tunes, candidate) {
  if (!candidate || !tunes) return null;
  const candidateKey = mediaArtistTitleIdentityKey(candidate.title, candidate.artist);
  const ids = Object.keys(tunes);
  for (let i = 0; i < ids.length; i += 1) {
    const tune = tunes[ids[i]];
    if (tuneHasMatchingLink(tune, candidate)) return tune;
  }
  if (!candidateKey || candidateKey === '\0') return null;
  for (let i = 0; i < ids.length; i += 1) {
    const tune = tunes[ids[i]];
    if (!tuneHasMediaIdentity(tune)) continue;
    if (tuneMatchesCandidateArtistTitle(tune, candidate)) return tune;
  }
  return null;
}

/**
 * Fast lookup for batch materialization — avoids scanning every tune per candidate.
 */
export function createMediaSearchTuneLookup(tunes) {
  const byCollectionEntryId = Object.create(null);
  const byCollectionPath = Object.create(null);
  const byLinkUri = Object.create(null);
  const byDeviceUri = Object.create(null);
  const byDeviceIdentity = Object.create(null);
  const byArtistTitle = Object.create(null);

  function registerTune(tune) {
    if (!tune || !tune.id) return;
    if (tuneHasMediaIdentity(tune)) {
      const artistTitleKey = mediaArtistTitleIdentityKey(tune.name, tune.composer);
      if (artistTitleKey && artistTitleKey !== '\0' && !byArtistTitle[artistTitleKey]) {
        byArtistTitle[artistTitleKey] = tune;
      }
    }
    if (!Array.isArray(tune.links)) return;
    tune.links.forEach(function(link) {
      const entryId = String(link.collectionEntryId || '').trim();
      const path = normalizeMusicCollectionRelativePath(link.collectionPath || link.link);
      const linkUri = normalizeLinkUri(link.link);
      const source = String(link.source || '').trim();
      const deviceUri = String(link.deviceFileUri || '').trim();
      if (entryId) byCollectionEntryId[entryId] = tune;
      if (path) byCollectionPath[path] = tune;
      if (linkUri) {
        byLinkUri[linkUri] = tune;
        if (source) byLinkUri[source + ':' + linkUri] = tune;
        const linkPath = normalizeMusicCollectionRelativePath(linkUri);
        if (linkPath) byCollectionPath[linkPath] = tune;
      }
      if (deviceUri) byDeviceUri[deviceUri] = tune;
      if (link.source === 'device-file' || deviceUri) {
        const identity = normalizeMediaIdentityKey(tune.name, tune.composer);
        if (identity && identity !== '\0') byDeviceIdentity[identity] = tune;
      }
    });
  }

  function find(candidate) {
    if (!candidate) return null;
    if (isDeviceFileResult(candidate)) {
      const uri = String(candidate.uri || '').trim();
      if (uri && byDeviceUri[uri]) return byDeviceUri[uri];
      const identity = normalizeMediaIdentityKey(candidate.title, candidate.artist);
      if (identity && identity !== '\0' && byDeviceIdentity[identity]) return byDeviceIdentity[identity];
      return null;
    }
    if (isMusicCollectionResult(candidate)) {
      const entryId = String(candidate.id || '').trim();
      const path = normalizeMusicCollectionRelativePath(candidate.path || candidate.link);
      if (entryId && byCollectionEntryId[entryId]) return byCollectionEntryId[entryId];
      if (path && byCollectionPath[path]) return byCollectionPath[path];
      const candidateLink = normalizeLinkUri(candidate.link);
      if (candidateLink && byLinkUri[candidateLink]) return byLinkUri[candidateLink];
      const artistTitleKey = mediaArtistTitleIdentityKey(candidate.title, candidate.artist);
      if (artistTitleKey && byArtistTitle[artistTitleKey]) return byArtistTitle[artistTitleKey];
      return null;
    }
    if (isWebMediaSearchResult(candidate)) {
      const uri = candidateLinkUri(candidate);
      const source = String(candidate.source || '').trim();
      if (uri && byLinkUri[source + ':' + uri]) return byLinkUri[source + ':' + uri];
      if (uri && byLinkUri[uri]) return byLinkUri[uri];
      const artistTitleKey = mediaArtistTitleIdentityKey(candidate.title, candidate.artist);
      if (artistTitleKey && byArtistTitle[artistTitleKey]) return byArtistTitle[artistTitleKey];
      return null;
    }
    return null;
  }

  Object.keys(tunes || {}).forEach(function(id) {
    registerTune(tunes[id]);
  });

  return { find: find, registerTune: registerTune };
}

function buildBackgroundInfo(candidate) {
  const lines = [];
  const composer = String(candidate.composer || '').trim();
  const albumartist = String(candidate.albumartist || '').trim();
  const artist = String(candidate.artist || '').trim();
  if (composer && composer !== artist) lines.push('Composer: ' + composer);
  if (albumartist && albumartist !== artist) lines.push('Album artist: ' + albumartist);
  return lines.join('\n');
}

function buildMediaCandidateTags(candidate) {
  const tags = [];
  const year = String(candidate.year || '').trim();
  const tracknumber = String(candidate.tracknumber || '').trim();
  if (year) tags.push(year);
  if (tracknumber) tags.push('track:' + tracknumber);
  return tags;
}

export function buildCollectionTuneFromCandidate(candidate) {
  const title = String(candidate.title || 'Untitled').trim() || 'Untitled';
  const artist = String(candidate.artist || '').trim();
  const album = String(candidate.album || '').trim();
  const genre = String(candidate.genre || '').trim();
  const link = {
    link: candidate.link || '',
    title: title,
    source: 'music-collection',
  };
  if (candidate.image) link.image = candidate.image;
  if (candidate.id) link.collectionEntryId = String(candidate.id);
  if (candidate.path) link.collectionPath = String(candidate.path);
  const tune = {
    name: title,
    composer: artist,
    books: [MYMEDIA_BOOK],
    albums: album ? [album] : [],
    genres: genre ? [genre] : [],
    // Collection imports go in mymedia only — do not promote year/track metadata into tags.
    tags: [],
    backgroundInfo: buildBackgroundInfo(candidate),
    links: [link],
    mediaCacheLocked: true,
  };
  return tune;
}

export function buildWebMediaTuneFromCandidate(candidate) {
  const title = String(candidate.title || 'Untitled').trim() || 'Untitled';
  const artist = String(candidate.artist || '').trim();
  const album = String(candidate.album || '').trim();
  const source = String(candidate.source || 'web-media').trim() || 'web-media';
  const linkUri = candidateLinkUri(candidate);
  const link = {
    link: linkUri,
    title: title,
    source: source,
  };
  if (candidate.image) link.image = candidate.image;
  const tune = {
    name: title,
    composer: artist,
    books: [MYMEDIA_BOOK],
    albums: album ? [album] : [],
    tags: buildMediaCandidateTags(candidate),
    backgroundInfo: buildBackgroundInfo(candidate),
    links: [link],
  };
  if (!isYoutubeResult(candidate)) {
    tune.mediaCacheLocked = true;
  }
  return tune;
}

async function buildDeviceFileTuneFromCandidate(candidate) {
  const imported = await openAndroidAudioFileForImport(candidate.uri);
  const filePath = imported && imported.filePath ? imported.filePath : '';
  if (!filePath) throw new Error('Could not read device audio file');
  const fileName = imported.name || candidate.title || 'audio';
  const fileUrl = Capacitor.convertFileSrc(filePath);
  const response = await fetch(fileUrl);
  const blob = await response.blob();
  const file = new File([blob], fileName, { type: imported.mime || blob.type || 'audio/*' });
  const draft = {
    tune: {
      name: candidate.title || fileName,
      composer: candidate.artist || '',
      books: [MYMEDIA_BOOK],
    },
  };
  const identity = await resolveMediaFileIdentity(file, draft);
  const tuneBase = {
    name: identity.title,
    composer: identity.artist,
    books: [MYMEDIA_BOOK],
    albums: identity.album ? [identity.album] : [],
    links: [],
    srcUrl: candidate.uri,
    mediaCacheLocked: true,
  };
  const attached = await createAttachedAudioLink({
    tune: tuneBase,
    file: file,
    title: identity.title || fileName,
    uploadToDrive: false,
  });
  const link = Object.assign({}, attached.link, {
    source: 'device-file',
    deviceFileUri: String(candidate.uri || '').trim(),
  });
  return Object.assign({}, tuneBase, { links: [link] });
}

export function tuneHasMusicCollectionLink(tune) {
  if (!tune || !Array.isArray(tune.links)) return false;
  return tune.links.some(function(link) {
    return !!(link && (
      String(link.source || '').trim() === 'music-collection'
      || link.collectionEntryId
      || link.collectionPath
    ));
  });
}

export function scheduleMediaSearchTuneEnrichment(tune, tunebook, options) {
  const opts = options || {};
  if (!tune || !tune.id || !tunebook) return;
  // Library imports already have audio; do not auto-pull lyrics/chords/notation.
  if (opts.skipEnrich || tuneHasMusicCollectionLink(tune)) return;
  if (isAddTuneAutoEnrichPending(tune.id)) return;
  Promise.resolve(runAddTuneAutoEnrich({
    tune: tune,
    tunebook: tunebook,
    abcjsParser: opts.abcjsParser,
    accessToken: opts.accessToken || '',
    resolverAvailable: opts.resolverAvailable,
    searchIndex: opts.searchIndex,
    loadTuneTexts: opts.loadTuneTexts,
    forceRefresh: opts.forceRefresh,
    songType: inferNotationSongType(tune.rhythm || '', tune.composer || ''),
  })).catch(function() {});
}

export async function ensureMediaSearchTune(candidate, tunebook, options) {
  const opts = options || {};
  if (!candidate || !tunebook) throw new Error('Missing candidate or tunebook');
  if (!isMaterializableMediaSearchCandidate(candidate)) {
    throw new Error('Unsupported media search source');
  }

  const tunes = opts.tunes || tunebook.tunes || {};
  const skipEnrich = !!opts.skipEnrich || isMusicCollectionResult(candidate);
  const enrichOpts = Object.assign({}, opts, { skipEnrich: skipEnrich });
  const existing = findExistingMediaSearchTune(tunes, candidate);
  if (existing) {
    scheduleMediaSearchTuneEnrichment(existing, tunebook, enrichOpts);
    return existing;
  }

  const key = materializeKey(candidate);
  if (key && inFlightByKey.has(key)) {
    return inFlightByKey.get(key);
  }

  const promise = (async function() {
    const again = findExistingMediaSearchTune(tunes, candidate);
    if (again) {
      scheduleMediaSearchTuneEnrichment(again, tunebook, enrichOpts);
      return again;
    }
    let tuneDraft;
    if (isMusicCollectionResult(candidate)) {
      tuneDraft = buildCollectionTuneFromCandidate(candidate);
    } else if (isWebMediaSearchResult(candidate)) {
      tuneDraft = buildWebMediaTuneFromCandidate(candidate);
    } else {
      tuneDraft = await buildDeviceFileTuneFromCandidate(candidate);
    }
    const saved = tunebook.saveTune(tunebook.createTune(tuneDraft), true, {
      skipHistory: true,
      deferCommit: !!opts.deferCommit,
    });
    scheduleMediaSearchTuneEnrichment(saved, tunebook, enrichOpts);
    return saved;
  })();

  if (key) inFlightByKey.set(key, promise);
  try {
    return await promise;
  } finally {
    if (key) inFlightByKey.delete(key);
  }
}
