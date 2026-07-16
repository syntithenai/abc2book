export const RECENT_TUNES_DEFAULT = 10
export const RECENT_TUNES_EXPANDED = 60

function tuneLastUpdated(tune) {
  if (!tune || tune.lastUpdated === undefined || tune.lastUpdated === null || tune.lastUpdated === '') {
    return 0
  }
  const n = Number(tune.lastUpdated)
  return Number.isFinite(n) ? n : 0
}

export function getRecentTunes(tunes, limit) {
  if (!tunes) return []
  var max = typeof limit === 'number' && limit > 0 ? limit : RECENT_TUNES_DEFAULT
  return Object.values(tunes)
    .filter(function(tune) { return tune && tune.id && tuneLastUpdated(tune) > 0 })
    .sort(function(a, b) { return tuneLastUpdated(b) - tuneLastUpdated(a) })
    .slice(0, max)
}

function tuneNameKey(tune) {
  return (tune && tune.name && String(tune.name).trim()) ? String(tune.name).trim().toLowerCase() : ''
}

export function getStarredTunes(tunes, limit) {
  if (!tunes) return []
  var list = Object.values(tunes)
    .filter(function(tune) { return tune && tune.id && tune.starred })
    .sort(function(a, b) {
      var an = tuneNameKey(a)
      var bn = tuneNameKey(b)
      if (an < bn) return -1
      if (an > bn) return 1
      return String(a.id).localeCompare(String(b.id))
    })
  if (typeof limit === 'number' && limit > 0) return list.slice(0, limit)
  return list
}

export const BOOKS_PAGE_SECTIONS = {
  filters: 'books-page-filters',
  recent: 'books-page-recent',
  starred: 'books-page-starred',
  books: 'books-page-books',
  tags: 'books-page-tags',
  genres: 'books-page-genres',
  artists: 'books-page-artists',
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

/** Clearance for fixed header + sticky collection nav on the books page. */
export function getBooksPageScrollOffset() {
  if (typeof document === 'undefined') return 120
  var nav = document.querySelector('.books-page-nav')
  if (nav) {
    var style = window.getComputedStyle(nav)
    var stickyTop = parseFloat(style.top) || 0
    return stickyTop + nav.getBoundingClientRect().height + 8
  }
  return 120
}

export function scrollBooksPageSection(sectionId) {
  if (!sectionId || typeof document === 'undefined') return
  var el = document.getElementById(sectionId)
  if (!el) return
  var offset = getBooksPageScrollOffset()
  var top = el.getBoundingClientRect().top + window.pageYOffset - offset
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
}
