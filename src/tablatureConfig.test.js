import abcjs from 'abcjs'
import {
  pitchStringsToAbcTuning,
  buildAbcjsTablatureConfig,
  buildTablatureRenderOptions,
  isSupportedTablatureInstrument,
  resolveTuningPresetForTab,
  normalizeTablatureInstrument,
  normalizeTabDisplay,
  getTabDisplay,
  getTablatureSelection,
  getTablatureButtonLabel,
  getTablatureVoiceSettings,
  applyTablatureSelection,
  applyTablatureVoiceConfigs,
  disableTablature,
  isTablatureEnabled,
  parseTablatureVoices,
  parseCustomTuningToStrings,
  getTablatureTuningValidation,
  tablatureInstrumentSummary,
  shouldRenderTablature,
  shouldApplyTabOnlyDisplay,
  countActiveTabVoices,
} from './tablatureConfig'

describe('tablatureConfig', () => {
  describe('pitchStringsToAbcTuning', () => {
    it('converts guitar standard tuning', () => {
      expect(pitchStringsToAbcTuning(['E2', 'A2', 'D3', 'G3', 'B3', 'E4'], 'guitar')).toEqual([
        'E,', 'A,', 'D', 'G', 'B', 'e',
      ])
    })

    it('converts violin GDAE', () => {
      expect(pitchStringsToAbcTuning(['G3', 'D4', 'A4', 'E5'], 'violin')).toEqual([
        'G,', 'D', 'A', 'e',
      ])
    })

    it('converts uke GCEA high G ascending', () => {
      expect(pitchStringsToAbcTuning(['C4', 'E4', 'G4', 'A4'], 'uke')).toEqual([
        'C', 'E', 'G', 'A',
      ])
    })

    it('converts sharps in pitch strings', () => {
      expect(pitchStringsToAbcTuning(['F#3'])).toEqual(['^F,'])
    })
  })

  describe('normalizeTablatureInstrument', () => {
    it('maps legacy mandolin and fiddle to violin', () => {
      expect(normalizeTablatureInstrument('mandolin')).toBe('violin')
      expect(normalizeTablatureInstrument('fiddle')).toBe('violin')
      expect(normalizeTablatureInstrument('guitar')).toBe('guitar')
    })
  })

  describe('buildAbcjsTablatureConfig', () => {
    it('returns null for empty tablature', () => {
      expect(buildAbcjsTablatureConfig({ tablature: '' })).toBeNull()
      expect(buildAbcjsTablatureConfig({ tablature: 'viola' })).toBeNull()
    })

    it('builds guitar config with default tuning', () => {
      const cfg = buildAbcjsTablatureConfig({ tablature: 'guitar', tuning: '', capo: 0 })
      expect(cfg.instrument).toBe('guitar')
      expect(cfg.tuning).toEqual(['E,', 'A,', 'D', 'G', 'B', 'e'])
      expect(cfg.capo).toBe(0)
    })

    it('builds violin config', () => {
      const cfg = buildAbcjsTablatureConfig({ tablature: 'violin' })
      expect(cfg.instrument).toBe('violin')
      expect(cfg.tuning).toEqual(['G,', 'D', 'A', 'e'])
    })

    it('treats legacy mandolin as violin', () => {
      const cfg = buildAbcjsTablatureConfig({ tablature: 'mandolin' })
      expect(cfg.instrument).toBe('violin')
      expect(cfg.tuning).toEqual(['G,', 'D', 'A', 'e'])
    })

    it('builds uke config using mandolin engine', () => {
      const cfg = buildAbcjsTablatureConfig({ tablature: 'uke' })
      expect(cfg.instrument).toBe('mandolin')
      expect(cfg.tuning).toEqual(['C', 'E', 'G', 'A'])
    })

    it('builds banjo4 config', () => {
      const cfg = buildAbcjsTablatureConfig({ tablature: 'banjo4' })
      expect(cfg.instrument).toBe('mandolin')
      expect(cfg.tuning).toEqual(['C,', 'G', 'D', 'A'])
    })

    it('builds banjo5 config with ascending tuning', () => {
      const cfg = buildAbcjsTablatureConfig({ tablature: 'banjo5' })
      expect(cfg.instrument).toBe('fiveString')
      expect(cfg.tuning).toEqual(['D,', 'G,', 'B,', 'D', 'G'])
    })

    it('builds bouzouki config', () => {
      const cfg = buildAbcjsTablatureConfig({ tablature: 'bouzouki' })
      expect(cfg.instrument).toBe('mandolin')
      expect(cfg.tuning).toEqual(['G,,', 'D', 'A', 'D'])
    })

    it('resolves guitar DADGAD from tune tuning field', () => {
      const cfg = buildAbcjsTablatureConfig({
        tablature: 'guitar',
        tuning: 'DADGAD',
        capo: 2,
      })
      expect(cfg.instrument).toBe('guitar')
      expect(cfg.tuning).toEqual(['D,', 'A,', 'D', 'G', 'A', 'd'])
      expect(cfg.capo).toBe(2)
    })

    it('includes label with tuning placeholder', () => {
      const cfg = buildAbcjsTablatureConfig({ tablature: 'guitar' })
      expect(cfg.label).toBe('Guitar (%T)')
    })

    it('uses custom guitar tuning text that does not match a preset name', () => {
      const cfg = buildAbcjsTablatureConfig({
        tablature: 'guitar',
        tuning: 'C G D G A D',
        capo: 0,
      })
      expect(cfg.tuning).toEqual(['C,', 'G,', 'D', 'G', 'A', 'd'])
    })

    it('uses compact custom guitar tuning letters', () => {
      const cfg = buildAbcjsTablatureConfig({
        tablature: 'guitar',
        tuning: 'CGDGAD',
        capo: 0,
      })
      expect(cfg.tuning).toEqual(['C,', 'G,', 'D', 'G', 'A', 'd'])
    })

    it('uses scientific pitch strings for custom guitar tuning', () => {
      const cfg = buildAbcjsTablatureConfig({
        tablature: 'guitar',
        tuning: 'D2 A2 D3 G3 A3 D4',
        capo: 0,
      })
      expect(cfg.tuning).toEqual(['D,', 'A,', 'D', 'G', 'A', 'd'])
    })

    it('falls back to standard tuning when custom text cannot be parsed', () => {
      const cfg = buildAbcjsTablatureConfig({
        tablature: 'guitar',
        tuning: 'My custom tuning',
        capo: 0,
      })
      expect(cfg.tuning).toEqual(['E,', 'A,', 'D', 'G', 'B', 'e'])
    })
  })

  describe('parseCustomTuningToStrings', () => {
    it('parses spaced note names for guitar', () => {
      expect(parseCustomTuningToStrings('C G D G A D', 'guitar')).toEqual([
        'C2', 'G2', 'D3', 'G3', 'A3', 'D4',
      ])
    })

    it('parses compact note letters for guitar', () => {
      expect(parseCustomTuningToStrings('DADGAD', 'guitar')).toEqual([
        'D2', 'A2', 'D3', 'G3', 'A3', 'D4',
      ])
    })

    it('returns null when string count does not match instrument', () => {
      expect(parseCustomTuningToStrings('DADGAD', 'violin')).toBeNull()
    })
  })

  describe('getTablatureTuningValidation', () => {
    it('accepts standard preset names', () => {
      expect(getTablatureTuningValidation('guitar', 'Standard', '')).toEqual({
        valid: true,
        message: '',
      })
    })

    it('accepts spaced custom guitar tunings', () => {
      expect(getTablatureTuningValidation('guitar', 'C G D G A D', '')).toEqual({
        valid: true,
        message: '',
      })
    })

    it('rejects tunings with duplicate open-string pitches', () => {
      const result = getTablatureTuningValidation('guitar', 'FFFFFF', '')
      expect(result.valid).toBe(false)
      expect(result.message).toMatch(/higher than the one below/i)
    })

    it('rejects tunings that cannot be parsed', () => {
      const result = getTablatureTuningValidation('guitar', 'My custom tuning', '')
      expect(result.valid).toBe(false)
      expect(result.message).toMatch(/6 note names/i)
    })

    it('requires tuning text', () => {
      expect(getTablatureTuningValidation('guitar', '', '')).toEqual({
        valid: false,
        message: 'Enter a tuning.',
      })
    })
  })

  describe('resolveTuningPresetForTab', () => {
    it('scopes tuning text to the tab instrument', () => {
      const preset = resolveTuningPresetForTab('guitar', { tuning: 'DADGAD' })
      expect(preset.id).toBe('dadgad')
    })

    it('falls back to instrument default when tuning does not match', () => {
      const preset = resolveTuningPresetForTab('uke', { tuning: 'DADGAD' })
      expect(preset.id).toBe('gceaHighG')
    })
  })

  describe('applyTablatureSelection', () => {
    it('stores normalized instrument and tuning label', () => {
      const tune = {}
      applyTablatureSelection(tune, 'mandolin', 'gdad')
      expect(tune.tablature).toBe('violin')
      expect(tune.tuning).toMatch(/GDAD/i)
      expect(tune.tablatureVoices).toBeNull()
    })
  })

  describe('applyTablatureVoiceConfigs', () => {
    it('stores per-voice instrument and tuning selections', () => {
      const tune = { voices: { '1': { notes: ['C |'] }, '2': { notes: ['D |'] } } }
      applyTablatureVoiceConfigs(tune, [
        { voiceKey: '1', enabled: true, instrumentId: 'guitar', presetId: 'standard', tuningText: 'Standard' },
        { voiceKey: '2', enabled: true, instrumentId: 'violin', presetId: 'gdae', tuningText: 'GDAE' },
      ], 'both')
      expect(tune.tablatureVoices['1'].instrumentId).toBe('guitar')
      expect(tune.tablatureVoices['2'].instrumentId).toBe('violin')
      expect(tune.tablatureVoices['1'].tuning).toBe('Standard')
      expect(tune.tablature).toBe('guitar')
      expect(shouldRenderTablature(tune)).toBe(true)
    })

    it('stores custom tuning text when preset is not matched', () => {
      const tune = { voices: { '1': { notes: ['C |'] } } }
      applyTablatureVoiceConfigs(tune, [
        { voiceKey: '1', enabled: true, instrumentId: 'guitar', presetId: '', tuningText: 'My custom tuning' },
      ])
      expect(tune.tablatureVoices['1'].tuning).toBe('My custom tuning')
    })

    it('disables tablature but keeps saved settings when no voices are enabled', () => {
      const tune = { tablature: 'guitar', tablatureVoices: { '1': { instrumentId: 'guitar', presetId: 'standard' } } }
      applyTablatureVoiceConfigs(tune, [
        { voiceKey: '1', enabled: false, instrumentId: '', presetId: '' },
      ])
      expect(tune.tablature).toBe('')
      expect(tune.tablatureVoices['1'].instrumentId).toBe('guitar')
      expect(isTablatureEnabled(tune)).toBe(false)
    })
  })

  describe('parseTablatureVoices', () => {
    it('normalizes stored voice entries', () => {
      const parsed = parseTablatureVoices({
        '1': { instrumentId: 'mandolin', presetId: 'gdae' },
        '2': { instrument: 'guitar', preset: 'dadgad' },
      })
      expect(parsed['1'].instrumentId).toBe('violin')
      expect(parsed['2'].instrumentId).toBe('guitar')
      expect(parsed['2'].presetId).toBe('dadgad')
    })
  })

  describe('getTablatureSelection', () => {
    it('normalizes legacy mandolin selection', () => {
      const selection = getTablatureSelection({ tablature: 'mandolin', tuning: 'GDAE (standard)' })
      expect(selection.instrumentId).toBe('violin')
      expect(selection.presetId).toBe('gdae')
    })
  })

  describe('getTablatureButtonLabel', () => {
    it('returns instrument name only when tab is active', () => {
      expect(getTablatureButtonLabel({ tablature: 'guitar' })).toBe('Guitar')
      expect(getTablatureButtonLabel({ tablature: 'violin' })).toBe('Violin')
    })

    it('returns Tablature when off', () => {
      expect(getTablatureButtonLabel({ tablature: '' })).toBe('Tablature')
    })

    it('returns Tablature when multiple instruments are active', () => {
      const tune = {
        tablatureVoices: {
          '1': { instrumentId: 'guitar', presetId: 'standard' },
          '2': { instrumentId: 'violin', presetId: 'gdae' },
        },
        voices: {
          '1': { notes: ['C |'] },
          '2': { notes: ['D |'] },
        },
      }
      expect(getTablatureButtonLabel(tune)).toBe('Tablature')
      expect(tablatureInstrumentSummary(tune)).toBe('Guitar + Violin')
    })
  })

  describe('buildTablatureRenderOptions', () => {
    it('returns null when tablature is off', () => {
      expect(buildTablatureRenderOptions({ tablature: '', voices: { '1': { notes: ['C D E |'] } } })).toBeNull()
    })

    it('returns single config when tune has no voice map', () => {
      const opts = buildTablatureRenderOptions({ tablature: 'guitar' })
      expect(opts).toHaveLength(1)
      expect(opts[0].instrument).toBe('guitar')
    })

    it('adds tab only under melody voices', () => {
      const opts = buildTablatureRenderOptions({
        tablature: 'guitar',
        voices: {
          '1': { notes: ['| "C" z2 "G" z |'] },
          '2': { notes: ['C D E F |'] },
        },
      })
      expect(opts).toHaveLength(2)
      expect(opts[0].instrument).toBe('')
      expect(opts[1].instrument).toBe('guitar')
    })

    it('returns null when no voice has melody', () => {
      expect(buildTablatureRenderOptions({
        tablature: 'guitar',
        voices: {
          '1': { notes: ['| "C" z2 "G" z |'] },
        },
      })).toBeNull()
    })

    it('respects filtered voice list from voice toggles', () => {
      const opts = buildTablatureRenderOptions({
        tablature: 'guitar',
        voices: {
          '2': { notes: ['C D E F |'] },
        },
      })
      expect(opts).toHaveLength(1)
      expect(opts[0].instrument).toBe('guitar')
    })

    it('maps tab config using rendered voice keys after filtering', () => {
      const sourceTune = {
        tablature: 'guitar',
        voices: {
          '1': { notes: ['| "C" z2 "G" z |'] },
          '2': { notes: ['C D E F |'] },
        },
      }
      const displayTune = {
        tablature: 'guitar',
        voices: {
          '2': { notes: ['C D E F |'] },
        },
      }
      const opts = buildTablatureRenderOptions(displayTune, {
        sourceTune: sourceTune,
        voiceKeys: ['2'],
      })
      expect(opts).toHaveLength(1)
      expect(opts[0].instrument).toBe('guitar')
    })

    it('still builds tab options for tab-only display mode', () => {
      const opts = buildTablatureRenderOptions({
        tablature: 'guitar',
        tabDisplay: 'tab',
        voices: { '1': { notes: ['C D E F |'] } },
      })
      expect(opts).toHaveLength(1)
      expect(opts[0].instrument).toBe('guitar')
    })

    it('uses per-voice instrument and tuning when configured', () => {
      const opts = buildTablatureRenderOptions({
        tablature: 'guitar',
        tablatureVoices: {
          '1': { instrumentId: 'violin', presetId: 'gdae', tuning: 'GDAE' },
          '2': { instrumentId: 'guitar', presetId: 'standard', tuning: 'Standard' },
        },
        voices: {
          '1': { notes: ['| "C" z2 "G" z |'] },
          '2': { notes: ['C D E F |'] },
        },
      })
      expect(opts).toHaveLength(2)
      expect(opts[0].instrument).toBe('violin')
      expect(opts[1].instrument).toBe('guitar')
    })

    it('skips voices without per-voice tab configuration', () => {
      const opts = buildTablatureRenderOptions({
        tablatureVoices: {
          '2': { instrumentId: 'guitar', presetId: 'standard' },
        },
        voices: {
          '1': { notes: ['C D E F |'] },
          '2': { notes: ['G A B c |'] },
        },
      })
      expect(opts).toHaveLength(2)
      expect(opts[0].instrument).toBe('')
      expect(opts[1].instrument).toBe('guitar')
    })

    it('matches tab option count to rendered staff count when voices are filtered', () => {
      const sourceTune = {
        tablatureVoices: {
          '2': { instrumentId: 'guitar', presetId: 'dadgad', tuning: 'DADGAD' },
        },
        voices: {
          '1': { notes: ['| "C" z2 "G" z |'] },
          '2': { notes: ['C D E F |'] },
        },
      }
      const displayTune = {
        tablatureVoices: sourceTune.tablatureVoices,
        voices: {
          '2': { notes: ['C D E F |'] },
        },
      }
      const opts = buildTablatureRenderOptions(displayTune, {
        sourceTune: sourceTune,
        voiceKeys: ['2'],
      })
      expect(opts).toHaveLength(1)
      expect(opts[0].instrument).toBe('guitar')
      expect(opts[0].tuning).toEqual(['D,', 'A,', 'D', 'G', 'A', 'd'])
    })

    it('abcjs renders custom guitar tablature without throwing', () => {
      const cfg = buildAbcjsTablatureConfig({ tablature: 'guitar', tuning: 'CGDGAD' })
      const abc = 'X:1\nT:t\nM:4/4\nL:1/8\nK:C\nCDEF GABc |]\n'
      expect(function() {
        abcjs.renderAbc('*', abc, { tablature: [cfg] })
      }).not.toThrow()
    })

    it('abcjs renders multi-voice tune with repeated-letter custom guitar tuning', () => {
      const tune = {
        tablatureVoices: {
          '2': { instrumentId: 'guitar', presetId: '', tuning: 'FFFFFF' },
        },
        voices: {
          '1': { notes: ['| "C" z2 "G" z |'] },
          '2': { notes: ['CDEF GABc |'] },
        },
      }
      const opts = buildTablatureRenderOptions(tune)
      expect(opts).toHaveLength(2)
      // Duplicate open-string pitches hang abcjs; fall back to standard tuning.
      expect(opts[1].tuning).toEqual(['E,', 'A,', 'D', 'G', 'B', 'e'])
      const abc = 'X:1\nT:t\nM:4/4\nL:1/8\nK:C\nV:1\n| "C" z2 "G" z |\nV:2\nCDEF GABc |\n'
      expect(function() {
        abcjs.renderAbc('*', abc, { tablature: opts })
      }).not.toThrow()
    })
  })

  describe('getTablatureVoiceSettings', () => {
    it('derives enabled melody voices from legacy global tablature', () => {
      const settings = getTablatureVoiceSettings({
        tablature: 'guitar',
        tuning: 'Standard',
        voices: {
          '1': { notes: ['| "C" z2 "G" z |'] },
          '2': { notes: ['C D E F |'] },
        },
      })
      expect(settings).toHaveLength(2)
      expect(settings[0].enabled).toBe(false)
      expect(settings[1].enabled).toBe(true)
      expect(settings[1].instrumentId).toBe('guitar')
    })
  })

  describe('tab display mode', () => {
    it('normalizes display values', () => {
      expect(normalizeTabDisplay('tab')).toBe('tab')
      expect(normalizeTabDisplay('')).toBe('both')
      expect(normalizeTabDisplay('invalid')).toBe('both')
      expect(normalizeTabDisplay('staff')).toBe('both')
    })

    it('clears tab display when tablature is turned off', () => {
      const tune = {
        tablature: 'guitar',
        tabDisplay: 'tab',
        tablatureVoices: { '1': { instrumentId: 'guitar', presetId: 'standard', tuning: 'Standard' } },
      }
      disableTablature(tune)
      expect(tune.tablature).toBe('')
      expect(tune.tabDisplay).toBe('tab')
      expect(tune.tablatureVoices['1'].instrumentId).toBe('guitar')
      expect(isTablatureEnabled(tune)).toBe(false)
      expect(shouldRenderTablature(tune)).toBe(false)
    })

    it('defaults new tab selections to both', () => {
      const tune = {}
      applyTablatureSelection(tune, 'guitar', 'standard')
      expect(tune.tabDisplay).toBe('both')
    })

    it('returns null when tablature is disabled but settings are saved', () => {
      expect(buildTablatureRenderOptions({
        tablatureEnabled: false,
        tablature: '',
        tablatureVoices: { '1': { instrumentId: 'guitar', presetId: 'standard' } },
        voices: { '1': { notes: ['C D E |'] } },
      })).toBeNull()
    })

    it('detects tab-only post processing', () => {
      const tune = { tablature: 'guitar', tabDisplay: 'tab', voices: { '1': { notes: ['C |'] } } }
      const opts = buildTablatureRenderOptions(tune)
      expect(shouldApplyTabOnlyDisplay(tune, opts)).toBe(true)
      expect(shouldRenderTablature(tune)).toBe(true)
    })
  })

  describe('isSupportedTablatureInstrument', () => {
    it('accepts tab-capable instruments only', () => {
      expect(isSupportedTablatureInstrument('guitar')).toBe(true)
      expect(isSupportedTablatureInstrument('bouzouki')).toBe(true)
      expect(isSupportedTablatureInstrument('mandolin')).toBe(true)
      expect(isSupportedTablatureInstrument('viola')).toBe(false)
      expect(isSupportedTablatureInstrument('bass')).toBe(false)
    })
  })
})
