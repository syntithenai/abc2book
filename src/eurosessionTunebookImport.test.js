import {
  parseEurosessionImportPackage,
  indexCropFilesByBasename,
  findCropFile,
  shouldSetCropActive,
  shouldDefaultCropSnapshotVisible,
  shouldActivateCropOnImport,
  mergeImportedAbcOntoTune,
  EUROSESSION_IMPORT_BOOK,
} from './eurosessionTunebookImport'
import { noteLinesHaveRealMelody } from './timedImportFinalizer'

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

  test('parseEurosessionImportPackage allows notation-only without crop', function() {
    const pkg = parseEurosessionImportPackage({
      tunes: [{
        key: 'mxl_t01',
        id: 'abc123def4567890abcd',
        title: 'Tunebook Only',
        complete: true,
        notationOnly: true,
        joinTier: 'mxl_only',
        abc: 'X:1\nT:Tunebook Only\nM:4/4\nL:1/8\nK:G\nG2 |\n',
      }],
    })
    expect(pkg.tunes[0].notationOnly).toBe(true)
    expect(pkg.tunes[0].crop).toBe('')
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

  test('shouldDefaultCropSnapshotVisible for photo-only stubs', function() {
    const entry = {
      joinTier: 'photo_only',
      complete: true,
      abc: '%% photo only\nz8 |]\n',
    }
    const imported = {
      voices: { 1: { notes: ['z8', '|]'] } },
      words: [],
    }
    expect(shouldDefaultCropSnapshotVisible(entry, imported)).toBe(true)
    expect(shouldActivateCropOnImport(entry, imported)).toBe(true)
  })

  test('shouldDefaultCropSnapshotVisible is false when tune has melody', function() {
    const entry = { complete: true, abc: 'G2 |\n' }
    const imported = {
      voices: { 1: { notes: ['G2', '|'] } },
      words: [],
    }
    expect(noteLinesHaveRealMelody(imported.voices[1].notes)).toBe(true)
    expect(shouldDefaultCropSnapshotVisible(entry, imported)).toBe(false)
    expect(shouldActivateCropOnImport(entry, imported)).toBe(false)
  })

  test('shouldDefaultCropSnapshotVisible is false for notation-only MXL extras', function() {
    const entry = {
      joinTier: 'mxl_only',
      notationOnly: true,
      complete: true,
      abc: 'G2 |\n',
    }
    expect(shouldDefaultCropSnapshotVisible(entry, { voices: { 1: { notes: ['G2'] } } })).toBe(false)
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
    expect(merged.links[0].link).toBe('https://youtu.be/x')
    expect(merged.books).toEqual(expect.arrayContaining(['other', 'eurosession']))
    expect(merged.tuneFiles).toEqual([{ id: 'f1', source: 'import' }])
    expect(merged.bookPages).toEqual({ other: { page: 4, tuneIndex: 1 } })
  })

  test('mergeImportedAbcOntoTune prefers imported links when present', function() {
    const existing = {
      id: 'same-id',
      links: [{ title: 'old', link: 'https://youtu.be/old' }],
      books: ['eurosession'],
    }
    const imported = {
      id: 'same-id',
      name: 'New',
      links: [{ title: 'Aurore Sand', link: 'https://www.youtube.com/watch?v=abc' }],
      books: [],
    }
    const merged = mergeImportedAbcOntoTune(existing, imported, 'eurosession')
    expect(merged.links).toHaveLength(1)
    expect(merged.links[0].link).toBe('https://www.youtube.com/watch?v=abc')
    expect(merged.links[0].title).toBe('Aurore Sand')
  })

  test('mergeImportedAbcOntoTune keeps snapshots for ABC-only updates', function() {
    const existing = {
      id: 'same-id',
      name: 'Old',
      tuneFiles: [{ id: 'crop1', name: 'p01_01.jpg', source: 'eurosession' }],
      activeFile: 'crop1',
      books: ['eurosession'],
    }
    const imported = {
      id: 'same-id',
      name: 'New ABC',
      voices: { 1: { notes: ['A2 B2 |'] } },
      books: [],
    }
    const merged = mergeImportedAbcOntoTune(existing, imported, 'eurosession')
    expect(merged.tuneFiles).toEqual([{ id: 'crop1', name: 'p01_01.jpg', source: 'eurosession' }])
    expect(merged.activeFile).toBe('crop1')
  })
})

describe('ensureAbcbookRepeats via import prep', function() {
  test('ensureAbcbookRepeats is applied before abc2json on import', function() {
    const { ensureAbcbookRepeats } = require('./bookImportAbcTransforms')
    const abc = 'X:1\nT:Test\nK:G\nG2 |\n'
    expect(ensureAbcbookRepeats(abc)).toContain('% abcbook-repeats 3')
  })
})
