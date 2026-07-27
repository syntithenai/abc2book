/**
 * Detect Internet Archive URLs (https://archive.org/...).
 */
export function isArchiveOrgLinkUri(uri) {
  if (!uri || typeof uri !== 'string') return false;
  try {
    const parsed = new URL(uri.trim());
    if (parsed.protocol !== 'https:') return false;
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
