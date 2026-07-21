export function parseNdjsonLine(line) {
  const trimmed = String(line || '').trim()
  if (!trimmed || trimmed.charAt(0) !== '{') return null
  try {
    return JSON.parse(trimmed)
  } catch (e) {
    return null
  }
}
