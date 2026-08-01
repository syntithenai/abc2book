const localforageData = {}

jest.mock('localforage', function() {
  const api = {
    createInstance: jest.fn(function() {
      return {
        setItem: jest.fn(function(key, value) {
          localforageData[key] = value
          return Promise.resolve(value)
        }),
        getItem: jest.fn(function(key) {
          return Promise.resolve(localforageData[key] || null)
        }),
        removeItem: jest.fn(function(key) {
          delete localforageData[key]
          return Promise.resolve()
        }),
      }
    }),
  }
  return {
    __esModule: true,
    default: api,
  }
})

import { applyRhythmPreset } from './drumPatternPresets'
import {
  loadUserDrumPresets,
  saveUserDrumPreset,
  deleteUserDrumPreset,
  invalidateUserDrumPresetsCache,
  isUserDrumPresetId,
  userDrumPresetToRhythm,
  userDrumPresetIdForRhythm,
  setUserDrumPresetsCache,
} from './userDrumPresets'

describe('userDrumPresets', function() {
  beforeEach(function() {
    Object.keys(localforageData).forEach(function(key) {
      delete localforageData[key]
    })
    invalidateUserDrumPresetsCache()
  })

  test('save/load/delete round-trip', async function() {
    const rhythm = applyRhythmPreset('rock-basic')
    const saved = await saveUserDrumPreset({ label: 'My reel kick', rhythm: rhythm })
    expect(isUserDrumPresetId(saved.id)).toBe(true)
    expect(saved.label).toBe('My reel kick')

    const loaded = await loadUserDrumPresets()
    expect(loaded).toHaveLength(1)
    expect(loaded[0].id).toBe(saved.id)

    await deleteUserDrumPreset(saved.id)
    const afterDelete = await loadUserDrumPresets()
    expect(afterDelete).toHaveLength(0)
  })

  test('dedupes labels with numeric suffix', async function() {
    const rhythm = applyRhythmPreset('rock-basic')
    await saveUserDrumPreset({ label: 'Groove', rhythm: rhythm })
    const second = await saveUserDrumPreset({ label: 'Groove', rhythm: rhythm })
    expect(second.label).toBe('Groove (2)')
  })

  test('userDrumPresetToRhythm restores drum pattern', function() {
    const rhythm = applyRhythmPreset('rock-basic')
    const preset = {
      id: 'user-test-1',
      label: 'Test',
      beatsPerBar: rhythm.beatsPerBar,
      accents: rhythm.accents,
      pulsesPerBeat: rhythm.pulsesPerBeat,
      swing: rhythm.drumPattern.swing,
      drumPattern: rhythm.drumPattern,
    }
    const restored = userDrumPresetToRhythm(preset)
    expect(restored.presetId).toBe('user-test-1')
    expect(restored.drumPattern.resolution).toBe(rhythm.drumPattern.resolution)
  })

  test('userDrumPresetIdForRhythm recognizes saved pattern', function() {
    const rhythm = applyRhythmPreset('rock-basic')
    const preset = {
      id: 'user-test-2',
      label: 'Saved rock',
      beatsPerBar: rhythm.beatsPerBar,
      accents: rhythm.accents,
      pulsesPerBeat: rhythm.pulsesPerBeat,
      swing: rhythm.drumPattern.swing,
      drumPattern: rhythm.drumPattern,
      category: 'My patterns',
      engineMode: 'drums',
    }
    setUserDrumPresetsCache([preset])
    const id = userDrumPresetIdForRhythm(Object.assign({}, rhythm, { presetId: '' }))
    expect(id).toBe('user-test-2')
  })

  test('applyRhythmPreset resolves user preset from cache', function() {
    const rhythm = applyRhythmPreset('rock-basic')
    const preset = {
      id: 'user-test-3',
      label: 'Cached',
      beatsPerBar: rhythm.beatsPerBar,
      accents: rhythm.accents,
      pulsesPerBeat: rhythm.pulsesPerBeat,
      swing: rhythm.drumPattern.swing,
      drumPattern: rhythm.drumPattern,
      category: 'My patterns',
      engineMode: 'drums',
    }
    setUserDrumPresetsCache([preset])
    const applied = applyRhythmPreset('user-test-3')
    expect(applied.presetId).toBe('user-test-3')
    expect(applied.drumPattern.resolution).toBe(rhythm.drumPattern.resolution)
  })
})
