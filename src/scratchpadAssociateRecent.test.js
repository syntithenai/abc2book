import {
  getScratchpadAssociateSuggestions,
  labelForAssociateMode,
  recordScratchpadAssociateTarget,
} from './scratchpadAssociateRecent'

describe('scratchpadAssociateRecent', function() {
  beforeEach(function() {
    localStorage.clear()
  })

  test('recordScratchpadAssociateTarget stores and dedupes entries', function() {
    recordScratchpadAssociateTarget('t1', 'Tune One', 'notation:merge')
    recordScratchpadAssociateTarget('t2', 'Tune Two', 'notation:insert')
    recordScratchpadAssociateTarget('t1', 'Tune One', 'notation:merge')
    const tunes = {
      t1: { id: 't1', name: 'Tune One' },
      t2: { id: 't2', name: 'Tune Two' },
    }
    const suggestions = getScratchpadAssociateSuggestions(tunes, {
      associateMode: 'notation',
    })
    expect(suggestions[0].tune.id).toBe('t1')
    expect(suggestions[0].reason).toBe('Merged')
    expect(suggestions.some(function(s) { return s.tune.id === 't2' })).toBe(true)
  })

  test('linked tune is suggested first', function() {
    const tunes = {
      t1: { id: 't1', name: 'Linked Tune' },
      t2: { id: 't2', name: 'Other', lastUpdated: Date.now() },
    }
    const suggestions = getScratchpadAssociateSuggestions(tunes, {
      associateMode: 'notation-merge',
      linkedTuneId: 't1',
    })
    expect(suggestions[0].tune.id).toBe('t1')
    expect(suggestions[0].reason).toBe('Linked')
  })

  test('labelForAssociateMode maps notation operations', function() {
    expect(labelForAssociateMode('notation:merge')).toBe('Merged')
    expect(labelForAssociateMode('notation:insert')).toBe('Inserted')
    expect(labelForAssociateMode('notation:replace')).toBe('Replaced')
    expect(labelForAssociateMode('notation-merge')).toBe('Merged')
  })
})
