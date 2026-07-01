const URL_PATTERN = /(https?:\/\/[^\s<>"')\]]+)/g;

export function linkifyBackgroundInfo(text) {
  if (!text || typeof text !== 'string') return [];
  const parts = text.split(URL_PATTERN);
  return parts.map(function(part, index) {
    if (/^https?:\/\//.test(part)) {
      return { type: 'link', href: part, key: 'link-' + index };
    }
    return { type: 'text', value: part, key: 'text-' + index };
  });
}
