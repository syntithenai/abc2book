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
  applyTablatureSelection,
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

    it('still builds tab options for tab-only display mode', () => {
      const opts = buildTablatureRenderOptions({
        tablature: 'guitar',
        tabDisplay: 'tab',
        voices: { '1': { notes: ['C D E F |'] } },
      })
      expect(opts).toHaveLength(1)
      expect(opts[0].instrument).toBe('guitar')
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
      const tune = { tablature: 'guitar', tabDisplay: 'tab' }
      applyTablatureSelection(tune, '', '')
      expect(tune.tablature).toBe('')
      expect(tune.tabDisplay).toBe('')
    })

    it('defaults new tab selections to both', () => {
      const tune = {}
      applyTablatureSelection(tune, 'guitar', 'standard')
      expect(tune.tabDisplay).toBe('both')
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
