const MAX_RECENT = 10

function tuneLastUpdated(tune) {
  if (!tune || tune.lastUpdated === undefined || tune.lastUpdated === null || tune.lastUpdated === '') {
    return 0
  }
  const n = Number(tune.lastUpdated)
  return Number.isFinite(n) ? n : 0
}

export function getRecentTunes(tunes) {
  if (!tunes) return []
  return Object.values(tunes)
    .filter(function(tune) { return tune && tune.id && tuneLastUpdated(tune) > 0 })
    .sort(function(a, b) { return tuneLastUpdated(b) - tuneLastUpdated(a) })
    .slice(0, MAX_RECENT)
}

export const BOOKS_PAGE_SECTIONS = {
  filters: 'books-page-filters',
  recent: 'books-page-recent',
  books: 'books-page-books',
  tags: 'books-page-tags',
}

export function queueBooksPageScroll(sectionId) {
  if (!sectionId) return
  try {
    sessionStorage.setItem('bookstorage_scroll_section', sectionId)
  } catch (e) {
    // ignore
  }
}

export function consumeBooksPageScrollTarget() {
  try {
    const target = sessionStorage.getItem('bookstorage_scroll_section')
    if (target) {
      sessionStorage.removeItem('bookstorage_scroll_section')
    }
    return target
  } catch (e) {
    return null
  }
}
