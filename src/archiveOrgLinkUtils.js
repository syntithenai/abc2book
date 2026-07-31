/**
 * Detect Internet Archive URLs (https://archive.org/...).
 */
export function isArchiveOrgLinkUri(uri) {
  if (!uri || typeof uri !== 'string') return false;
  try {
    const parsed = new URL(uri.trim());
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    return host === 'archive.org';
  } catch (e) {
    return false;
  }
}

export function isArchiveOrgDirectDownloadUri(uri) {
  if (!isArchiveOrgLinkUri(uri)) return false;
  try {
    return new URL(uri.trim()).pathname.toLowerCase().startsWith('/download/');
  } catch (e) {
    return false;
  }
}

export function extractArchiveIdentifier(uri) {
  const src = String(uri || '').trim();
  if (!src) return '';
  try {
    const parts = new URL(src).pathname.split('/').filter(Boolean);
    if (!parts.length) return '';
    if (parts[0] === 'details' || parts[0] === 'download' || parts[0] === 'metadata') {
      return parts[1] || '';
    }
    return parts[0];
  } catch (e) {
    return '';
  }
}

export function archiveArtworkUrlFromUri(uri) {
  const identifier = extractArchiveIdentifier(uri);
  if (!identifier) return '';
  return 'https://archive.org/services/img/' + identifier;
}
