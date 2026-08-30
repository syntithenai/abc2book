import { ABC_INFO_HEADER_FIELDS, normalizeInfoHeaderList } from './tuneBibliographicUtils'

function joinList(value) {
  return normalizeInfoHeaderList(value).join('; ')
}

/**
 * Structured rows for the info footer below notation/lyrics.
 * Omits fields abcjs already draws on the staff (title, first composer, rhythm,
 * meter, key, tempo). Shows bibliographic / history / catch-all headers instead.
 */
export function buildTuneFooterMetaRows(tune) {
  if (!tune) return []
  const rows = []

  // Extra titles (aliases) — primary T: is on the staff
  const aliases = joinList(tune.aliases)
  if (aliases) rows.push({ key: 'aliases', label: 'Also known as', value: aliases })

  // Extra C: artists — first composer is on the staff
  const artists = joinList(tune.artists)
  if (artists) rows.push({ key: 'artists', label: 'Artists', value: artists })

  const genres = joinList(tune.genres)
  if (genres) rows.push({ key: 'genres', label: 'Genres', value: genres })

  ABC_INFO_HEADER_FIELDS.forEach(function(entry) {
    const text = joinList(tune[entry.key])
    if (text) rows.push({ key: entry.key, label: entry.label, value: text })
  })

  const sourceBooks = joinList(tune.sourceBooks)
  if (sourceBooks) rows.push({ key: 'sourceBooks', label: 'Source book', value: sourceBooks })

  const srcUrl = String(tune.srcUrl || '').trim()
  if (srcUrl) rows.push({ key: 'srcUrl', label: 'Source URL', value: srcUrl })

  const meta = tune.meta && typeof tune.meta === 'object' ? tune.meta : null
  if (meta) {
    ;['F', 'I', 'P', 'U'].forEach(function(letter) {
      if (!Object.prototype.hasOwnProperty.call(meta, letter)) return
      const text = joinList(meta[letter])
      if (!text) return
      const labels = { F: 'File URL', I: 'Instruction', P: 'Parts', U: 'User defs' }
      rows.push({ key: 'meta-' + letter, label: labels[letter] || letter, value: text })
    })
  }

  return rows
}

export function hasTuneFooterMeta(tune) {
  if (!tune) return false
  if (buildTuneFooterMetaRows(tune).length > 0) return true
  return !!(typeof tune.backgroundInfo === 'string' && tune.backgroundInfo.trim())
}
