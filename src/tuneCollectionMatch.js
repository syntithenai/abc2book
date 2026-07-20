import { findTuneCandidates, getVoiceSearchableText, scoreTuneMatch } from './voiceCommandUtils';
import { importLyricsMatchForDeduping } from './importLyricsMatch';

function normalizeYouTubeId(value) {
  if (!value) return '';
  const text = String(value).trim();
  const match = text.match(/(?:youtu\.be\/|v=|\/embed\/|\/v\/)([\w-]{11})/);
  if (match) return match[1];
  if (/^[\w-]{11}$/.test(text)) return text;
  return '';
}

function tuneYouTubeIds(tune) {
  const ids = {};
  if (!tune || !Array.isArray(tune.links)) return ids;
  tune.links.forEach(function(link) {
    const id = normalizeYouTubeId(link && link.link ? link.link : '');
    if (id) ids[id] = true;
  });
  return ids;
}

export function matchConfidenceLabel(score, youtubeMatch) {
  if (youtubeMatch) return 'Exact';
  if (score >= 14) return 'Exact';
  if (score >= 8) return 'Likely';
  if (score >= 4) return 'Approximate';
  return '';
}

export function findCollectionMatches(options) {
  const title = options && options.title ? options.title : '';
  const artist = options && options.artist ? options.artist : '';
  const tunes = options && options.tunes ? options.tunes : {};
  const youtubeUrl = options && options.youtubeUrl ? options.youtubeUrl : '';
  const limit = options && options.limit ? options.limit : 8;
  const minScore = options && options.minScore != null ? options.minScore : 3;
  const importTune = options && (options.importTune || options.lyricsTune) || null;

  const query = [title, artist].filter(Boolean).join(' ').trim();
  const youtubeId = normalizeYouTubeId(youtubeUrl);
  const seen = {};
  const results = [];

  if (youtubeId) {
    Object.values(tunes).forEach(function(tune) {
      if (!tune || !tune.id) return;
      const ids = tuneYouTubeIds(tune);
      if (ids[youtubeId]) {
        seen[tune.id] = true;
        results.push({
          tune: tune,
          score: 100,
          confidence: 'Exact',
          youtubeMatch: true,
        });
      }
    });
  }

  const titleCandidates = findTuneCandidates(query || title, tunes, {
    limit: limit,
    minScore: minScore,
  });

  titleCandidates.forEach(function(entry) {
    if (!entry.tune || !entry.tune.id || seen[entry.tune.id]) return;
    seen[entry.tune.id] = true;
    results.push({
      tune: entry.tune,
      score: entry.score,
      confidence: matchConfidenceLabel(entry.score, false),
      youtubeMatch: false,
    });
  });

  if (title && artist) {
    Object.values(tunes).forEach(function(tune) {
      if (!tune || !tune.id || seen[tune.id]) return;
      const titleScore = scoreTuneMatch(title, tune);
      const artistScore = scoreTuneMatch(artist, { name: '', composer: tune.composer || '', artists: tune.artists || [] });
      const combined = titleScore + artistScore;
      if (combined >= minScore) {
        seen[tune.id] = true;
        results.push({
          tune: tune,
          score: combined,
          confidence: matchConfidenceLabel(combined, false),
          youtubeMatch: false,
        });
      }
    });
  }

  return results
    .filter(function(entry) {
      if (!importTune || !entry || !entry.tune) return true;
      // Exact YouTube identity overrides lyric disagreements
      if (entry.youtubeMatch) return true;
      return importLyricsMatchForDeduping(importTune, entry.tune);
    })
    .sort(function(a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.tune.name || '').localeCompare(String(b.tune.name || ''));
    })
    .slice(0, limit);
}

export function findTuneByImportHash(tunesHash, hash) {
  if (!tunesHash || !hash || !tunesHash.importhashes) return null;
  const entry = tunesHash.importhashes[hash];
  if (Array.isArray(entry)) return entry[0] || null;
  return entry || null;
}
