import {
  generateScaleWarmup,
  generateArpeggioWarmup,
  selectWarmupsForSession,
  getWarmupCatalogSize,
  validateWarmupCatalog,
  getWarmupCatalogEntries,
  keyDisplayName,
} from './practiceWarmupGenerator'

describe('practiceWarmupGenerator', function() {
  it('generates D major scale ABC with key header', function() {
    const warmup = generateScaleWarmup({ key: 'D' })
    expect(warmup.id).toBe('scale')
    expect(warmup.title).toContain('D')
    expect(warmup.abc).toContain('K:D')
    expect(warmup.abc).toMatch(/\|]\s*$/)
  })

  it('generates Am minor scale ABC', function() {
    const warmup = generateScaleWarmup({ key: 'Am' })
    expect(warmup.abc).toContain('K:Am')
    expect(keyDisplayName('Am')).toBe('A minor')
  })

  it('generates Bb major arpeggio ABC', function() {
    const warmup = generateArpeggioWarmup({ key: 'Bb' })
    expect(warmup.id).toBe('arpeggio')
    expect(warmup.abc).toContain('K:Bb')
    expect(warmup.abc.length).toBeGreaterThan(20)
  })

  it('has a broad warmup catalog', function() {
    expect(getWarmupCatalogSize()).toBeGreaterThanOrEqual(70)
  })

  it('generates valid ABC for every catalog exercise', function() {
    expect(validateWarmupCatalog()).toEqual([])
  })

  it('selects skill-appropriate warmups with variety', function() {
    const low = selectWarmupsForSession('G', 1, { tempo: 74 }, 3)
    expect(low.length).toBeGreaterThan(0)
    expect(low.every(function(w) { return w.abc.indexOf('K:G') !== -1 })).toBe(true)

    const high = selectWarmupsForSession('G', 10, { tempo: 110 }, 3)
    expect(high.length).toBe(3)
    const ids = high.map(function(w) { return w.id })
    expect(new Set(ids).size).toBe(3)
  })

  it('skill 1 warmups use simpler patterns', function() {
    const warmups = selectWarmupsForSession('C', 1, {}, 2)
    expect(warmups.some(function(w) { return w.id.indexOf('pentascale') === 0 })).toBe(true)
  })

  it('includes rhythm patterns at higher skill', function() {
    const eligible = getWarmupCatalogEntries().filter(function(item) {
      return 8 >= item.minSkill && 8 <= item.maxSkill
    })
    const ids = eligible.map(function(item) { return item.id })
    expect(ids.some(function(id) {
      return id.indexOf('dotted') !== -1 || id.indexOf('triplet') !== -1 || id.indexOf('syncopated') !== -1
    })).toBe(true)
  })
})
