import {
  buildTuneImportFieldRows,
  tunePairHasDifferingImportFields,
} from './tuneImportMergeUtils'

function tuneDisplayName(tune) {
  if (!tune) return '(untitled)'
  var name = String(tune.name || tune.title || '').trim()
  return name || '(untitled)'
}

function byName(a, b) {
  return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })
}

function tunesContentDiffer(a, b) {
  return tunePairHasDifferingImportFields(a, b) || tunePairHasDifferingImportFields(b, a)
}

function differingFieldLabels(currentTune, versionTune) {
  var labels = []
  var seen = {}
  function addFromRows(original, imported) {
    buildTuneImportFieldRows(original, imported).forEach(function(row) {
      if (!row.differs || seen[row.label]) return
      seen[row.label] = true
      labels.push(row.label)
    })
  }
  addFromRows(currentTune, versionTune)
  addFromRows(versionTune, currentTune)
  return labels
}

function indexTunesById(tunes) {
  var byId = {}
  if (!tunes) return byId
  if (Array.isArray(tunes)) {
    tunes.forEach(function(tune) {
      if (tune && tune.id) byId[tune.id] = tune
    })
  } else {
    Object.keys(tunes).forEach(function(id) {
      var tune = tunes[id]
      if (tune && tune.id) byId[tune.id] = tune
      else if (tune) byId[id] = Object.assign({}, tune, { id: id })
    })
  }
  return byId
}

/**
 * Summarize content differences between the current songbook and a backup/version.
 * Comparison is by tune id and import-field content (not timestamps).
 *
 * @returns {{
 *   onlyInVersion: Array<{id: string, name: string}>,
 *   onlyInCurrent: Array<{id: string, name: string}>,
 *   changed: Array<{id: string, name: string, fields: string[]}>,
 *   totalChanges: number,
 * }}
 */
export function summarizeBackupDiff(currentTunes, versionTunes) {
  var currentById = indexTunesById(currentTunes)
  var versionById = indexTunesById(versionTunes)
  var onlyInVersion = []
  var onlyInCurrent = []
  var changed = []

  Object.keys(versionById).forEach(function(id) {
    var versionTune = versionById[id]
    var currentTune = currentById[id]
    if (!currentTune) {
      onlyInVersion.push({ id: id, name: tuneDisplayName(versionTune) })
      return
    }
    if (!tunesContentDiffer(currentTune, versionTune)) return
    changed.push({
      id: id,
      name: tuneDisplayName(currentTune),
      fields: differingFieldLabels(currentTune, versionTune),
      currentTune: currentTune,
      versionTune: versionTune,
    })
  })

  Object.keys(currentById).forEach(function(id) {
    if (versionById[id]) return
    onlyInCurrent.push({ id: id, name: tuneDisplayName(currentById[id]) })
  })

  onlyInVersion.sort(byName)
  onlyInCurrent.sort(byName)
  changed.sort(byName)

  return {
    onlyInVersion: onlyInVersion,
    onlyInCurrent: onlyInCurrent,
    changed: changed,
    totalChanges: onlyInVersion.length + onlyInCurrent.length + changed.length,
  }
}
