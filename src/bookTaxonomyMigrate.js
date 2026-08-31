/**
 * Apply bookTaxonomy membership transforms to tune objects / ABC inventories.
 */

import {
  SPECIALTY_BOOKS,
  TAG_IMPLIES_BOOK,
  classifyBookLabel,
  normalizeLabel,
  resolveBookRename,
} from './bookTaxonomy.js'

function uniqueLabels(list) {
  const out = []
  const seen = {}
  ;(Array.isArray(list) ? list : []).forEach(function(raw) {
    const key = normalizeLabel(raw)
    if (!key || seen[key]) return
    seen[key] = true
    out.push(key)
  })
  return out
}

function remapBookPages(bookPages, keyMap) {
  if (!bookPages || typeof bookPages !== 'object' || Array.isArray(bookPages)) {
    return bookPages && typeof bookPages === 'object' ? bookPages : {}
  }
  const next = {}
  Object.keys(bookPages).forEach(function(key) {
    const norm = normalizeLabel(key)
    const mapped = keyMap[norm] || norm
    const entry = bookPages[key]
    if (!entry || typeof entry !== 'object') return
    // Prefer existing mapped entry; first write wins unless empty.
    if (!next[mapped]) {
      next[mapped] = Object.assign({}, entry)
    }
  })
  return next
}

/**
 * Transform books / tags / bookPages for one tune.
 * Never drops a former book label: it remains as a book (possibly renamed) or a tag.
 *
 * @param {{ books?: string[], tags?: string[], bookPages?: object }} tune
 * @returns {{ books: string[], tags: string[], bookPages: object, changes: object }}
 */
export function migrateTuneMembership(tune) {
  const src = tune || {}
  const oldBooks = uniqueLabels(src.books)
  const oldTags = uniqueLabels(src.tags)
  const nextBooks = []
  const nextTags = oldTags.slice()
  const pageKeyMap = {}
  const demoted = []
  const renamed = []

  oldBooks.forEach(function(book) {
    const classified = classifyBookLabel(book)
    if (classified.book) {
      if (nextBooks.indexOf(classified.book) === -1) nextBooks.push(classified.book)
      if (classified.renamedFrom) {
        renamed.push({ from: classified.renamedFrom, to: classified.book })
        pageKeyMap[classified.renamedFrom] = classified.book
      } else {
        pageKeyMap[book] = classified.book
      }
    }
    if (classified.tag) {
      if (nextTags.indexOf(classified.tag) === -1) nextTags.push(classified.tag)
      if (!classified.book) {
        demoted.push(book)
        // Demoted books keep page keys under the tag/old name.
        pageKeyMap[book] = classified.tag
      }
    }
    if (!classified.book && !classified.tag) {
      // Should not happen; classifyBookLabel always returns a tag for unknowns.
      if (nextTags.indexOf(book) === -1) nextTags.push(book)
      demoted.push(book)
      pageKeyMap[book] = book
    }
  })

  // Tags that imply a specialty book when missing.
  nextTags.forEach(function(tag) {
    const implied = TAG_IMPLIES_BOOK[tag]
    if (implied && nextBooks.indexOf(implied) === -1) {
      nextBooks.push(implied)
    }
  })

  // If still only residual / empty, keep residual books that were present.
  if (nextBooks.length === 0) {
    if (oldBooks.indexOf('songs') !== -1) nextBooks.push('songs')
    else if (oldBooks.indexOf('tunes') !== -1) nextBooks.push('tunes')
    else if (oldBooks.indexOf('mymedia') !== -1) nextBooks.push('mymedia')
  }

  // Drop residual `tunes` when a carved-out specialty book is present.
  // Keep `songs` even alongside specialty (vocal + instrumental sets overlap).
  const hasCarvedSpecialty = nextBooks.some(function(b) {
    return SPECIALTY_BOOKS.indexOf(b) !== -1
      && b !== 'christmas songs'
      && b !== 'kids songs'
  })
  let books = nextBooks
  if (hasCarvedSpecialty) {
    books = nextBooks.filter(function(b) { return b !== 'tunes' })
  }
  books = uniqueLabels(books)

  const bookPages = remapBookPages(src.bookPages, pageKeyMap)

  return {
    books: books,
    tags: uniqueLabels(nextTags),
    bookPages: bookPages,
    changes: {
      demoted: demoted,
      renamed: renamed,
      booksBefore: oldBooks,
      tagsBefore: oldTags,
    },
  }
}

/**
 * Apply membership migration onto a tune object (shallow copy).
 */
export function applyMembershipMigration(tune) {
  const migrated = migrateTuneMembership(tune)
  return Object.assign({}, tune || {}, {
    books: migrated.books,
    tags: migrated.tags,
    bookPages: migrated.bookPages,
  })
}

/**
 * Migrate an entire tunes map. Returns { tunes, report }.
 */
export function migrateTunesMap(tunes) {
  const input = tunes && typeof tunes === 'object' ? tunes : {}
  const out = {}
  const report = {
    tuneCount: 0,
    changed: 0,
    demotedLabels: {},
    renamedLabels: {},
  }
  Object.keys(input).forEach(function(id) {
    const tune = input[id]
    if (!tune) return
    report.tuneCount += 1
    const migrated = migrateTuneMembership(tune)
    const sameBooks = JSON.stringify(uniqueLabels(tune.books)) === JSON.stringify(migrated.books)
    const sameTags = JSON.stringify(uniqueLabels(tune.tags)) === JSON.stringify(migrated.tags)
    if (!sameBooks || !sameTags) report.changed += 1
    migrated.changes.demoted.forEach(function(label) {
      report.demotedLabels[label] = (report.demotedLabels[label] || 0) + 1
    })
    migrated.changes.renamed.forEach(function(pair) {
      const key = pair.from + '→' + pair.to
      report.renamedLabels[key] = (report.renamedLabels[key] || 0) + 1
    })
    out[id] = Object.assign({}, tune, {
      books: migrated.books,
      tags: migrated.tags,
      bookPages: migrated.bookPages,
    })
  })
  return { tunes: out, report: report }
}

/**
 * Build inventory: tuneId → { title, books, tags, pageKeys }
 */
export function inventoryFromTunes(tunes) {
  const inv = {}
  Object.keys(tunes || {}).forEach(function(id) {
    const tune = tunes[id]
    if (!tune) return
    const pageKeys = tune.bookPages && typeof tune.bookPages === 'object'
      ? Object.keys(tune.bookPages).map(normalizeLabel).filter(Boolean).sort()
      : []
    inv[id] = {
      title: tune.name || tune.title || '',
      books: uniqueLabels(tune.books).slice().sort(),
      tags: uniqueLabels(tune.tags).slice().sort(),
      pageKeys: pageKeys,
    }
  })
  return inv
}

/**
 * Audit post vs pre inventories for non-lossy contract.
 * @returns {{ ok: boolean, missingIds: string[], extraIds: string[], lostBooks: string[], lostTags: string[], lostPageKeys: string[], notes: string[] }}
 */
export function auditInventories(pre, post) {
  const before = pre || {}
  const after = post || {}
  const missingIds = []
  const extraIds = []
  const lostBooks = []
  const lostTags = []
  const lostPageKeys = []
  const notes = []

  Object.keys(before).forEach(function(id) {
    if (!after[id]) missingIds.push(id)
  })
  Object.keys(after).forEach(function(id) {
    if (!before[id]) extraIds.push(id)
  })

  Object.keys(before).forEach(function(id) {
    const a = before[id]
    const b = after[id]
    if (!a || !b) return

    const postHasCarvedSpecialty = b.books.some(function(bookName) {
      return SPECIALTY_BOOKS.indexOf(bookName) !== -1
        && bookName !== 'christmas songs'
        && bookName !== 'kids songs'
    })

    a.books.forEach(function(book) {
      const classified = classifyBookLabel(book)
      const expectedBook = classified.book
      const expectedTag = classified.tag
      const hasBook = expectedBook && b.books.indexOf(expectedBook) !== -1
      const hasTag = expectedTag && b.tags.indexOf(normalizeLabel(expectedTag)) !== -1
      const hasOrigAsTag = b.tags.indexOf(book) !== -1
      // Residual `tunes` may be dropped when a specialty book remains.
      if (expectedBook === 'tunes' && postHasCarvedSpecialty && !hasBook) {
        return
      }
      if (expectedBook && !hasBook) {
        lostBooks.push(id + ':' + book + '→' + expectedBook)
      }
      if (!expectedBook && expectedTag && !hasTag && !hasOrigAsTag) {
        lostBooks.push(id + ':' + book + ' (tag)')
      }
    })

    a.tags.forEach(function(tag) {
      if (b.tags.indexOf(tag) === -1) {
        // Allow if tag was a rename source now only as book — still should be preserved as tag when PRESERVE_RENAME_AS_TAG
        lostTags.push(id + ':' + tag)
      }
    })

    a.pageKeys.forEach(function(key) {
      const renamed = resolveBookRename(key)
      const demotedTag = classifyBookLabel(key).tag
      const ok = b.pageKeys.indexOf(key) !== -1
        || (renamed && b.pageKeys.indexOf(renamed) !== -1)
        || (demotedTag && b.pageKeys.indexOf(normalizeLabel(demotedTag)) !== -1)
      if (!ok) lostPageKeys.push(id + ':' + key)
    })
  })

  if (missingIds.length) notes.push('missing tune ids: ' + missingIds.length)
  if (lostBooks.length) notes.push('unaccounted book labels: ' + lostBooks.length)
  if (lostTags.length) notes.push('lost tags: ' + lostTags.length)
  if (lostPageKeys.length) notes.push('lost page keys: ' + lostPageKeys.length)

  const ok = missingIds.length === 0
    && lostBooks.length === 0
    && lostTags.length === 0
    && lostPageKeys.length === 0

  return {
    ok: ok,
    missingIds: missingIds,
    extraIds: extraIds,
    lostBooks: lostBooks.slice(0, 50),
    lostTags: lostTags.slice(0, 50),
    lostPageKeys: lostPageKeys.slice(0, 50),
    notes: notes,
  }
}

/**
 * Resolve the page-ordering key for the current filter context.
 * Prefer active book; else a single selected tag.
 */
export function resolvePageKey(currentTuneBook, tagFilter) {
  const book = normalizeLabel(currentTuneBook)
  if (book) return book
  const tags = Array.isArray(tagFilter)
    ? tagFilter.map(normalizeLabel).filter(Boolean)
    : []
  if (tags.length === 1) return tags[0]
  return ''
}
