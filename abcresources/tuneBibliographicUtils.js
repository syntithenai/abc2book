function normalizeKey(value) {
  return String(value || '').trim().toLowerCase()
}

function pushUnique(list, value, excludeKeys) {
  var text = String(value || '').trim()
  if (!text) return list
  var key = normalizeKey(text)
  if (excludeKeys && excludeKeys[key]) return list
  if (!Array.isArray(list)) list = []
  var seen = {}
  list.forEach(function(item) {
    seen[normalizeKey(item)] = true
  })
  if (seen[key]) return list
  return list.concat([text])
}

function mergeBibliographicList(list, values, excludeKeys) {
  var result = Array.isArray(list) ? list.slice() : []
  var items = Array.isArray(values) ? values : [values]
  items.forEach(function(value) {
    result = pushUnique(result, value, excludeKeys)
  })
  return result
}

function renderBibliographicTitleLines(tune) {
  var lines = []
  var name = tune && tune.name ? String(tune.name).trim() : ''
  if (name) lines.push('T: ' + name)
  if (tune && Array.isArray(tune.aliases)) {
    tune.aliases.forEach(function(alias) {
      var text = String(alias || '').trim()
      if (text) lines.push('T: ' + text)
    })
  }
  return lines
}

function renderBibliographicComposerLines(tune) {
  var lines = []
  var composer = tune && tune.composer ? String(tune.composer).trim() : ''
  if (composer) lines.push('C:' + composer)
  if (tune && Array.isArray(tune.artists)) {
    tune.artists.forEach(function(artist) {
      var text = String(artist || '').trim()
      if (text) lines.push('C:' + text)
    })
  }
  return lines
}

function normalizeBibliographicFields(tune) {
  if (!tune || typeof tune !== 'object') return tune

  if (!Array.isArray(tune.aliases)) tune.aliases = []
  if (!Array.isArray(tune.artists)) tune.artists = []

  var excludeTitleKeys = {}
  var primaryName = String(tune.name || '').trim()
  if (primaryName) excludeTitleKeys[normalizeKey(primaryName)] = true

  var excludeArtistKeys = {}
  var primaryComposer = String(tune.composer || '').trim()
  if (primaryComposer) excludeArtistKeys[normalizeKey(primaryComposer)] = true

  if (tune.meta && tune.meta.T != null) {
    var legacyTitles = Array.isArray(tune.meta.T) ? tune.meta.T : [tune.meta.T]
    tune.aliases = mergeBibliographicList(tune.aliases, legacyTitles, excludeTitleKeys)
    delete tune.meta.T
  }

  tune.aliases = mergeBibliographicList(tune.aliases, [], excludeTitleKeys)
    .filter(function(alias) { return normalizeKey(alias) !== normalizeKey(tune.name) })

  tune.artists = mergeBibliographicList(tune.artists, [], excludeArtistKeys)
    .filter(function(artist) { return normalizeKey(artist) !== normalizeKey(tune.composer) })

  return tune
}

function primaryArtist(tune) {
  var composer = String(tune && tune.composer || '').trim()
  if (composer) return composer
  var artists = tune && Array.isArray(tune.artists) ? tune.artists : []
  for (var i = 0; i < artists.length; i++) {
    var artist = String(artists[i] || '').trim()
    if (artist) return artist
  }
  return ''
}

module.exports = {
  mergeBibliographicList: mergeBibliographicList,
  normalizeBibliographicFields: normalizeBibliographicFields,
  renderBibliographicTitleLines: renderBibliographicTitleLines,
  renderBibliographicComposerLines: renderBibliographicComposerLines,
  primaryArtist: primaryArtist,
}
