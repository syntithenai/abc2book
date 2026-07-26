import { searchMusicCollection } from './musicCollectionSearchClient';
import { searchYouTubeVideos } from './youtubeSearchClient';

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
    const key = normalizeTitleArtistKey(candidate.title, candidate.artist || candidate.source);
    if (seen[key]) return;
    seen[key] = true;
    out.push(candidate);
  });
  return out;
}

function sortCollectionCandidates(candidates) {
  return candidates.slice().sort(function(a, b) {
    const scoreA = Number(a && a.matchScore) || 0;
    const scoreB = Number(b && b.matchScore) || 0;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return String(a && a.title || '').localeCompare(String(b && b.title || ''));
  });
}

/**
 * Search personal music collection first, then YouTube.
 */
export async function searchMediaLinks(options) {
  const opts = options || {};
  const query = String(opts.query || opts.title || '').trim();
  const title = String(opts.title || opts.query || '').trim();
  const artist = String(opts.artist || '').trim();
  if (!query && !title && !artist) {
    return { empty: true, candidates: [] };
  }

  let collectionCandidates = [];
  try {
    const collectionResult = await searchMusicCollection(Object.assign({}, opts, {
      query: query || title,
      title: title || query,
      artist: artist,
    }));
    if (collectionResult && Array.isArray(collectionResult.candidates)) {
      collectionCandidates = collectionResult.candidates;
    } else if (collectionResult && collectionResult.link) {
      collectionCandidates = [collectionResult];
    }
  } catch (e) {
    if (opts.throwOnCollectionError) throw e;
  }

  let youtubeCandidates = [];
  try {
    const youtubeResult = await searchYouTubeVideos(Object.assign({}, opts, {
      query: query || [title, artist].filter(Boolean).join(' '),
      title: title || query,
      artist: artist,
    }));
    if (youtubeResult && Array.isArray(youtubeResult.candidates)) {
      youtubeCandidates = youtubeResult.candidates;
    } else if (youtubeResult && youtubeResult.link) {
      youtubeCandidates = [youtubeResult];
    }
  } catch (e) {
    if (!collectionCandidates.length) throw e;
  }

  const merged = dedupeCandidates(
    sortCollectionCandidates(collectionCandidates).concat(youtubeCandidates)
  );

  if (merged.length === 0) {
    return { empty: true, candidates: [] };
  }
  if (merged.length === 1) {
    return Object.assign({ empty: false, multiple: false }, merged[0]);
  }
  return { empty: false, multiple: true, candidates: merged };
}
