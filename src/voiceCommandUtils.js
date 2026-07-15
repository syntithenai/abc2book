const { allArtists, allTitles } = require('./tuneBibliographicUtils')

const VOICE_COMMAND_WORDS = new Set([
  'show', 'open', 'go', 'to', 'play', 'search', 'find', 'filter',
  'the', 'a', 'an', 'for', 'in', 'by', 'from', 'with', 'tag', 'tagged', 'book', 'tool',
]);

export const VOICE_APP_TOOL_ROUTES = {
  metronome: '/metronome',
  tuner: '/tuner',
  chords: '/chords',
  keyboard: '/piano',
};

const SEARCH_CUE_WORDS = new Set([
  'search', 'find', 'filter', 'book', 'tag', 'tagged', 'in', 'by', 'from', 'with',
]);

export const VOICE_CONFIDENCE_THRESHOLD = 0.55;

export function formatVoiceCommandFeedback(transcript, message) {
  const spoken = String(transcript || '').trim();
  const action = String(message || '').trim();
  if (spoken && action) return '"' + spoken + '" — ' + action;
  return action || spoken;
}

function toSearchText(text) {
  return text ? String(text).toLowerCase().trim() : '';
}

export function buildVoiceCatalogs(tunebook) {
  const books = Object.keys(tunebook.getTuneBookOptions() || {}).sort().slice(0, 200);
  const tags = Object.keys(tunebook.getTuneTagOptions() || {}).sort().slice(0, 200);
  return { books, tags };
}

export function stripVoiceCommandWords(text) {
  const parts = toSearchText(text).split(/\s+/).filter(Boolean);
  const kept = parts.filter(function(word) {
    return !VOICE_COMMAND_WORDS.has(word);
  });
  return kept.join(' ').trim();
}

export function getVoiceSearchableText(text) {
  const lettersAndDigits = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripVoiceCommandWords(lettersAndDigits);
}

export function isMeaningfulVoiceTranscript(text) {
  const searchable = getVoiceSearchableText(text);
  if (!searchable) return false;
  return searchable.split(/\s+/).some(function(token) {
    return token.replace(/[^a-z0-9]/gi, '').length >= 2;
  });
}

export function hasSearchCueWords(text) {
  const parts = toSearchText(text).split(/\s+/).filter(Boolean);
  return parts.some(function(word) {
    return SEARCH_CUE_WORDS.has(word);
  });
}

export function scoreTuneMatch(query, tune) {
  const normalizedQuery = getVoiceSearchableText(query);
  if (!normalizedQuery || !isMeaningfulVoiceTranscript(query) || !tune) return 0;

  const titles = allTitles(tune);
  const artists = allArtists(tune);
  if (titles.length === 0 && artists.length === 0) return 0;

  let score = 0;
  titles.forEach(function(titleText, index) {
    const name = toSearchText(titleText);
    const titleWeight = index === 0 ? 1 : 0.75;
    if (name === normalizedQuery) score += Math.round(10 * titleWeight);
    if (name && name.indexOf(normalizedQuery) !== -1) score += Math.round(6 * titleWeight);
  });
  artists.forEach(function(artistText, index) {
    const composer = toSearchText(artistText);
    const artistWeight = index === 0 ? 1 : 0.75;
    if (composer === normalizedQuery) score += Math.round(8 * artistWeight);
    if (composer && composer.indexOf(normalizedQuery) !== -1) score += Math.round(4 * artistWeight);
  });

  const queryTokens = normalizedQuery.split(/\s+/).filter(function(token) {
    return token.length > 2;
  });
  queryTokens.forEach(function(token) {
    titles.forEach(function(titleText, index) {
      const name = toSearchText(titleText);
      const titleWeight = index === 0 ? 1 : 0.6;
      if (name && name.indexOf(token) !== -1) score += Math.round(4 * titleWeight);
    });
    artists.forEach(function(artistText, index) {
      const composer = toSearchText(artistText);
      const artistWeight = index === 0 ? 1 : 0.6;
      if (composer && composer.indexOf(token) !== -1) score += Math.round(2 * artistWeight);
    });
  });

  const primaryName = toSearchText(titles[0] || '');
  if (primaryName && queryTokens.length > 0) {
    const ordered = queryTokens.join(' ');
    if (ordered && primaryName.indexOf(ordered) !== -1) score += 3;
  }

  return score;
}

export function findTuneCandidates(query, tunes, options) {
  const limit = options && options.limit ? options.limit : 10;
  const minScore = options && options.minScore ? options.minScore : 4;
  if (!isMeaningfulVoiceTranscript(query) || !tunes) return [];

  const normalizedQuery = getVoiceSearchableText(query);
  if (!normalizedQuery) return [];

  return Object.values(tunes)
    .map(function(tune) {
      return {
        tune: tune,
        score: scoreTuneMatch(normalizedQuery, tune),
      };
    })
    .filter(function(entry) {
      return entry.score >= minScore;
    })
    .sort(function(a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return toSearchText(a.tune.name).localeCompare(toSearchText(b.tune.name));
    })
    .slice(0, limit);
}

export function shouldAutoPickCandidate(candidates) {
  if (!candidates || candidates.length === 0) return false;
  if (candidates.length === 1) return true;
  return candidates[0].score >= candidates[1].score * 2;
}
