/**
 * Detect Library of Congress URLs (https://www.loc.gov/...).
 */
export function isLocGovLinkUri(uri) {
  if (!uri || typeof uri !== 'string') return false;
  try {
    const parsed = new URL(uri.trim());
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    return host === 'loc.gov';
  } catch (e) {
    return false;
  }
}
