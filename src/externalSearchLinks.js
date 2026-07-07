export function buildExternalSearchUrl(kind, title, artist) {
  const queryParts = [title, artist].filter(Boolean);
  const q = encodeURIComponent(queryParts.join(' '));
  switch (kind) {
    case 'lyrics':
      return 'https://www.google.com/search?q=' + q + '+lyrics';
    case 'chords':
      return 'https://www.google.com/search?q=' + q + '+chords';
    case 'notation':
      return 'https://www.google.com/search?q=' + q + '+abc+notation+sheet+music';
    case 'youtube':
      return 'https://www.youtube.com/results?search_query=' + q;
    case 'background':
      return 'https://www.google.com/search?q=' + q + '+song+history+background';
    default:
      return 'https://www.google.com/search?q=' + q;
  }
}

export function openExternalSearch(kind, title, artist) {
  const url = buildExternalSearchUrl(kind, title, artist);
  window.open(url, '_blank', 'noopener,noreferrer');
}

export const EXTERNAL_SEARCH_KINDS = [
  { key: 'lyrics', label: 'Search lyrics' },
  { key: 'chords', label: 'Search chords' },
  { key: 'notation', label: 'Search notation' },
  { key: 'youtube', label: 'Search YouTube' },
  { key: 'background', label: 'Search background' },
];
