export const TEMPO_RANGES = [
  { min: 0, max: 59, label: 'Under 60 (Very slow)' },
  { min: 60, max: 79, label: '60–79 (Slow)' },
  { min: 80, max: 99, label: '80–99 (Moderate)' },
  { min: 100, max: 119, label: '100–119 (Medium)' },
  { min: 120, max: 139, label: '120–139 (Allegro)' },
  { min: 140, max: 159, label: '140–159 (Fast)' },
  { min: 160, max: Infinity, label: '160+ (Very fast)' },
]

export function parseTempoBpm(tempo) {
  if (tempo == null) return 0
  var str = String(tempo).trim()
  if (!str) return 0
  var parts = str.split('=')
  var n = parseInt(parts[parts.length - 1], 10)
  return n > 0 ? n : 0
}

export function tempoRangeLabel(bpm) {
  if (!bpm || bpm <= 0) return ''
  for (var i = 0; i < TEMPO_RANGES.length; i++) {
    var range = TEMPO_RANGES[i]
    if (bpm >= range.min && bpm <= range.max) return range.label
  }
  return ''
}

export function tempoRangeSortKey(label) {
  if (!label) return -1
  var n = parseInt(label, 10)
  return isNaN(n) ? 0 : n
}
