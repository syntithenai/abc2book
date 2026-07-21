import {
  composerHintFromFile,
  ensureUniqueTuneName,
  guessTitleComposerFromLines,
  humanizeFolderName,
  mapTocToPageTitles,
  parseJammedSongHeader,
  parseJammedTocPage,
  parseTocLines,
  segmentMetadataPages,
  segmentsFromPageTitles,
  splitJammedTitleRun,
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

  test('parseTocLines reads numbered index entries', function() {
    expect(parseTocLines(['1. Drowsy Maggie', '2. The Kesh', 'notes'])).toEqual([
      { num: 1, title: 'Drowsy Maggie' },
      { num: 2, title: 'The Kesh' },
    ])
  })

  test('segmentsFromPageTitles prefers toc mapping when available', function() {
    const pageTitles = [
      {
        page: 1,
        title: '',
        artist: '',
        lines: ['1. Drowsy Maggie', '2. The Kesh', '3. Silver Spear'],
      },
      { page: 5, title: 'Drowsy Maggie', artist: '' },
      { page: 7, title: 'The Kesh', artist: '' },
      { page: 9, title: 'Silver Spear', artist: '' },
    ]
    const segments = segmentsFromPageTitles(pageTitles)
    expect(segments.length).toBeGreaterThanOrEqual(3)
    expect(segments[0].title).toBe('Drowsy Maggie')
    expect(segments[0].page).toBe(5)
  })

  test('mapTocToPageTitles returns null for short indexes', function() {
    expect(mapTocToPageTitles([{ num: 1, title: 'One' }], [])).toBeNull()
  })

  test('splitJammedTitleRun splits camel-cased title runs', function() {
    expect(splitJammedTitleRun('Ah SpringAnother WorldAttaboy')).toEqual([
      'Ah Spring',
      'Another World',
      'Attaboy',
    ])
  })

  test('parseJammedSongHeader splits title and composer before From', function() {
    expect(parseJammedSongHeader('Bittersweet ReelChris ThileFrom Thile album')).toEqual({
      title: 'Bittersweet Reel',
      composer: 'Chris Thile',
    })
  })

  test('parseJammedTocPage reads concatenated index pages', function() {
    const titles = parseJammedTocPage([
      'CHRIS THILE TRANSCRIPTIONSAh SpringAnother WorldAttaboyThe BeekeeperBittersweet ReelChurch Street BluesThe Eleventh ReelFamiliarityFlippenHam and Cheese',
    ])
    expect(titles.length).toBeGreaterThanOrEqual(5)
    expect(titles).toContain('Ah Spring')
    expect(titles).toContain('Bittersweet Reel')
  })

  test('segmentsFromPageTitles reads jammed table-of-contents pages', function() {
    const pageTitles = [
      {
        page: 1,
        title: '',
        artist: '',
        lines: [
          'CHRIS THILE TRANSCRIPTIONSAh SpringAnother WorldAttaboyThe BeekeeperBittersweet ReelChurch Street BluesThe Eleventh ReelFamiliarityFlippenHam and Cheese',
        ],
      },
      {
        page: 28,
        title: '',
        artist: '',
        lines: ['\u0014Bittersweet ReelChris ThileFrom Thile album Stealing Second'],
      },
    ]
    const segments = segmentsFromPageTitles(pageTitles)
    expect(segments.length).toBeGreaterThanOrEqual(5)
    const bittersweet = segments.find(function(segment) {
      return segment.title === 'Bittersweet Reel'
    })
    expect(bittersweet).toBeTruthy()
    expect(bittersweet.page).toBe(28)
    const ahSpring = segments.find(function(segment) {
      return segment.title === 'Ah Spring'
    })
    expect(ahSpring).toBeTruthy()
    expect(ahSpring.page).toBeGreaterThan(1)
    expect(ahSpring.page).toBeLessThan(28)
  })
})
