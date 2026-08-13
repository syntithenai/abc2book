import {
  DEFAULT_CHORD_READINESS_CLEANUP_SETTINGS,
  CHORD_READINESS_CLEANUP_SETTINGS_STORAGE_KEY,
  loadChordReadinessCleanupSettings,
  resolveCleanupBook,
  saveChordReadinessCleanupSettings,
} from './chordReadinessCleanupSettings'

describe('chordReadinessCleanupSettings', function() {
  beforeEach(function() {
    localStorage.removeItem(CHORD_READINESS_CLEANUP_SETTINGS_STORAGE_KEY)
  })

  test('load returns defaults when nothing saved', function() {
    expect(loadChordReadinessCleanupSettings()).toEqual(DEFAULT_CHORD_READINESS_CLEANUP_SETTINGS)
  })

  test('save and load round-trip', function() {
    saveChordReadinessCleanupSettings({
      book: 'songs',
      batchLimit: 50,
      dryRun: false,
      includeMelody: true,
      alwaysTag: true,
    })
    expect(loadChordReadinessCleanupSettings()).toEqual({
      book: 'songs',
      batchLimit: 50,
      dryRun: false,
      includeMelody: true,
      alwaysTag: true,
    })
  })

  test('resolveCleanupBook keeps saved book when valid', function() {
    expect(resolveCleanupBook('songs', ['songs', 'tunes'], '')).toBe('songs')
  })

  test('resolveCleanupBook falls back when saved book missing', function() {
    expect(resolveCleanupBook('deleted', ['songs'], 'songs')).toBe('songs')
    expect(resolveCleanupBook('', ['songs'], 'songs')).toBe('songs')
  })

  test('clamps batch limit', function() {
    saveChordReadinessCleanupSettings({ batchLimit: 9999 })
    expect(loadChordReadinessCleanupSettings().batchLimit).toBe(500)
  })
})
