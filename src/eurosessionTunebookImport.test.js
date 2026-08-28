import {
  parseEurosessionImportPackage,
  indexCropFilesByBasename,
  findCropFile,
  shouldSetCropActive,
  mergeImportedAbcOntoTune,
  EUROSESSION_IMPORT_BOOK,
} from './eurosessionTunebookImport'

describe('eurosessionTunebookImport', function() {
  test('parseEurosessionImportPackage requires ids and crops', function() {
    const pkg = parseEurosessionImportPackage({
      book: 'eurosession',
      tunes: [
        {
          key: 'p01_t01',
          id: 'abc123def4567890abcd',
          title: 'Test Tune',
          crop: 'p01_01_test.jpg',
          complete: false,
          abc: 'X:1\nT:Test Tune\nM:2/4\nL:1/8\nK:G\nG2 |\n',
        },
      ],
    })
    expect(pkg.book).toBe(EUROSESSION_IMPORT_BOOK)
    expect(pkg.tunes).toHaveLength(1)
    expect(pkg.tunes[0].id).toBe('abc123def4567890abcd')
    expect(pkg.tunes[0].complete).toBe(false)
  })

  test('parseEurosessionImportPackage rejects missing id', function() {
    expect(function() {
      parseEurosessionImportPackage({
        tunes: [{ title: 'No Id', crop: 'a.jpg', abc: 'X:1\nK:C\n' }],
      })
    }).toThrow(/stable id/)
  })

  test('shouldSetCropActive is true only for incomplete', function() {
    expect(shouldSetCropActive(false)).toBe(true)
    expect(shouldSetCropActive(true)).toBe(false)
  })

  test('indexCropFilesByBasename finds by name', function() {
    const f = new File(['x'], 'p08_01_hannah-s-skotshne.jpg', { type: 'image/jpeg' })
    const idx = indexCropFilesByBasename([f])
    expect(findCropFile(idx, 'p08_01_hannah-s-skotshne.jpg')).toBe(f)
    expect(findCropFile(idx, 'missing.jpg')).toBe(null)
  })

  test('mergeImportedAbcOntoTune preserves id and boost on update', function() {
    const existing = {
      id: 'same-id',
      name: 'Old',
      boost: 7,
      starred: true,
      links: [{ title: 'yt', link: 'https://youtu.be/x' }],
      books: ['other'],
      tuneFiles: [{ id: 'f1', source: 'import' }],
      activeFile: 'f1',
      bookPages: { other: { page: 4, tuneIndex: 1 } },
    }
    const imported = {
      id: 'same-id',
      name: 'New',
      voices: { 1: { notes: ['G2'] } },
      books: [],
    }
    const merged = mergeImportedAbcOntoTune(existing, imported, 'eurosession')
    expect(merged.id).toBe('same-id')
    expect(merged.name).toBe('New')
    expect(merged.boost).toBe(7)
    expect(merged.starred).toBe(true)
    expect(merged.links).toHaveLength(1)
    expect(merged.books).toEqual(expect.arrayContaining(['other', 'eurosession']))
    expect(merged.tuneFiles).toEqual([{ id: 'f1', source: 'import' }])
    expect(merged.bookPages).toEqual({ other: { page: 4, tuneIndex: 1 } })
  })
})
