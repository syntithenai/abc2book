import { getMusicGenreSelectOptions } from './musicGenreOptions'

export const BULK_EDIT_FIELDS = [
  { key: 'key', label: 'Key', type: 'text', allowEmpty: true },
  { key: 'tuning', label: 'Tuning', type: 'text', allowEmpty: true },
  { key: 'meter', label: 'Time Signature', type: 'meter', allowEmpty: true },
  { key: 'tempo', label: 'Tempo', type: 'number', min: 1, allowEmpty: true },
  { key: 'boost', label: 'Confidence', type: 'number', min: 0, max: 20, allowEmpty: true },
  { key: 'difficulty', label: 'Difficulty', type: 'number', min: 0, max: 20, allowEmpty: true },
  { key: 'rhythm', label: 'Rhythm', type: 'rhythm', allowEmpty: true },
  { key: 'composer', label: 'Artist', type: 'text', allowEmpty: true },
  { key: 'genre', label: 'Genre', type: 'genre', allowEmpty: true },
  { key: 'transpose', label: 'Transpose', type: 'number', allowEmpty: true },
  { key: 'capo', label: 'Capo', type: 'number', min: 0, max: 12, allowEmpty: true },
  { key: 'repeats', label: 'Repeats', type: 'number', min: 1, allowEmpty: true },
  {
    key: 'noteLength',
    label: 'ABC Note Length',
    type: 'select',
    allowEmpty: true,
    options: ['1', '1/2', '1/3', '1/4', '1/6', '1/8', '1/12', '1/16'],
  },
  {
    key: 'tablature',
    label: 'Tablature',
    type: 'select',
    allowEmpty: true,
    options: [
      { value: '', label: '(none)' },
      { value: 'guitar', label: 'Guitar' },
      { value: 'violin', label: 'Violin' },
    ],
  },
  {
    key: 'soundFonts',
    label: 'Sound Fonts',
    type: 'select',
    allowEmpty: true,
    options: [
      { value: '', label: 'Local (piano)' },
      { value: 'online', label: 'Online' },
    ],
  },
  { key: 'srcUrl', label: 'Source URL', type: 'text', allowEmpty: true },
  {
    key: 'suitableForPractice',
    label: 'Suitable for practice',
    type: 'select',
    allowEmpty: false,
    options: [
      { value: 'true', label: 'Yes — include in practice' },
      { value: 'false', label: 'No — exclude from practice' },
    ],
  },
]

export function getBulkEditField(fieldKey) {
  return BULK_EDIT_FIELDS.find(function(field) { return field.key === fieldKey }) || null
}

export function isBulkChangeRowComplete(row) {
  if (!row || !row.field) return false
  var field = getBulkEditField(row.field)
  if (!field) return false
  if (row.value === '' || row.value === null || row.value === undefined) {
    return !!field.allowEmpty
  }
  return true
}

export function coerceBulkFieldValue(fieldKey, rawValue) {
  var field = getBulkEditField(fieldKey)
  if (!field) return rawValue

  if (rawValue === '' || rawValue === null || rawValue === undefined) {
    if (field.type === 'number' && field.key === 'capo') return 0
    return ''
  }

  if (field.type === 'number') {
    var parsed = parseInt(String(rawValue), 10)
    if (!Number.isFinite(parsed)) return String(rawValue).trim()
    if (field.min !== undefined && parsed < field.min) parsed = field.min
    if (field.max !== undefined && parsed > field.max) parsed = field.max
    return String(parsed)
  }

  if (field.key === 'suitableForPractice') {
    return rawValue === false || rawValue === 'false' ? false : true
  }

  return String(rawValue).trim()
}

export function prepareBulkChanges(rows) {
  if (!Array.isArray(rows)) return []

  var byField = {}
  rows.forEach(function(row) {
    if (!isBulkChangeRowComplete(row)) return
    byField[row.field] = {
      key: row.field,
      value: coerceBulkFieldValue(row.field, row.value),
    }
  })

  return Object.keys(byField).map(function(fieldKey) {
    return byField[fieldKey]
  })
}

export function getBulkEditSelectOptions(field, tunebook) {
  if (!field) return []

  if (field.type === 'select' && Array.isArray(field.options)) {
    return field.options.map(function(option) {
      if (typeof option === 'string') {
        return { value: option, label: option }
      }
      return option
    })
  }

  if (field.type === 'meter' && tunebook && tunebook.abcTools) {
    return tunebook.abcTools.getTimeSignatureTypes().map(function(option) {
      return { value: option, label: option }
    })
  }

  if (field.type === 'rhythm' && tunebook && tunebook.abcTools) {
    return Object.keys(tunebook.abcTools.getRhythmTypes()).map(function(option) {
      return { value: option, label: option }
    })
  }

  if (field.type === 'genre') {
    return getMusicGenreSelectOptions()
  }

  return []
}
