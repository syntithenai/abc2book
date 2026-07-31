export function linkUriFromValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value && value.link != null) return String(value.link);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export function linkUriString(link) {
  if (!link) return '';
  return linkUriFromValue(link.link);
}
