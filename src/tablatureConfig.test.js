import {
  pitchStringsToAbcTuning,
  buildAbcjsTablatureConfig,
  isSupportedTablatureInstrument,
  resolveTuningPresetForTab,
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

    it('builds mandolin config', () => {
      const cfg = buildAbcjsTablatureConfig({ tablature: 'mandolin' })
      expect(cfg.instrument).toBe('mandolin')
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

  describe('isSupportedTablatureInstrument', () => {
    it('accepts tab-capable instruments only', () => {
      expect(isSupportedTablatureInstrument('guitar')).toBe(true)
      expect(isSupportedTablatureInstrument('bouzouki')).toBe(true)
      expect(isSupportedTablatureInstrument('viola')).toBe(false)
      expect(isSupportedTablatureInstrument('bass')).toBe(false)
    })
  })
})
