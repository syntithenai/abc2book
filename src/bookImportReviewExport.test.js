import {
  buildReviewSetImportPackage,
  mergeImportPackageIntoReviewSet,
} from './bookImportReviewExport'
import { ensureAbcbookRepeats } from './bookImportAbcTransforms'

describe('bookImportReviewExport', function() {
  test('buildReviewSetImportPackage mirrors eurosession shape', function() {
    const pkg = buildReviewSetImportPackage({
      id: 'set-1',
      name: 'Test set',
      book: 'mybook',
      bookLabel: 'My Book',
      tunes: [{
        id: 'tune-abc',
        title: 'Polka (G)',
        page: 2,
        tuneIndex: 1,
        cropName: 'p02_01_polka.jpg',
        abc: 'K:G\nCDEF|',
        complete: true,
      }],
    })
    expect(pkg.book).toBe('mybook')
    expect(pkg.tunes).toHaveLength(1)
    expect(pkg.tunes[0].id).toBe('tune-abc')
    expect(pkg.tunes[0].crop).toBe('p02_01_polka.jpg')
    expect(ensureAbcbookRepeats(pkg.tunes[0].abc)).toContain('% abcbook-repeats 3')
  })

  test('mergeImportPackageIntoReviewSet updates by id', function() {
    const set = {
      id: 'set-1',
      book: 'mybook',
      tunes: [{ id: 'a', title: 'A', abc: 'old', complete: false }],
    }
    const merged = mergeImportPackageIntoReviewSet(set, {
      tunes: [{ id: 'a', abc: 'K:C\nnew|', complete: true }],
    })
    expect(merged.tunes[0].abc).toContain('new')
    expect(merged.tunes[0].complete).toBe(true)
  })
})
