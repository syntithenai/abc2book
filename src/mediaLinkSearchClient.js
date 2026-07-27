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

export const MAX_MEDIA_SEARCH_RESULTS = 50;

const SOURCE_FETCH_LIMITS = {
  collection: 20,
  bandcamp: 20,
  archive: 12,
  europeana: 8,
  loc: 8,
  youtube: 25,
};

function normalizeTitleArtistKey(title, artist) {
  return [String(title || ''), String(artist || '')]
    .join(' ')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupeCandidates(candidates) {
  const seen = {};
  const out = [];
  candidates.forEach(function(candidate) {
    if (!candidate) return;
    const key = [
      String(candidate.source || ''),
      normalizeTitleArtistKey(candidate.title, candidate.artist || ''),
      String(candidate.link || ''),
    ].join('::');
    if (seen[key]) return;
    seen[key] = true;
    out.push(candidate);
  });
  return out;
}

function sortByMatchScore(candidates) {
  return candidates.slice().sort(function(a, b) {
    const scoreA = Number(a && a.matchScore) || 0;
    const scoreB = Number(b && b.matchScore) || 0;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return String(a && a.title || '').localeCompare(String(b && b.title || ''));
  });
}

function mergeSourceGroups(groups) {
  return groups.reduce(function(merged, group) {
    return merged.concat(sortByMatchScore(group));
  }, []);
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

function withComputedMatchScores(candidates, title, artist) {
  return candidates.map(function(candidate) {
    if (!candidate) return candidate;
    if (Number(candidate.matchScore) > 0) return candidate;
    const computed = scoreTitleArtistMatch(
      candidate.title,
      candidate.artist,
      title,
      artist
    );
    if (!computed) return candidate;
    return Object.assign({}, candidate, { matchScore: computed });
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
 * Collection matches are listed first when present, then other sources by relevance.
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
