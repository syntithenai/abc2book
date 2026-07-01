const GENERIC_ARTIST_KEYS = new Set([
  '',
  'traditional',
  'trad',
  'anonymous',
  'unknown',
  'folk',
  'publicdomain',
  'various',
  'na',
  'composerunknown',
]);

export function normalizeArtistKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function isGenericArtist(artist) {
  const key = normalizeArtistKey(artist);
  if (GENERIC_ARTIST_KEYS.has(key)) return true;
  return key.indexOf('trad') === 0;
}
