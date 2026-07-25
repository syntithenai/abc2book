import { getMusicGenreList } from './musicGenreOptions';

const SOURCE_GENRE_RULES = [
  { pattern: /thesession\.org/i, genre: 'Irish Traditional', reason: 'The Session' },
  { pattern: /tradtunedb\.org\/.*scandi/i, genre: 'Scandinavian Folk', reason: 'TradTuneDB' },
  { pattern: /tradtunedb\.org/i, genre: 'Folk', reason: 'TradTuneDB' },
  { pattern: /folktunefinder/i, genre: 'Folk', reason: 'Folk Tune Finder' },
  { pattern: /bluegrass/i, genre: 'Bluegrass', reason: 'source site' },
  { pattern: /mandolintab/i, genre: 'Bluegrass', reason: 'source site' },
  { pattern: /banjohangout/i, genre: 'Bluegrass', reason: 'source site' },
  { pattern: /worship|hymn|praisecharts|worshiptogether/i, genre: 'Gospel', reason: 'source site' },
  { pattern: /jazzstandards|jazz\.org|ejazz|allaboutjazz/i, genre: 'Jazz', reason: 'source site' },
  { pattern: /celtic|irishmusic|tunebook\.com\.au/i, genre: 'Celtic', reason: 'source site' },
  { pattern: /countrytabs|country\s*lyrics/i, genre: 'Country', reason: 'source site' },
  { pattern: /blues/i, genre: 'Blues', reason: 'source site' },
  { pattern: /klezmer/i, genre: 'Klezmer', reason: 'source site' },
  { pattern: /flamenco/i, genre: 'Flamenco', reason: 'source site' },
  { pattern: /old[- ]?time/i, genre: 'Old-Time', reason: 'source site' },
  { pattern: /folkopedia/i, genre: 'Folk', reason: 'Folkopedia' },
  { pattern: /mudcat/i, genre: 'Folk', reason: 'Mudcat' },
  { pattern: /ultimate-guitar|e-chords|cifraclub|azchords|chordify/i, genre: 'Pop', reason: 'chord chart site' },
];

const RHYTHM_GENRE_RULES = {
  strathspey: { genre: 'Scottish Traditional', reason: 'strathspey tune type' },
  reel: { genre: 'Irish Traditional', reason: 'reel tune type' },
  jig: { genre: 'Irish Traditional', reason: 'jig tune type' },
  'slip jig': { genre: 'Irish Traditional', reason: 'slip jig tune type' },
  hornpipe: { genre: 'Irish Traditional', reason: 'hornpipe tune type' },
  barndance: { genre: 'Irish Traditional', reason: 'barndance tune type' },
  slide: { genre: 'Irish Traditional', reason: 'slide tune type' },
  polka: { genre: 'Folk', reason: 'polka tune type' },
  mazurka: { genre: 'Folk', reason: 'mazurka tune type' },
  waltz: { genre: 'Folk', reason: 'waltz tune type' },
  'three-two': { genre: 'English Folk', reason: 'three-two tune type' },
};

const BACKGROUND_GENRE_PHRASES = [
  { pattern: /\birish traditional\b/i, genre: 'Irish Traditional' },
  { pattern: /\bscottish traditional\b/i, genre: 'Scottish Traditional' },
  { pattern: /\bcape breton\b/i, genre: 'Cape Breton' },
  { pattern: /\btraditional bluegrass\b/i, genre: 'Traditional Bluegrass' },
  { pattern: /\bprogressive bluegrass\b/i, genre: 'Progressive Bluegrass' },
  { pattern: /\bbluegrass\b/i, genre: 'Bluegrass' },
  { pattern: /\bold[- ]time\b/i, genre: 'Old-Time' },
  { pattern: /\bappalachian\b/i, genre: 'Appalachian' },
  { pattern: /\bceltic\b/i, genre: 'Celtic' },
  { pattern: /\bcountry blues\b/i, genre: 'Country Blues' },
  { pattern: /\bfolk rock\b/i, genre: 'Folk Rock' },
  { pattern: /\bcontemporary folk\b/i, genre: 'Contemporary Folk' },
  { pattern: /\btraditional folk\b/i, genre: 'Traditional Folk' },
  { pattern: /\bindie folk\b/i, genre: 'Indie Folk' },
  { pattern: /\bgypsy jazz\b/i, genre: 'Gypsy Jazz' },
  { pattern: /\bsmooth jazz\b/i, genre: 'Smooth Jazz' },
  { pattern: /\bjazz fusion\b/i, genre: 'Jazz Fusion' },
  { pattern: /\bsea shanty\b/i, genre: 'Sea Shanty' },
  { pattern: /\bwestern swing\b/i, genre: 'Western Swing' },
  { pattern: /\bworld music\b/i, genre: 'World Music' },
  { pattern: /\bsinger-songwriter\b/i, genre: 'Singer-Songwriter' },
  { pattern: /\bfolk\b/i, genre: 'Folk' },
  { pattern: /\bjazz\b/i, genre: 'Jazz' },
  { pattern: /\bblues\b/i, genre: 'Blues' },
  { pattern: /\bcountry\b/i, genre: 'Country' },
  { pattern: /\bgospel\b/i, genre: 'Gospel' },
  { pattern: /\bclassical\b/i, genre: 'Classical' },
  { pattern: /\brock\b/i, genre: 'Rock' },
  { pattern: /\bpop\b/i, genre: 'Pop' },
  { pattern: /\bsoul\b/i, genre: 'Soul' },
  { pattern: /\br&b\b/i, genre: 'R&B' },
];

let canonicalGenreLookup = null;

function getCanonicalGenreLookup() {
  if (!canonicalGenreLookup) {
    canonicalGenreLookup = {};
    getMusicGenreList().forEach(function(genre) {
      canonicalGenreLookup[genre.toLowerCase()] = genre;
    });
  }
  return canonicalGenreLookup;
}

export function normalizeInferredGenre(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  const canonical = getCanonicalGenreLookup()[trimmed.toLowerCase()];
  return canonical || trimmed;
}

export function extractGenreFromAbc(abc) {
  if (!abc || typeof abc !== 'string') return '';
  const matches = abc.match(/^G:\s*(.+)$/gm);
  if (!matches || matches.length === 0) return '';
  const genres = matches.map(function(line) {
    return normalizeInferredGenre(line.replace(/^G:\s*/, ''));
  }).filter(Boolean);
  return genres.join(', ');
}

export function extractGenreFromTuneMeta(tuneMeta) {
  if (!tuneMeta || typeof tuneMeta !== 'object') return '';
  if (Array.isArray(tuneMeta.genres) && tuneMeta.genres.length > 0) {
    return tuneMeta.genres.map(function(genre) {
      return normalizeInferredGenre(genre);
    }).filter(Boolean).join(', ');
  }
  if (tuneMeta.genre) return normalizeInferredGenre(tuneMeta.genre);
  if (tuneMeta.meta && tuneMeta.meta.G) {
    const rawList = Array.isArray(tuneMeta.meta.G) ? tuneMeta.meta.G : [tuneMeta.meta.G];
    return rawList.map(function(raw) {
      return normalizeInferredGenre(raw);
    }).filter(Boolean).join(', ');
  }
  return '';
}

function genreFromSource(source, sourceUrl) {
  const haystack = [source, sourceUrl].filter(Boolean).join(' ');
  if (!haystack) return null;
  for (let i = 0; i < SOURCE_GENRE_RULES.length; i += 1) {
    const rule = SOURCE_GENRE_RULES[i];
    if (rule.pattern.test(haystack)) {
      return { genre: rule.genre, reason: rule.reason };
    }
  }
  return null;
}

function genreFromRhythm(rhythm) {
  const key = String(rhythm || '').trim().toLowerCase();
  if (!key || !RHYTHM_GENRE_RULES[key]) return null;
  const rule = RHYTHM_GENRE_RULES[key];
  return { genre: rule.genre, reason: rule.reason };
}

function genreFromBackgroundText(text) {
  const body = String(text || '');
  if (!body.trim()) return null;
  for (let i = 0; i < BACKGROUND_GENRE_PHRASES.length; i += 1) {
    const rule = BACKGROUND_GENRE_PHRASES[i];
    if (rule.pattern.test(body)) {
      return { genre: rule.genre, reason: 'background research' };
    }
  }
  return null;
}

function genreFromKnownListText(text) {
  const body = String(text || '').toLowerCase();
  if (!body.trim()) return null;
  const genres = getMusicGenreList().slice().sort(function(a, b) {
    return b.length - a.length;
  });
  for (let i = 0; i < genres.length; i += 1) {
    const genre = genres[i];
    const pattern = new RegExp('\\b' + genre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    if (pattern.test(body)) {
      return { genre: genre, reason: 'matched genre name in text' };
    }
  }
  return null;
}

export function inferGenreFromSearchContext(context) {
  const input = context || {};

  if (input.genre) {
    const genre = normalizeInferredGenre(input.genre);
    if (genre) return { genre: genre, reason: 'search result' };
  }

  const tuneMetaGenre = extractGenreFromTuneMeta(input.tuneMeta);
  if (tuneMetaGenre) {
    return { genre: tuneMetaGenre, reason: 'imported metadata' };
  }

  const abcGenre = extractGenreFromAbc(input.abc);
  if (abcGenre) {
    return { genre: abcGenre, reason: 'ABC G: header' };
  }

  const fromSource = genreFromSource(input.source, input.sourceUrl);
  if (fromSource) return fromSource;

  const fromBackground = genreFromBackgroundText(input.backgroundText);
  if (fromBackground) return fromBackground;

  const fromRhythm = genreFromRhythm(input.rhythm);
  if (fromRhythm) return fromRhythm;

  const fromText = genreFromKnownListText(input.backgroundText);
  if (fromText) return fromText;

  return null;
}

export function shouldOfferGenreSuggestion(suggestedGenre, currentGenres) {
  const next = normalizeInferredGenre(suggestedGenre);
  if (!next) return false;
  const currentList = Array.isArray(currentGenres)
    ? currentGenres
    : (currentGenres ? [currentGenres] : []);
  if (currentList.length === 0) return true;
  const nextKey = next.toLowerCase();
  return !currentList.some(function(genre) {
    const normalized = normalizeInferredGenre(genre);
    return normalized && normalized.toLowerCase() === nextKey;
  });
}

export function buildGenreSearchContext(result, extras) {
  const base = result || {};
  const options = extras || {};
  return {
    title: base.title || options.title || '',
    artist: base.artist || options.artist || '',
    source: base.source || options.source || '',
    sourceUrl: base.sourceUrl || options.sourceUrl || '',
    rhythm: options.rhythm || '',
    tuneMeta: base.tuneMeta || options.tuneMeta || null,
    abc: base.abc || options.abc || '',
    backgroundText: base.text || options.backgroundText || '',
    genre: base.genre || options.genre || '',
  };
}
