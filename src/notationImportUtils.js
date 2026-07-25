import { normalizeAbcForImport } from './abcImportNormalize'
import { mergeBibliographicList } from './tuneBibliographicUtils'

export function applyNotationTuneMeta(importedTune, tuneMeta) {
  if (!importedTune || !tuneMeta || typeof tuneMeta !== 'object') {
    return importedTune
  }

  const scalarFields = [
    'name',
    'composer',
    'rhythm',
    'meter',
    'key',
    'noteLength',
    'srcUrl',
    'backgroundInfo',
  ]

  scalarFields.forEach(function(fieldKey) {
    const value = tuneMeta[fieldKey]
    if (value === undefined || value === null || value === '') return
    importedTune[fieldKey] = value
  })

  if (tuneMeta.genre) {
    if (!Array.isArray(importedTune.genres)) importedTune.genres = []
    importedTune.genres = mergeBibliographicList(importedTune.genres, tuneMeta.genre)
  }
  if (Array.isArray(tuneMeta.genres) && tuneMeta.genres.length > 0) {
    if (!Array.isArray(importedTune.genres)) importedTune.genres = []
    importedTune.genres = mergeBibliographicList(importedTune.genres, tuneMeta.genres)
  }

  if (Array.isArray(tuneMeta.artists) && tuneMeta.artists.length > 0) {
    importedTune.artists = tuneMeta.artists.slice()
  }

  if (Array.isArray(tuneMeta.aliases) && tuneMeta.aliases.length > 0) {
    importedTune.aliases = tuneMeta.aliases.slice()
  }

  if (Array.isArray(tuneMeta.links) && tuneMeta.links.length > 0) {
    importedTune.links = tuneMeta.links.map(function(link) {
      return {
        link: link && link.link ? String(link.link) : '',
        name: link && link.name ? String(link.name) : '',
      }
    }).filter(function(link) { return link.link })
  }

  if (tuneMeta.meta && typeof tuneMeta.meta === 'object') {
    importedTune.meta = Object.assign({}, importedTune.meta || {}, tuneMeta.meta)
  }

  return importedTune
}

export function importedTuneFromNotationCandidate(abcTools, abcText, candidate) {
  const normalized = normalizeAbcForImport(abcText)
  const importedTune = abcTools.abc2json(normalized)
  if (candidate && candidate.tuneMeta) {
    applyNotationTuneMeta(importedTune, candidate.tuneMeta)
  }
  return importedTune
}
