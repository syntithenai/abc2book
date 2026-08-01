import localforage from 'localforage'
import {
  createRhythmConfig,
  normalizeDrumPattern,
  normalizeRhythmConfig,
  ENGINE_MODE_DRUMS,
  drumPatternsEqual,
} from './rhythmEngineTypes'
import { PRESET_CATEGORY_MY_PATTERNS } from './drumPatternPresets'
import { slotsPerBar } from './metronomeRhythmPresets'

const store = localforage.createInstance({
  name: 'abcbook',
  storeName: 'userDrumPresets',
})

const STORAGE_KEY = 'presets'

let cache = null
let loadPromise = null

export function isUserDrumPresetId(presetId) {
  return typeof presetId === 'string' && presetId.indexOf('user-') === 0
}

function newUserId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return 'user-' + crypto.randomUUID()
  }
  return 'user-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9)
}

function normalizeUserPreset(raw) {
  if (!raw || !raw.id || !raw.label) return null
  const slotCount = slotsPerBar({
    beatsPerBar: raw.beatsPerBar,
    pulsesPerBeat: raw.pulsesPerBeat,
  })
  return {
    id: raw.id,
    label: String(raw.label).trim(),
    category: PRESET_CATEGORY_MY_PATTERNS,
    engineMode: ENGINE_MODE_DRUMS,
    beatsPerBar: raw.beatsPerBar,
    accents: raw.accents,
    pulsesPerBeat: raw.pulsesPerBeat,
    swing: raw.swing || 0,
    drumPattern: normalizeDrumPattern(raw.drumPattern, slotCount),
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
  }
}

async function readAllFromStorage() {
  const raw = await store.getItem(STORAGE_KEY)
  if (!Array.isArray(raw)) return []
  return raw.map(normalizeUserPreset).filter(Boolean)
}

async function writeAllToStorage(presets) {
  await store.setItem(STORAGE_KEY, presets)
  cache = presets.slice()
}

export async function loadUserDrumPresets() {
  if (cache) return cache.slice()
  if (loadPromise) return loadPromise.then(function(list) { return list.slice() })
  loadPromise = readAllFromStorage().then(function(list) {
    cache = list
    loadPromise = null
    return list.slice()
  })
  return loadPromise
}

export function getCachedUserDrumPresets() {
  return cache ? cache.slice() : []
}

export function setUserDrumPresetsCache(presets) {
  cache = Array.isArray(presets) ? presets.slice() : []
}

export function invalidateUserDrumPresetsCache() {
  cache = null
  loadPromise = null
}

function uniqueLabel(label, existing) {
  const base = String(label || '').trim() || 'My pattern'
  const labels = existing.map(function(p) { return p.label.toLowerCase() })
  if (!labels.includes(base.toLowerCase())) return base
  let n = 2
  while (labels.includes((base + ' (' + n + ')').toLowerCase())) n++
  return base + ' (' + n + ')'
}

export async function saveUserDrumPreset(options) {
  const opts = options || {}
  const rhythm = normalizeRhythmConfig(opts.rhythm)
  if (rhythm.engineMode !== ENGINE_MODE_DRUMS || !rhythm.drumPattern) {
    throw new Error('Drum pattern required to save')
  }
  const all = await loadUserDrumPresets()
  const now = new Date().toISOString()
  const slotCount = slotsPerBar(rhythm)
  const preset = normalizeUserPreset({
    id: opts.id || newUserId(),
    label: uniqueLabel(opts.label, all.filter(function(p) { return p.id !== opts.id })),
    beatsPerBar: rhythm.beatsPerBar,
    accents: rhythm.accents,
    pulsesPerBeat: rhythm.pulsesPerBeat,
    swing: rhythm.drumPattern.swing,
    drumPattern: normalizeDrumPattern(rhythm.drumPattern, slotCount),
    createdAt: opts.id ? (all.find(function(p) { return p.id === opts.id }) || {}).createdAt : now,
    updatedAt: now,
  })
  const next = opts.id
    ? all.map(function(p) { return p.id === opts.id ? preset : p })
    : all.concat([preset])
  await writeAllToStorage(next)
  return preset
}

export async function updateUserDrumPreset(id, updates) {
  const all = await loadUserDrumPresets()
  const existing = all.find(function(p) { return p.id === id })
  if (!existing) return null
  const preset = normalizeUserPreset(Object.assign({}, existing, updates || {}, {
    id: id,
    label: updates && updates.label
      ? uniqueLabel(updates.label, all.filter(function(p) { return p.id !== id }))
      : existing.label,
    updatedAt: new Date().toISOString(),
  }))
  const next = all.map(function(p) { return p.id === id ? preset : p })
  await writeAllToStorage(next)
  return preset
}

export async function deleteUserDrumPreset(id) {
  const all = await loadUserDrumPresets()
  const next = all.filter(function(p) { return p.id !== id })
  await writeAllToStorage(next)
}

export function userDrumPresetToRhythm(preset) {
  const normalized = normalizeUserPreset(preset)
  if (!normalized) return createRhythmConfig(4)
  return createRhythmConfig(
    normalized.beatsPerBar,
    normalized.accents,
    normalized.pulsesPerBeat,
    {
      engineMode: ENGINE_MODE_DRUMS,
      presetId: normalized.id,
      drumPattern: normalized.drumPattern,
    }
  )
}

export function findUserDrumPresetById(presetId) {
  if (!isUserDrumPresetId(presetId) || !cache) return null
  return cache.find(function(p) { return p.id === presetId }) || null
}

export function userDrumPresetIdForRhythm(rhythm, userPresets) {
  const normalized = normalizeRhythmConfig(rhythm)
  if (!normalized.drumPattern || normalized.engineMode !== ENGINE_MODE_DRUMS) return ''
  if (isUserDrumPresetId(normalized.presetId)) {
    const found = (userPresets || cache || []).find(function(p) { return p.id === normalized.presetId })
    if (found) return normalized.presetId
  }
  const list = userPresets || cache || []
  const match = list.find(function(preset) {
    const applied = userDrumPresetToRhythm(preset)
    return applied.beatsPerBar === normalized.beatsPerBar
      && JSON.stringify(applied.pulsesPerBeat) === JSON.stringify(normalized.pulsesPerBeat)
      && drumPatternsEqual(applied.drumPattern, normalized.drumPattern)
  })
  return match ? match.id : ''
}
