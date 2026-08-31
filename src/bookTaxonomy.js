/**
 * Canonical book/tag taxonomy after collection consolidation.
 * Collection is ground truth; scrape/*.abc mirrors PUBLISHABLE_BOOKS.
 */

export const MYMEDIA_BOOK = 'mymedia'

/** Books that remain as tunebook membership (B:). */
export const TARGET_BOOKS = [
  'australian bush dance',
  'old time american',
  'eurosession',
  'celtic',
  'balkan dances',
  'ukranian',
  'tunes',
  'songs',
  'christmas songs',
  'kids songs',
  MYMEDIA_BOOK,
]

/** Specialty books preferred over residual tunes/songs when assigning. */
export const SPECIALTY_BOOKS = [
  'australian bush dance',
  'old time american',
  'eurosession',
  'celtic',
  'balkan dances',
  'ukranian',
  'christmas songs',
  'kids songs',
]

/**
 * Old book name → new target book.
 * Old name is also preserved as a tag unless PRESERVE_RENAME_AS_TAG is false.
 */
export const BOOK_RENAMES = {
  'australian bush traditions': 'australian bush dance',
  'celtic tunes': 'celtic',
  'old time': 'old time american',
  'old time tunes': 'old time american',
  'old time tunes update': 'old time american',
  'oldtime tunes update': 'old time american',
}

/** When renaming, also keep the old label as a tag (default true). */
export const PRESERVE_RENAME_AS_TAG = true

/**
 * Former books that become tags only (no B: membership).
 * Values are the tag name to apply (usually same as key).
 */
export const BOOK_TO_TAG = {
  'begged borrowed and stolen': 'begged borrowed and stolen',
  'good tune book': 'good tune book',
  'sean kenan book': 'sean kenan book',
  'kameruka bush dance': 'kameruka bush dance',
  'kameruka bush orchestra': 'kameruka bush orchestra',
  'canberra pickers and fiddlers': 'canberra pickers and fiddlers',
  'brisbane old time session': 'brisbane old time session',
  'brisbane pickers and fiddlers': 'brisbane old time session',
  'traditional songs': 'traditional songs',
  'jims roots and blues': 'jims roots and blues',
  'milliner koken': 'milliner koken',
  'carolina chocolate drops': 'carolina chocolate drops',
  'tathra session': 'tathra session',
  'working': 'working',
  'captain cooks country dances': 'captain cooks country dances',
  'settlers sessions': 'settlers sessions',
  'slow session cobargo 2018': 'slow session cobargo 2018',
  'brooke marshal': 'brooke marshall',
  'steve set list': 'steve set list',
  'steve song book': 'steve song book',
  'steve tunes': 'steve tunes',
  'nick': 'nick hutten',
  'ralph': 'ralph cullen',
  'cassidy': 'cassidy',
  'cassidy tolearn': 'cassidy tolearn',
  'craig dawson and simone olding': 'craig dawson and simone olding',
}

/** NFF / year books and similar → keep as tags (matched by prefix/pattern). */
export const BOOK_TO_TAG_PREFIXES = [
  'nff book ',
]

/**
 * Tags that imply a specialty book when no specialty B: is present.
 */
export const TAG_IMPLIES_BOOK = {
  'celtic tunes': 'celtic',
  'steve celtic tunes': 'celtic',
  'sean kenan book': 'celtic',
  'begged borrowed and stolen': 'celtic',
  'good tune book': 'celtic',
  'old time tunes': 'old time american',
  'oldtime tunes update': 'old time american',
  'canberra pickers and fiddlers': 'old time american',
  'brisbane old time session': 'old time american',
  'kameruka bush dance': 'australian bush dance',
  'australian bush traditions': 'australian bush dance',
  'australian traditional tunes': 'australian bush dance',
  'australian dance tunes': 'australian bush dance',
  klezmer: 'balkan dances',
  balkan: 'balkan dances',
  yiddish: 'balkan dances',
  jewish: 'balkan dances',
}

/** Scrape filename (under scrape/) for each publishable book. */
export const BOOK_SCRAPE_FILES = {
  'australian bush dance': 'australian bush dance.abc',
  'old time american': 'old time american.abc',
  eurosession: 'eurosession.abc',
  celtic: 'celtic.abc',
  'balkan dances': 'balkan dances.abc',
  ukranian: 'ukranian.abc',
  tunes: 'tunes.abc',
  songs: 'songs.abc',
  'christmas songs': 'christmas songs.abc',
  'kids songs': 'kids songs.abc',
}

/** Cover image filenames under public/book_images/. */
export const BOOK_COVER_IMAGES = {
  'australian bush dance': 'australianbushdance.jpeg',
  'old time american': 'traditionalsongs.jpeg',
  eurosession: 'eurosession.jpeg',
  celtic: 'celtic.jpeg',
  'balkan dances': 'balkandances.jpeg',
  ukranian: 'ukranian.jpeg',
  tunes: 'tunes.jpeg',
  songs: 'songs.jpeg',
  'christmas songs': 'christmassongs.jpeg',
  'kids songs': 'kidssongs.jpeg',
}

export const PUBLISHABLE_BOOKS = TARGET_BOOKS.filter(function(b) {
  return b !== MYMEDIA_BOOK
})

export const PUBLISHABLE_SCRAPE_FILES = PUBLISHABLE_BOOKS.map(function(book) {
  return BOOK_SCRAPE_FILES[book]
}).filter(Boolean)

export function normalizeLabel(value) {
  return String(value || '').trim().toLowerCase()
}

export function isTargetBook(name) {
  return TARGET_BOOKS.indexOf(normalizeLabel(name)) !== -1
}

export function isPublishableBook(name) {
  return PUBLISHABLE_BOOKS.indexOf(normalizeLabel(name)) !== -1
}

export function scrapeFileForBook(book) {
  const key = normalizeLabel(book)
  return BOOK_SCRAPE_FILES[key] || null
}

export function resolveBookToTag(bookName) {
  const key = normalizeLabel(bookName)
  if (!key) return null
  if (BOOK_TO_TAG[key]) return BOOK_TO_TAG[key]
  for (let i = 0; i < BOOK_TO_TAG_PREFIXES.length; i += 1) {
    if (key.indexOf(BOOK_TO_TAG_PREFIXES[i]) === 0) return key
  }
  return null
}

export function resolveBookRename(bookName) {
  const key = normalizeLabel(bookName)
  return BOOK_RENAMES[key] || null
}

/**
 * Map any historical book label to either a target book, a tag, or both.
 * @returns {{ book: string|null, tag: string|null, renamedFrom: string|null }}
 */
export function classifyBookLabel(bookName) {
  const key = normalizeLabel(bookName)
  if (!key) return { book: null, tag: null, renamedFrom: null }

  if (key === MYMEDIA_BOOK) {
    return { book: MYMEDIA_BOOK, tag: null, renamedFrom: null }
  }

  const renamed = resolveBookRename(key)
  if (renamed) {
    return {
      book: renamed,
      tag: PRESERVE_RENAME_AS_TAG ? key : null,
      renamedFrom: key,
    }
  }

  if (isTargetBook(key)) {
    return { book: key, tag: null, renamedFrom: null }
  }

  const asTag = resolveBookToTag(key)
  if (asTag) {
    return { book: null, tag: asTag, renamedFrom: null }
  }

  // Unknown former book: demote to tag so categorisation is never dropped.
  return { book: null, tag: key, renamedFrom: null }
}
