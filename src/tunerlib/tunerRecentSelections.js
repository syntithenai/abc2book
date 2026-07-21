import {
  CHROMATIC_INSTRUMENT,
  TUNER_INSTRUMENT_LABELS,
  isChromaticInstrument,
  isValidTunerInstrumentSelection,
  getPreset,
  defaultPresetForInstrument
} from '../instrumentTuningPresets'

export const LS_RECENT_TUNER_SELECTIONS = 'bookstorage_tuner_recent_selections'
export const MAX_RECENT_TUNER_SELECTIONS = 5

function isValidEntry(entry) {
  return entry
    && isValidTunerInstrumentSelection(entry.instrument)
    && typeof entry.presetId === 'string'
}

export function tunerSelectionKey(instrument, presetId) {
  return String(instrument) + '\0' + String(presetId || '')
}

export function normalizeTunerSelection(instrument, presetId) {
  if (!isValidTunerInstrumentSelection(instrument)) return null
  if (isChromaticInstrument(instrument)) {
    return { instrument: CHROMATIC_INSTRUMENT, presetId: '' }
  }
  const id = presetId || (defaultPresetForInstrument(instrument) || {}).id || ''
  if (!id) return null
  return { instrument: instrument, presetId: id }
}

export function readRecentTunerSelections() {
  try {
    const raw = localStorage.getItem(LS_RECENT_TUNER_SELECTIONS)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(function(entry) {
        return normalizeTunerSelection(entry.instrument, entry.presetId)
      })
      .filter(Boolean)
      .slice(0, MAX_RECENT_TUNER_SELECTIONS)
  } catch (err) {
    return []
  }
}

export function pushRecentTunerSelection(instrument, presetId) {
  const entry = normalizeTunerSelection(instrument, presetId)
  if (!entry) return readRecentTunerSelections()

  const key = tunerSelectionKey(entry.instrument, entry.presetId)
  const next = [entry].concat(
    readRecentTunerSelections().filter(function(item) {
      return tunerSelectionKey(item.instrument, item.presetId) !== key
    })
  ).slice(0, MAX_RECENT_TUNER_SELECTIONS)

  localStorage.setItem(LS_RECENT_TUNER_SELECTIONS, JSON.stringify(next))
  return next
}

export function formatRecentTunerSelectionLabel(entry) {
  if (!entry) return ''
  const instrLabel = TUNER_INSTRUMENT_LABELS[entry.instrument] || entry.instrument
  if (isChromaticInstrument(entry.instrument)) return instrLabel
  const preset = getPreset(entry.instrument, entry.presetId)
  const tuningLabel = preset ? preset.label : entry.presetId
  return instrLabel + ' · ' + tuningLabel
}
