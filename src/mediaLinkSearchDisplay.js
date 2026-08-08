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

export function isYoutubeResult(item) {
  return !!(item && item.source === 'youtube');
}

export function isWebMediaSearchResult(item) {
  return isBandcampResult(item)
    || isInternetArchiveResult(item)
    || isLocAudioResult(item)
    || isYoutubeResult(item);
}

export function isDeviceFileResult(item) {
  return !!(item && item.source === 'device-file');
}

export function mediaSearchSourceLabel(source) {
  if (source === 'music-collection') return 'My library';
  if (source === 'device-file') return 'Device';
  if (source === 'bandcamp') return 'Bandcamp';
  if (source === 'internet-archive') return 'Internet Archive';
  if (source === 'europeana') return 'Europeana';
  if (source === 'loc') return 'Library of Congress';
  if (source === 'youtube') return 'YouTube';
  return source || '';
}

export function mediaSearchResultArtist(item) {
  if (!item) return '';
  return String(item.artist || '').trim();
}

function isUnknownMediaLabel(value) {
  const text = String(value || '').trim().toLowerCase();
  return !text || text === '<unknown>' || text === 'unknown';
}

function mediaFilenameBase(item) {
  if (!item) return '';
  const path = String(item.path || item.displayName || item.title || '').trim();
  if (!path) return '';
  const base = path.split('/').pop() || path;
  return base.replace(/\.[^.]+$/, '').trim();
}

function parseArtistTitleFromFilename(name) {
  const text = String(name || '').trim();
  if (!text) return { artist: '', title: '' };
  const dash = text.match(/^(.+?)\s+-\s+(.+)$/);
  if (dash) {
    return { artist: dash[1].trim(), title: dash[2].trim() };
  }
  return { artist: '', title: text };
}

export function mediaSearchResultDisplayTitle(item) {
  const tagged = String(item && item.title || '').trim();
  if (!isUnknownMediaLabel(tagged)) return tagged;
  const parsed = parseArtistTitleFromFilename(mediaFilenameBase(item));
  return parsed.title || 'Track';
}

export function mediaSearchResultDisplayArtist(item) {
  const tagged = mediaSearchResultArtist(item);
  if (!isUnknownMediaLabel(tagged)) return tagged;
  const parsed = parseArtistTitleFromFilename(mediaFilenameBase(item));
  return parsed.artist || '';
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
