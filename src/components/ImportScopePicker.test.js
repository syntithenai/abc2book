import { buildImportScopeOptions } from './ImportScopePicker'

describe('buildImportScopeOptions', function() {
  test('offers tune, its books, and whole tunebook', function() {
    const preview = {
      tunes: {
        t1: { id: 't1', name: 'The Reel', books: ['Session Tunes', 'Gigs'] },
        t2: { id: 't2', name: 'Other', books: ['Session Tunes'] },
      },
      sets: {},
    }
    const options = buildImportScopeOptions(preview, { scopeHint: 'tune', tuneId: 't1' })
    const scopes = options.map(function(o) { return o.scope + ':' + (o.tuneId || o.bookName || o.setId || 'all') })
    expect(scopes).toContain('tune:t1')
    expect(scopes).toContain('book:Session Tunes')
    expect(scopes).toContain('book:Gigs')
    expect(scopes).toContain('all:all')
    expect(options.find(function(o) { return o.scope === 'tune' }).recommended).toBe(true)
  })

  test('lists every set in the shared tunebook', function() {
    const preview = {
      tunes: { t1: { id: 't1', name: 'A', books: [] } },
      sets: {
        s1: { name: 'Friday gig', items: [{ type: 'tune', tuneId: 't1' }] },
        s2: { name: 'Other', items: [] },
      },
    }
    const options = buildImportScopeOptions(preview, { scopeHint: 'all' })
    expect(options.filter(function(o) { return o.scope === 'set' }).map(function(o) { return o.setId }).sort())
      .toEqual(['s1', 's2'])
    expect(options.find(function(o) { return o.setId === 's1' }).subtitle).toContain('Imports set and 1 tune')
  })

  test('set share links only offer that set and the whole songbook', function() {
    const preview = {
      tunes: {
        t1: { id: 't1', name: 'A', books: [] },
        t2: { id: 't2', name: 'B', books: [] },
      },
      sets: {
        s1: { name: 'Friday gig', items: [{ type: 'tune', tuneId: 't1' }] },
        s2: { name: 'Other', items: [{ type: 'tune', tuneId: 't2' }] },
      },
    }
    const options = buildImportScopeOptions(preview, { scopeHint: 'set', setId: 's1' })
    expect(options.map(function(o) { return o.scope })).toEqual(['set', 'all'])
    expect(options[0].setId).toBe('s1')
    expect(options[0].recommended).toBe(true)
    expect(options[0].title).toBe('Import set: Friday gig')
    expect(options[0].subtitle).toContain('Imports set and 1 tune')
    expect(options[1].title).toBe('Import whole songbook')
    expect(options[1].recommended).toBe(false)
  })
})
