import { searchMusicCollection, isMusicCollectionAvailable } from './musicCollectionSearchClient';
import { searchAndroidLocalAudio, isAndroidLocalMediaAvailable } from './androidLocalMediaSearchClient';
import { scoreTitleArtistMatch } from './notationMatchUtils';
import { inferTitleArtistFromQuery } from './mediaSearchQueryUtils';

export const MAX_MAIN_MEDIA_SEARCH_RESULTS = 20;

function collectCandidates(result) {
  if (!result) return [];
  if (Array.isArray(result.candidates)) return result.candidates;
  if (result.link) return [result];
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

function sortByMatchScore(candidates) {
  return candidates.slice().sort(function(a, b) {
    const scoreA = Number(a && a.matchScore) || 0;
    const scoreB = Number(b && b.matchScore) || 0;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return String(a && a.title || '').localeCompare(String(b && b.title || ''));
  });
}

function sourceRank(source) {
  if (source === 'music-collection') return 0;
  if (source === 'device-file') return 1;
  return 2;
}

export function mergeMainMediaCandidates(groups, totalCap) {
  const collection = sortByMatchScore(groups.collection || []);
  const device = sortByMatchScore(groups.device || []);
  const merged = collection.concat(device);
  const seen = {};
  const out = [];
  merged.forEach(function(candidate) {
    if (!candidate) return;
    const key = [
      String(candidate.source || ''),
      String(candidate.title || ''),
      String(candidate.artist || ''),
      String(candidate.link || candidate.uri || candidate.path || ''),
    ].join('::');
    if (seen[key]) return;
    seen[key] = true;
    out.push(candidate);
  });
  out.sort(function(a, b) {
    const rankA = sourceRank(a && a.source);
    const rankB = sourceRank(b && b.source);
    if (rankA !== rankB) return rankA - rankB;
    const scoreA = Number(a && a.matchScore) || 0;
    const scoreB = Number(b && b.matchScore) || 0;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return String(a && a.title || '').localeCompare(String(b && b.title || ''));
  });
  return out.slice(0, totalCap);
}

async function runSourceSearch(searchFn, searchOpts) {
  try {
    const result = await searchFn(searchOpts);
    return { candidates: collectCandidates(result), error: null };
  } catch (error) {
    return { candidates: [], error: error };
  }
}

/**
 * Search resolver music collection and Android device audio for main tune list.
 */
export async function searchMainMediaSources(options) {
  const opts = options || {};
  const query = String(opts.query || opts.title || '').trim();
  if (!query) {
    return { empty: true, candidates: [] };
  }
  const inferred = inferTitleArtistFromQuery(query);
  const title = String(opts.title || inferred.title || query).trim();
  const artist = String(opts.artist || inferred.artist || '').trim();
  const totalCap = Math.min(
    Number(opts.maxResults || opts.limit) || MAX_MAIN_MEDIA_SEARCH_RESULTS,
    MAX_MAIN_MEDIA_SEARCH_RESULTS
  );

  const searchOpts = {
    query: query,
    title: title,
    artist: artist,
    maxResults: totalCap,
    accessToken: opts.accessToken || opts.token || null,
    token: opts.token || opts.accessToken || null,
    signal: opts.signal,
  };

  const tasks = [];
  if (isMusicCollectionAvailable()) {
    tasks.push(runSourceSearch(searchMusicCollection, searchOpts));
  } else {
    tasks.push(Promise.resolve({ candidates: [], error: null }));
  }
  if (isAndroidLocalMediaAvailable()) {
    tasks.push(runSourceSearch(searchAndroidLocalAudio, searchOpts));
  } else {
    tasks.push(Promise.resolve({ candidates: [], error: null }));
  }

  const results = await Promise.all(tasks);
  const collectionCandidates = withComputedMatchScores(results[0].candidates, title, artist);
  const deviceCandidates = withComputedMatchScores(results[1].candidates, title, artist);
  const candidates = mergeMainMediaCandidates({
    collection: collectionCandidates,
    device: deviceCandidates,
  }, totalCap);

  if (!candidates.length) {
    return { empty: true, candidates: [] };
  }
  return { empty: false, candidates: candidates };
}
