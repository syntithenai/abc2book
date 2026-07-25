import { buildLyricsLineDiff } from './lyricsMergeUtils'

const ABC_HEADER_LABELS = {
  M: 'Time signature',
  K: 'Key',
  L: 'Default note length',
  Q: 'Tempo',
  T: 'Title',
  C: 'Composer',
  W: 'Lyrics',
  V: 'Voice',
  X: 'Reference number',
  R: 'Rhythm',
  H: 'History',
  N: 'Notes',
}

const CHANGE_LABELS = {
  changed: 'Changed',
  added: 'Added',
  removed: 'Removed',
}

function parseAbcHeader(line) {
  const trimmed = String(line || '').trim()
  const match = trimmed.match(/^([A-Za-z]):\s*(.*)$/)
  if (!match) return null
  return { header: match[1], value: match[2] }
}

export function describeAbcLine(line) {
  const trimmed = String(line || '').trim()
  if (!trimmed) {
    return { category: 'blank', label: 'Blank line' }
  }
  if (trimmed.startsWith('%')) {
    return { category: 'comment', label: 'Comment' }
  }
  const header = parseAbcHeader(trimmed)
  if (header) {
    const name = ABC_HEADER_LABELS[header.header] || ('Header ' + header.header)
    return {
      category: 'header',
      label: name,
      header: header.header,
      value: header.value,
    }
  }
  return { category: 'notation', label: 'Notation' }
}

function labelForDiffRow(row, notationCounters) {
  if (row.type === 'added') {
    const desc = describeAbcLine(row.transcribed)
    if (desc.category === 'notation') {
      notationCounters.added += 1
      return 'Notation line ' + notationCounters.added + ' (new)'
    }
    return desc.label + ' (new)'
  }
  if (row.type === 'removed') {
    const desc = describeAbcLine(row.existing)
    if (desc.category === 'notation') {
      notationCounters.removed += 1
      return 'Notation line ' + notationCounters.removed + ' (removed)'
    }
    return desc.label + ' (removed)'
  }

  const beforeDesc = describeAbcLine(row.existing)
  const afterDesc = describeAbcLine(row.transcribed)
  if (beforeDesc.category === 'header' && afterDesc.category === 'header'
    && beforeDesc.header === afterDesc.header) {
    return beforeDesc.label
  }
  if (beforeDesc.category === 'notation' || afterDesc.category === 'notation') {
    notationCounters.changed += 1
    return 'Notation line ' + notationCounters.changed
  }
  if (beforeDesc.label === afterDesc.label) return beforeDesc.label
  return beforeDesc.label + ' → ' + afterDesc.label
}

export function splitLineDiffHighlight(before, after) {
  const a = String(before || '')
  const b = String(after || '')
  if (a === b) {
    return {
      before: [{ text: a, changed: false }],
      after: [{ text: b, changed: false }],
    }
  }
  if (!a) {
    return {
      before: [{ text: '—', changed: false }],
      after: [{ text: b, changed: true }],
    }
  }
  if (!b) {
    return {
      before: [{ text: a, changed: true }],
      after: [{ text: '—', changed: false }],
    }
  }

  let start = 0
  const minLen = Math.min(a.length, b.length)
  while (start < minLen && a[start] === b[start]) start += 1

  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1
    endB -= 1
  }

  function parts(text, from, to) {
    const segments = []
    if (from > 0) segments.push({ text: text.slice(0, from), changed: false })
    if (to > from) segments.push({ text: text.slice(from, to), changed: true })
    if (to < text.length) segments.push({ text: text.slice(to), changed: false })
    return segments
  }

  return {
    before: parts(a, start, endA),
    after: parts(b, start, endB),
  }
}

export function buildAbcRecordDiffRows(beforeAbc, afterAbc) {
  const notationCounters = { changed: 0, added: 0, removed: 0 }
  return buildLyricsLineDiff(beforeAbc || '', afterAbc || '')
    .filter(function(row) { return row.type !== 'same' })
    .map(function(row) {
      const label = labelForDiffRow(row, notationCounters)
      const beforeDesc = describeAbcLine(row.existing)
      const afterDesc = describeAbcLine(row.transcribed)
      const category = row.type === 'added'
        ? afterDesc.category
        : (row.type === 'removed' ? beforeDesc.category : (beforeDesc.category || afterDesc.category))
      return Object.assign({}, row, {
        label: label,
        category: category,
        changeLabel: CHANGE_LABELS[row.type] || row.type,
        highlight: row.type === 'changed'
          ? splitLineDiffHighlight(row.existing, row.transcribed)
          : null,
      })
    })
}

export function buildPreviewDiffSummary(fieldDiffs, abcRows) {
  const parts = []
  const scalar = Array.isArray(fieldDiffs) ? fieldDiffs : []
  if (scalar.length > 0) {
    parts.push(scalar.length + ' tune field' + (scalar.length === 1 ? '' : 's'))
  }
  const headers = abcRows.filter(function(row) { return row.category === 'header' }).length
  const notation = abcRows.filter(function(row) { return row.category === 'notation' }).length
  const other = abcRows.length - headers - notation
  if (headers > 0) {
    parts.push(headers + ' ABC header' + (headers === 1 ? '' : 's'))
  }
  if (notation > 0) {
    parts.push(notation + ' notation line' + (notation === 1 ? '' : 's'))
  }
  if (other > 0) {
    parts.push(other + ' other line' + (other === 1 ? '' : 's'))
  }
  if (parts.length === 0) return 'No differences'
  return parts.join(', ') + ' will change'
}
