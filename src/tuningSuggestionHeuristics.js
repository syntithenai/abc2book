import { resolvePresetFromTuneName } from './tuningPresetResolver.js'

const IRISH_RHYTHMS = /jig|reel|hornpipe|slip\s*jig|polka|slide/i
const OLD_TIME_TAGS = /old[\s-]?time|appalachian|mountain|fiddle/i
const IRISH_TAGS = /irish|celtic|session|trad/i

export function suggestTuningFromMetadata(metadata) {
  if (!metadata) return null

  const name = metadata.name || ''
  const tags = Array.isArray(metadata.tags) ? metadata.tags.join(' ') : (metadata.tags || '')
  const rhythm = metadata.rhythm || ''
  const key = metadata.key || ''
  const combined = [name, tags, rhythm, key].join(' ').toLowerCase()

  const fromTuneName = resolvePresetFromTuneName(name)
  if (fromTuneName) {
    return {
      instrument: fromTuneName.instrument,
      presetId: fromTuneName.presetId,
      preset: fromTuneName.preset,
      reason: 'This tune is often played in ' + fromTuneName.preset.label + ' tuning.',
      source: 'tune-name'
    }
  }

  const isOldTime = OLD_TIME_TAGS.test(combined) || /rag|breakdown|hoedown/i.test(combined)
  const isIrish = IRISH_TAGS.test(combined) || IRISH_RHYTHMS.test(rhythm) || IRISH_RHYTHMS.test(combined)

  if (isOldTime && !isIrish) {
    return {
      instrument: 'mandolin',
      presetId: 'aeae',
      reason: 'Old-time / Appalachian tunes often use AEAE (cross A) fiddle tuning.',
      source: 'old-time'
    }
  }

  if (isIrish) {
  // Prefer bouzouki GDAD for accompaniment; mention fiddle too
    return {
      instrument: 'bouzouki',
      presetId: 'gdad',
      reason: 'Irish session tunes are often accompanied on bouzouki in GDAD or fiddle/mandolin in GDAE.',
      source: 'irish',
      alternate: { instrument: 'mandolin', presetId: 'gdae' }
    }
  }

  return null
}

export function tuningSuggestionTunerUrl(suggestion, tuneId) {
  if (!suggestion) return '/tuner'
  let url = '/tuner?instrument=' + encodeURIComponent(suggestion.instrument)
    + '&tuning=' + encodeURIComponent(suggestion.presetId)
  if (tuneId) url += '&tuneId=' + encodeURIComponent(tuneId)
  return url
}
