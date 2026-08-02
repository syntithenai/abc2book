import {
  buildCatalogRowFromTune,
  catalogRowMatchesTextFilter,
} from './tuneCatalogStore'

describe('tuneCatalogStore text search', function() {
  test('catalogRowMatchesTextFilter matches title and artist tokens', function() {
    const row = buildCatalogRowFromTune({
      id: 'life-song',
      name: "The Life That's in You",
      artists: ['The Okee Dokee Brothers'],
      aliases: [],
    })
    expect(catalogRowMatchesTextFilter(row, 'life')).toBe(true)
    expect(catalogRowMatchesTextFilter(row, 'okee')).toBe(true)
    expect(catalogRowMatchesTextFilter(row, 'dokee brothers')).toBe(true)
  })

  test('catalogRowMatchesTextFilter matches aliases when primary title differs', function() {
    const row = buildCatalogRowFromTune({
      id: 'alias-song',
      name: 'Untitled',
      aliases: ["The Life That's in You"],
      composer: 'The Okee Dokee Brothers',
    })
    expect(catalogRowMatchesTextFilter(row, 'life')).toBe(true)
    expect(catalogRowMatchesTextFilter(row, 'okee')).toBe(true)
  })
})
