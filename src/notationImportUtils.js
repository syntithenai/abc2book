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
    'genre',
    'backgroundInfo',
  ]

  scalarFields.forEach(function(fieldKey) {
    const value = tuneMeta[fieldKey]
    if (value === undefined || value === null || value === '') return
    importedTune[fieldKey] = value
  })

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
  const importedTune = abcTools.abc2json(abcText)
  if (candidate && candidate.tuneMeta) {
    applyNotationTuneMeta(importedTune, candidate.tuneMeta)
  }
  return importedTune
}
