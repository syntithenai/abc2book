export function formatTuneDisplayName(name, fallback) {
  const useFallback = fallback != null ? fallback : 'Untitled Song'
  const trimmed = String(name ?? '').trim()
  return trimmed.length > 0 ? trimmed : useFallback
}
