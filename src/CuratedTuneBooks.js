/**
 * Curated import catalog aligned with bookTaxonomy target books.
 * Multi-file / cross-book tag cards use `all: true` or `links: [...]`.
 */
import { BOOK_COVER_IMAGES, BOOK_SCRAPE_FILES, PUBLISHABLE_SCRAPE_FILES } from './bookTaxonomy.js'

function bookEntry(book, extras) {
  const file = BOOK_SCRAPE_FILES[book]
  const image = BOOK_COVER_IMAGES[book]
  return Object.assign({
    group: 'Collections',
    link: file,
    book: book,
    image: image,
  }, extras || {})
}

function tagAcrossBooks(tag, image, extras) {
  return Object.assign({
    group: 'Collections',
    all: true,
    tag: tag,
    image: image,
    useCatalogRoute: true,
  }, extras || {})
}

function tagInBook(book, tag, image, extras) {
  return Object.assign({
    group: 'Collections',
    link: BOOK_SCRAPE_FILES[book],
    book: book,
    tag: tag,
    image: image,
  }, extras || {})
}

export default {
  'import all': {
    group: 'Collections',
    all: true,
    image: 'tunes.jpeg',
    useCatalogRoute: true,
  },

  tunes: bookEntry('tunes'),
  songs: bookEntry('songs'),
  'christmas songs': bookEntry('christmas songs'),
  'kids songs': bookEntry('kids songs'),
  celtic: bookEntry('celtic'),
  'old time american': bookEntry('old time american'),
  'australian bush dance': bookEntry('australian bush dance'),
  eurosession: bookEntry('eurosession'),
  'balkan dances': bookEntry('balkan dances'),
  ukranian: bookEntry('ukranian'),

  // Tag subsets (often single-book)
  'kameruka bush dance': tagInBook('australian bush dance', 'kameruka bush dance', 'kamerukabushdance.jpeg'),
  'sean kenan irish music': tagInBook('celtic', 'sean kenan book', 'seankenanirishmusic.jpeg'),
  'begged borrowed and stolen': tagInBook('celtic', 'begged borrowed and stolen', 'beggedborrowedandstolen.jpeg'),
  'good tune book': tagInBook('celtic', 'good tune book', 'goodtunebook.jpeg'),
  'canberra pickers and fiddlers': tagInBook('old time american', 'canberra pickers and fiddlers', 'canberrapickersandfiddlers.jpeg'),
  'brisbane old time session': tagInBook('old time american', 'brisbane old time session', 'brisbaneoldtimesession.jpeg'),
  'traditional songs': tagAcrossBooks('traditional songs', 'traditionalsongs.jpeg'),
  'jims roots and blues': tagAcrossBooks('jims roots and blues', 'jimsrootsandblues.jpeg'),
  'kameruka choir': tagAcrossBooks('kameruka choir', 'kamerukachoir.jpeg'),

  // Person / contributor tags — span books
  'velma mckeachie': tagAcrossBooks('velma mckeachie', 'velmamckeachie.jpeg'),
  'brooke marshall': tagAcrossBooks('brooke marshall', 'brookemarshall.jpeg'),
  'charlotte lyngbye': tagAcrossBooks('charlotte lyngbye originals', 'charlottelyngbye.jpeg'),
  mandira: tagAcrossBooks('mandira', 'mandira.jpeg'),
  'max campbell': tagAcrossBooks('max campbell', 'maxcampbell.jpeg'),
  'robert kingston': tagAcrossBooks('robert kingston', 'robertkingston.jpeg'),
  'steve ryan': tagAcrossBooks('steve ryan', 'steveryan.jpeg'),
  francesca: tagAcrossBooks('francesca', 'francesca.jpeg'),
}

export { PUBLISHABLE_SCRAPE_FILES }
