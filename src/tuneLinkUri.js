import { isBandcampLinkUri, repairBandcampLinkUri } from './bandcampLinkUtils';

export function linkUriFromValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    return isBandcampLinkUri(value) ? repairBandcampLinkUri(value) : value;
  }
  if (typeof value === 'object' && value && value.link != null) {
    return linkUriFromValue(value.link);
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export function linkUriString(link) {
  if (!link) return '';
  return linkUriFromValue(link.link);
}
