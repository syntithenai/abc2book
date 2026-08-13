import { searchMusicCollection } from './musicCollectionSearchClient';
import { searchBandcamp } from './bandcampSearchClient';
import { searchInternetArchive } from './internetArchiveSearchClient';
import { searchEuropeana } from './europeanaSearchClient';
import { searchLocAudio } from './locAudioSearchClient';
import { searchYouTubeVideos } from './youtubeSearchClient';
import { scoreTitleArtistMatch } from './notationMatchUtils';
import { isMediaProxyConfigured } from './mediaProxyClient';
import { getActiveResolverAccessToken, getMediaResolverHealthState, probeMediaResolverHealth } from './mediaResolverHealthStore';
import { resolveResolverAccessToken } from './resolverAccessToken';
import { inferTitleArtistFromQuery } from './mediaSearchQueryUtils';
import { dedupeMediaSearchCandidates } from './artistDiscographyCatalog';
import { parseTitleArtistFromYouTubeLabel } from './youtubeTitleParse';

export const MAX_MEDIA_SEARCH_RESULTS = 50;

/** Title/artist score at or above this counts as a strong collection hit. */
export const STRONG_COLLECTION_TITLE_SCORE = 45;

/**
 * Soft-cap for collection token hits with no title/artist string match, so they
 * cannot crowd out better YouTube/archive results when the result list is capped.
 */
export const WEAK_COLLECTION_SCORE_CAP = 25;

const SOURCE_FETCH_LIMITS = {
  collection: 20,
  bandcamp: 20,
  archive: 12,
  europeana: 8,
  loc: 8,
  youtube: 25,
};

const SOURCE_ORDER = {
  'music-collection': 0,
  bandcamp: 1,
  'internet-archive': 2,
  europeana: 3,
  loc: 4,
  youtube: 5,
};

function dedupeCandidates(candidates) {
  return dedupeMediaSearchCandidates(candidates);
}

function sortByMatchScore(candidates) {
  return candidates.slice().sort(function(a, b) {
    const scoreA = Number(a && a.matchScore) || 0;
    const scoreB = Number(b && b.matchScore) || 0;
    if (scoreB !== scoreA) return scoreB - scoreA;
    const sourceA = SOURCE_ORDER[a && a.source];
    const sourceB = SOURCE_ORDER[b && b.source];
    const rankA = Number.isFinite(sourceA) ? sourceA : 99;
    const rankB = Number.isFinite(sourceB) ? sourceB : 99;
    if (rankA !== rankB) return rankA - rankB;
    return String(a && a.title || '').localeCompare(String(b && b.title || ''));
  });
}

function isCollectionCandidate(candidate) {
  return candidate && candidate.source === 'music-collection';
}

function isStrongCollectionMatch(candidate) {
  return isCollectionCandidate(candidate)
    && Number(candidate.titleScore) >= STRONG_COLLECTION_TITLE_SCORE;
}

/**
 * Prefer real collection title hits, then other sources, then weak collection
 * token noise — so a small maxResults cap cannot hide YouTube/archive matches.
 */
export function mergeSourceGroups(groups) {
  const collection = [];
  const external = [];
  (groups || []).forEach(function(group) {
    (group || []).forEach(function(candidate) {
      if (!candidate) return;
      if (isCollectionCandidate(candidate)) collection.push(candidate);
      else external.push(candidate);
    });
  });

  const strongCollection = [];
  const weakCollection = [];
  collection.forEach(function(candidate) {
    if (isStrongCollectionMatch(candidate)) strongCollection.push(candidate);
    else weakCollection.push(candidate);
  });

  return sortByMatchScore(strongCollection)
    .concat(sortByMatchScore(external))
    .concat(sortByMatchScore(weakCollection));
}

function collectCandidates(result) {
  if (result && Array.isArray(result.candidates)) {
    return result.candidates;
  }
  if (result && result.link) {
    return [result];
  }
  return [];
}

function candidateMatchFields(candidate) {
  const title = candidate && candidate.title || '';
  const artist = candidate && candidate.artist || '';
  if (candidate && candidate.source === 'youtube') {
    const parsed = parseTitleArtistFromYouTubeLabel(title, artist);
    if (parsed && parsed.title) {
      return {
        title: parsed.title,
        artist: parsed.artist || artist,
      };
    }
  }
  return { title: title, artist: artist };
}

function withComputedMatchScores(candidates, title, artist) {
  return candidates.map(function(candidate) {
    if (!candidate) return candidate;
    const fields = candidateMatchFields(candidate);
    const titleScore = scoreTitleArtistMatch(
      fields.title,
      fields.artist,
      title,
      artist
    );
    const serverScore = Number(candidate.matchScore) || 0;
    let matchScore = Math.max(titleScore, serverScore);
    if (
      isCollectionCandidate(candidate)
      && titleScore < STRONG_COLLECTION_TITLE_SCORE
      && serverScore > WEAK_COLLECTION_SCORE_CAP
    ) {
      // Token-index hits without a real title match stay discoverable but
      // ranked below close external matches.
      matchScore = Math.min(serverScore, WEAK_COLLECTION_SCORE_CAP);
    }
    return Object.assign({}, candidate, {
      matchScore: matchScore,
      titleScore: titleScore,
    });
  });
}

async function runSourceSearch(searchFn, searchOpts) {
  try {
    const result = await searchFn(searchOpts);
    return { candidates: collectCandidates(result), error: null };
  } catch (error) {
    return { candidates: [], error: error };
  }
}

function throwIfRequired(error, shouldThrow) {
  if (error && shouldThrow) throw error;
}

function resolveTotalCap(options) {
  const opts = options || {};
  const requested = Number(opts.maxTotalResults || opts.maxResults);
  if (Number.isFinite(requested) && requested > 0) {
    return Math.min(MAX_MEDIA_SEARCH_RESULTS, Math.floor(requested));
  }
  return MAX_MEDIA_SEARCH_RESULTS;
}

function buildSourceSearchOpts(options, sourceKey, totalCap) {
  const opts = options || {};
  const query = String(opts.query || opts.title || '').trim();
  const explicitTitle = String(opts.title || '').trim();
  const explicitArtist = String(opts.artist || '').trim();
  const inferred = inferTitleArtistFromQuery(query || explicitTitle);
  const title = explicitTitle || inferred.title || query;
  const artist = explicitArtist || inferred.artist || '';
  const sourceLimit = Math.min(
    SOURCE_FETCH_LIMITS[sourceKey] || 10,
    totalCap
  );

  return Object.assign({}, opts, {
    query: query || title,
    title: title,
    artist: artist,
    maxResults: sourceLimit,
    accessToken: opts.accessToken || opts.token || null,
    token: opts.token || opts.accessToken || null,
  });
}

async function ensureResolverHealthForSearch(accessToken) {
  if (!isMediaProxyConfigured()) return;
  const token = resolveResolverAccessToken(accessToken) || getActiveResolverAccessToken() || null;
  const health = getMediaResolverHealthState();
  if (!health.checked || (health.checked && !health.available && token)) {
    await probeMediaResolverHealth(token);
  }
}

/**
 * Search personal music collection, folk/trad archives, and YouTube in parallel.
 * Strong collection title matches lead; other sources follow; weak collection
 * token hits are listed last so they cannot crowd out YouTube when capped.
 */
export async function searchMediaLinks(options) {
  const opts = options || {};
  const query = String(opts.query || opts.title || '').trim();
  const explicitTitle = String(opts.title || '').trim();
  const explicitArtist = String(opts.artist || '').trim();
  const inferred = inferTitleArtistFromQuery(query || explicitTitle);
  const title = explicitTitle || inferred.title || query;
  const artist = explicitArtist || inferred.artist || '';
  if (!query && !title && !artist) {
    return { empty: true, candidates: [] };
  }

  const accessToken = resolveResolverAccessToken(opts.accessToken || opts.token) || null;
  await ensureResolverHealthForSearch(accessToken);

  const totalCap = resolveTotalCap(opts);
  const collectionOpts = buildSourceSearchOpts(opts, 'collection', totalCap);
  const bandcampOpts = buildSourceSearchOpts(opts, 'bandcamp', totalCap);
  const archiveOpts = buildSourceSearchOpts(opts, 'archive', totalCap);
  const europeanaOpts = buildSourceSearchOpts(opts, 'europeana', totalCap);
  const locOpts = buildSourceSearchOpts(opts, 'loc', totalCap);
  const youtubeOpts = Object.assign({}, buildSourceSearchOpts(opts, 'youtube', totalCap), {
    query: query || [title, artist].filter(Boolean).join(' '),
    accessToken: accessToken,
    token: accessToken,
  });

  const [
    collectionResult,
    bandcampResult,
    archiveResult,
    europeanaResult,
    locResult,
    youtubeResult,
  ] = await Promise.all([
    runSourceSearch(searchMusicCollection, collectionOpts),
    runSourceSearch(searchBandcamp, bandcampOpts),
    runSourceSearch(searchInternetArchive, archiveOpts),
    runSourceSearch(searchEuropeana, europeanaOpts),
    runSourceSearch(searchLocAudio, locOpts),
    runSourceSearch(searchYouTubeVideos, youtubeOpts),
  ]);

  throwIfRequired(collectionResult.error, opts.throwOnCollectionError);
  throwIfRequired(
    bandcampResult.error,
    !collectionResult.candidates.length && opts.throwOnBandcampError
  );
  throwIfRequired(
    archiveResult.error,
    !collectionResult.candidates.length
      && !bandcampResult.candidates.length
      && opts.throwOnInternetArchiveError
  );
  throwIfRequired(
    europeanaResult.error,
    !collectionResult.candidates.length
      && !bandcampResult.candidates.length
      && !archiveResult.candidates.length
      && opts.throwOnEuropeanaError
  );
  throwIfRequired(
    locResult.error,
    !collectionResult.candidates.length
      && !bandcampResult.candidates.length
      && !archiveResult.candidates.length
      && !europeanaResult.candidates.length
      && opts.throwOnLocError
  );
  throwIfRequired(
    youtubeResult.error,
    !collectionResult.candidates.length
      && !bandcampResult.candidates.length
      && !archiveResult.candidates.length
      && !europeanaResult.candidates.length
      && !locResult.candidates.length
  );

  const merged = dedupeCandidates(
    mergeSourceGroups([
      withComputedMatchScores(collectionResult.candidates, title, artist),
      withComputedMatchScores(bandcampResult.candidates, title, artist),
      withComputedMatchScores(archiveResult.candidates, title, artist),
      withComputedMatchScores(europeanaResult.candidates, title, artist),
      withComputedMatchScores(locResult.candidates, title, artist),
      withComputedMatchScores(youtubeResult.candidates, title, artist),
    ])
  ).slice(0, totalCap);

  if (merged.length === 0) {
    return { empty: true, candidates: [] };
  }
  if (merged.length === 1) {
    return Object.assign({ empty: false, multiple: false }, merged[0]);
  }
  return { empty: false, multiple: true, candidates: merged };
}
