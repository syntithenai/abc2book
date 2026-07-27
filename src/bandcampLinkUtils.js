/**
 * Detect Bandcamp track/album URLs (https://*.bandcamp.com/...).
 */
export function isBandcampLinkUri(uri) {
  const src = String(uri || '').trim();
  if (!src || !/^https:\/\//i.test(src)) return false;
  try {
    const host = new URL(src).hostname.toLowerCase().replace(/^www\./, '');
    return host === 'bandcamp.com' || host.endsWith('.bandcamp.com');
  } catch (e) {
    return false;
  }
}
