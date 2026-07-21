import {
  composerHintFromFile,
  ensureUniqueTuneName,
  guessTitleComposerFromLines,
  humanizeFolderName,
  segmentMetadataPages,
} from './pdfSheetImportUtils'

describe('pdfSheetImportUtils', function() {
  test('humanizeFolderName title-cases folder names', function() {
    expect(humanizeFolderName('JOPLIN')).toBe('Joplin')
  })

  test('composerHintFromFile reads parent folder from webkitRelativePath', function() {
    const file = { name: 'AJAA.PDF', webkitRelativePath: 'ragtime PDF/JOPLIN/AJAA.PDF' }
    expect(composerHintFromFile(file)).toBe('Joplin')
  })

  test('guessTitleComposerFromLines splits title and composer', function() {
    expect(guessTitleComposerFromLines(['Scott Joplin - Maple Leaf Rag'])).toEqual({
      title: 'Scott Joplin',
      composer: 'Maple Leaf Rag',
    })
  })

  test('segmentMetadataPages splits distinct page titles', function() {
    const segments = segmentMetadataPages([
      { page: 1, title: 'Maple Leaf Rag', artist: '' },
      { page: 2, title: 'The Entertainer', artist: '' },
    ])
    expect(segments).toHaveLength(2)
    expect(segments[0].title).toBe('Maple Leaf Rag')
    expect(segments[1].title).toBe('The Entertainer')
  })

  test('ensureUniqueTuneName deduplicates repeated titles', function() {
    const used = new Set()
    expect(ensureUniqueTuneName('Rag', used)).toBe('Rag')
    expect(ensureUniqueTuneName('Rag', used)).toBe('Rag (2)')
  })
})
