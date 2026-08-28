import {
  parsePageFromCropName,
  getTuneBookPage,
  getTunePageForBook,
  setTuneBookPage,
  sortTunesByBookPage,
} from './tuneBookPages'
import {
  mergeImportedAbcOntoTune,
  EUROSESSION_IMPORT_BOOK,
} from './eurosessionTunebookImport'
import { GROUP_BY_PAGE, sortFilteredTunes } from './tuneListFilter'
import { renderExtraAbcbookJsonFields, applyAbcbookJsonChunks, collectAbcbookJsonChunk, parseAbcbookJsonLine } from './abcbookJsonFields'

describe('tuneBookPages', function() {
  test('parsePageFromCropName reads pNN_MM_ basename', function() {
    expect(parsePageFromCropName('p08_01_hannah-s-skotshne.jpg')).toEqual({
      page: 8,
      tuneIndex: 1,
    })
    expect(parsePageFromCropName('folder/P12_03_foo.JPG')).toEqual({
      page: 12,
      tuneIndex: 3,
    })
    expect(parsePageFromCropName('not-a-crop.jpg')).toBe(null)
  })

  test('setTuneBookPage merges per book without wiping others', function() {
    const tune = setTuneBookPage(
      { id: '1', bookPages: { other: { page: 3, tuneIndex: 1 } } },
      'eurosession',
      8,
      2
    )
    expect(tune.bookPages.other).toEqual({ page: 3, tuneIndex: 1 })
    expect(tune.bookPages.eurosession).toEqual({ page: 8, tuneIndex: 2 })
  })

  test('getTuneBookPage prefers bookPages then crop fallback for eurosession', function() {
    const withMap = {
      bookPages: { eurosession: { page: 5, tuneIndex: 2 } },
      tuneFiles: [{ id: 'f', name: 'p99_01_x.jpg', source: 'eurosession' }],
    }
    expect(getTuneBookPage(withMap, 'eurosession')).toEqual({ page: 5, tuneIndex: 2 })
    expect(getTunePageForBook(withMap, 'other')).toBe(0)

    const fromCrop = {
      tuneFiles: [{ id: 'f', name: 'p08_01_slug.jpg', source: 'eurosession' }],
    }
    expect(getTuneBookPage(fromCrop, 'eurosession')).toEqual({ page: 8, tuneIndex: 1 })
    expect(getTuneBookPage(fromCrop, 'songs')).toBe(null)
  })

  test('sortTunesByBookPage orders by page then tuneIndex then name', function() {
    const tunes = [
      { id: 'c', name: 'Charlie', bookPages: { eurosession: { page: 2, tuneIndex: 1 } } },
      { id: 'a', name: 'Alpha', bookPages: { eurosession: { page: 1, tuneIndex: 2 } } },
      { id: 'b', name: 'Bravo', bookPages: { eurosession: { page: 1, tuneIndex: 1 } } },
      { id: 'z', name: 'Zed' },
    ]
    const sorted = sortTunesByBookPage(tunes, 'eurosession')
    expect(sorted.map(function(t) { return t.id })).toEqual(['b', 'a', 'c', 'z'])
  })
})

describe('eurosession import bookPages', function() {
  test('mergeImportedAbcOntoTune keeps other books pages', function() {
    const existing = {
      id: 'same-id',
      name: 'Old',
      boost: 7,
      books: ['other', 'eurosession'],
      bookPages: {
        other: { page: 10, tuneIndex: 1 },
        eurosession: { page: 1, tuneIndex: 1 },
      },
      tuneFiles: [],
    }
    const imported = {
      id: 'same-id',
      name: 'New',
      voices: { 1: { notes: ['G2'] } },
      books: [],
    }
    const merged = mergeImportedAbcOntoTune(existing, imported, EUROSESSION_IMPORT_BOOK)
    const withPage = setTuneBookPage(merged, EUROSESSION_IMPORT_BOOK, 8, 3)
    expect(withPage.bookPages.other).toEqual({ page: 10, tuneIndex: 1 })
    expect(withPage.bookPages.eurosession).toEqual({ page: 8, tuneIndex: 3 })
    expect(withPage.name).toBe('New')
  })
})

describe('bookPages abcbook-json round-trip', function() {
  test('renders and parses bookPages field', function() {
    const lines = renderExtraAbcbookJsonFields({
      bookPages: { eurosession: { page: 8, tuneIndex: 1 } },
    })
    expect(lines.length).toBeGreaterThan(0)
    expect(lines[0]).toMatch(/% abcbook-json bookPages /)
    let chunks = {}
    lines.forEach(function(line) {
      chunks = collectAbcbookJsonChunk(parseAbcbookJsonLine(line), chunks)
    })
    const parsed = applyAbcbookJsonChunks(chunks)
    expect(parsed.bookPages).toEqual({ eurosession: { page: 8, tuneIndex: 1 } })
  })
})

describe('sortFilteredTunes page mode', function() {
  test('uses book page order when groupBy is page', function() {
    const tunes = [
      { id: '2', name: 'B', bookPages: { eurosession: { page: 2, tuneIndex: 1 } } },
      { id: '1', name: 'A', bookPages: { eurosession: { page: 1, tuneIndex: 1 } } },
    ]
    const byPage = sortFilteredTunes(tunes, GROUP_BY_PAGE, 'eurosession')
    expect(byPage.map(function(t) { return t.id })).toEqual(['1', '2'])
    const byName = sortFilteredTunes(tunes, '', 'eurosession')
    expect(byName.map(function(t) { return t.id })).toEqual(['1', '2'])
  })
})
