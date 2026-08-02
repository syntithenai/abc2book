jest.mock('./tuneCatalogStore', function() {
  return {
    loadTuneBody: jest.fn(),
    loadCatalogRow: jest.fn(),
    saveTuneBody: jest.fn(),
    queryCatalogRows: jest.fn(),
    getCatalogCount: jest.fn(),
    buildCatalogRowFromTune: jest.fn(),
    deleteTuneFromCatalog: jest.fn(function() { return Promise.resolve() }),
  }
})

jest.mock('./tuneTextSearchIndex', function() {
  return {
    indexTuneForSearch: jest.fn(function() { return Promise.resolve() }),
    removeFromTextSearchIndex: jest.fn(function() { return Promise.resolve() }),
  }
})

const { deleteTuneFromCatalog } = require('./tuneCatalogStore')
const { removeFromTextSearchIndex } = require('./tuneTextSearchIndex')
const { purgeTuneFromSecondaryStores } = require('./tuneRepository')

describe('tuneRepository purgeTuneFromSecondaryStores', function() {
  beforeEach(function() {
    jest.clearAllMocks()
  })

  test('removes catalog, search index, and body cache entries', async function() {
    await purgeTuneFromSecondaryStores('abc123')
    expect(deleteTuneFromCatalog).toHaveBeenCalledWith('abc123')
    expect(removeFromTextSearchIndex).toHaveBeenCalledWith('abc123')
  })
})
