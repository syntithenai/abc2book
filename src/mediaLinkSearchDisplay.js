export function isMusicCollectionResult(item) {
  return !!(item && item.source === 'music-collection');
}

export function isBandcampResult(item) {
  return !!(item && item.source === 'bandcamp');
}

export function isInternetArchiveResult(item) {
  return !!(item && item.source === 'internet-archive');
}

export function isEuropeanaResult(item) {
  return !!(item && item.source === 'europeana');
}

export function isLocAudioResult(item) {
  return !!(item && item.source === 'loc');
}

export function mediaSearchResultArtist(item) {
  if (!item) return '';
  return String(item.artist || '').trim();
}

export function mediaSearchResultRelativePath(item) {
  if (!item) return '';
  return String(item.path || item.relativePath || '').trim();
}

// Bootstrap `.small` is 0.875em; collection paths use half that.
export const mediaSearchPathStyle = {
  fontSize: '0.4375em',
  lineHeight: 1.2,
};
