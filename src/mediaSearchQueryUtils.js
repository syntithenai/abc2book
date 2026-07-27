const TITLE_SPLIT_STOP_WORDS = new Set([
  'a', 'an', 'and', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to', 'with',
  'after', 'before', 'upon', 'into', 'over', 'under',
]);

/**
 * Guess artist + title from a single search box query such as
 * "elvis presley love me" without splitting folk tune titles like
 * "after the battle of aughrim".
 */
export function inferTitleArtistFromQuery(query) {
  const text = String(query || '').trim();
  if (!text) {
    return { query: '', title: '', artist: '' };
  }

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 4) {
    return { query: text, title: text, artist: '' };
  }

  const lastTwo = words.slice(-2);
  const lastTwoHasStopWord = lastTwo.some(function(word) {
    return TITLE_SPLIT_STOP_WORDS.has(word.toLowerCase());
  });

  if (lastTwoHasStopWord) {
    return { query: text, title: text, artist: '' };
  }

  return {
    query: text,
    title: lastTwo.join(' '),
    artist: words.slice(0, -2).join(' '),
  };
}
