import axios from 'axios'
import utilsFunctions from './utilsFunctions'
import { buildLocalAbcChordCandidate } from './localAbcChordSheet'
import { getPlainLyricLines } from './wLinesUtils'
import { lyricsPreview } from './lyricsParseUtils'
import {
  compareSearchResults,
  LOCAL_SEARCH_DISPLAY_LIMIT,
  LOCAL_SEARCH_INTERNAL_LIMIT,
  collectionLabelForIds,
  scoreSearchResult,
  tokenizeSearchQuery,
} from './textSearchIndexUtils'
import { getResourceBase, resourceUrl } from './resourceBase'

const COLLECTION_FILE_PATHS = [
  'abcresources/folktunefinder/abc_tune_folktunefinder_',
  'abcresources/thesession/abc_tune_thesession_',
  'abcresources/jimsroots/abc_tune_jimsroots_',
  'abcresources/misc/abc_tune_misc_',
  'abcresources/norbeck/abc_tune_norbeck_',
  'abcresources/folkinfo/abc_tune_folkinfo_',
]
const COLLECTION_FILE_EXTENSIONS = ['.txt', '.abc', '.abc', '.abc', '.abc', '.abc']

let cachedTextSearchIndex = null
let indexLoadPromise = null

const utils = utilsFunctions()

export function clearLocalAbcCollectionIndexCache() {
  cachedTextSearchIndex = null
  indexLoadPromise = null
}

export async function loadTextSearchIndexFromResource(existingIndex) {
  if (existingIndex && existingIndex.tokens && Object.keys(existingIndex.tokens).length > 0) {
    cachedTextSearchIndex = existingIndex
    return existingIndex
  }
  if (cachedTextSearchIndex && cachedTextSearchIndex.tokens) {
    return cachedTextSearchIndex
  }
  if (!indexLoadPromise) {
    indexLoadPromise = axios.get(resourceUrl('textsearch_index.json'))
      .then(function(response) {
        cachedTextSearchIndex = response.data || {}
        return cachedTextSearchIndex
      })
      .catch(function() {
        cachedTextSearchIndex = {}
        return cachedTextSearchIndex
      })
      .finally(function() {
        indexLoadPromise = null
      })
  }
  return indexLoadPromise
}

export function searchLocalCollection(text, textSearchIndex) {
  if (!text || !String(text).trim()) return []
  const index = textSearchIndex || cachedTextSearchIndex
  if (!index || !index.tokens) return []

  const parts = tokenizeSearchQuery(text, utils.stripCommonWords)
  if (parts.length === 0) return []

  const matches = {}
  parts.forEach(function(part) {
    if (index.tokens.hasOwnProperty(part) && Array.isArray(index.tokens[part])) {
      index.tokens[part].forEach(function(matchItem) {
        if (!matches[matchItem]) matches[matchItem] = 0
        matches[matchItem] += 1
      })
    }
  })

  const allMatchIds = Object.keys(matches)
  const andMatchIds = allMatchIds.filter(function(matchId) {
    return matches[matchId] >= parts.length
  })
  const candidateIds = andMatchIds.length > 0 ? andMatchIds : allMatchIds

  const seen = {}
  candidateIds.forEach(function(matchId) {
    const name = utils.stripText(index.lookups[matchId])
    if (!name) return
    const lowerName = name.toLowerCase()
    if (!seen[lowerName]) {
      seen[lowerName] = { ids: [], indexTokenScore: 0 }
    }
    seen[lowerName].ids.push(matchId)
    seen[lowerName].indexTokenScore = Math.max(
      seen[lowerName].indexTokenScore,
      matches[matchId] || 0
    )
  })

  let final = Object.keys(seen).map(function(seenName) {
    const entry = seen[seenName]
    const scored = scoreSearchResult(text, seenName, entry.indexTokenScore, parts)
    return {
      ids: entry.ids,
      name: seenName,
      score: scored.score,
      matchedTokenCount: scored.matchedTokenCount,
      queryTokenCount: scored.queryTokenCount,
      tokenCoverage: scored.tokenCoverage,
    }
  })

  final.sort(compareSearchResults)

  if (parts.length > 1) {
    final = final.filter(function(result) {
      return result.matchedTokenCount > 0
        && (result.matchedTokenCount === parts.length || result.tokenCoverage >= 0.5)
    })
  }

  final = final.slice(0, LOCAL_SEARCH_INTERNAL_LIMIT)
  return final.slice(0, LOCAL_SEARCH_DISPLAY_LIMIT)
}

export async function loadAbcTextsFromIndexIds(tuneIds, abcTools) {
  if (!Array.isArray(tuneIds) || tuneIds.length === 0 || !abcTools) return []

  const promises = []
  tuneIds.forEach(function(tuneId) {
    const tuneIdParts = String(tuneId).split('-')
    const collectionNumber = parseInt(tuneIdParts[0], 10)
    const fileNumber = tuneIdParts[1]
    const tuneNumber = tuneIdParts[2]
    if (!Number.isFinite(collectionNumber)
      || collectionNumber < 0
      || collectionNumber >= COLLECTION_FILE_PATHS.length) {
      return
    }
    const filePath = COLLECTION_FILE_PATHS[collectionNumber]
    const extension = COLLECTION_FILE_EXTENSIONS[collectionNumber]
    const base = getResourceBase() ? getResourceBase() + '/' : ''
    const url = base + filePath + fileNumber + extension
    promises.push(
      axios.get(url).then(function(results) {
        return [tuneNumber, results]
      })
    )
  })

  if (promises.length === 0) return []

  const extractData = await Promise.all(promises)
  return extractData.map(function(bookTextAndKey) {
    const bookText = bookTextAndKey[1].data
    const tuneKey = bookTextAndKey[0]
    const tunes = abcTools.abc2Tunebook(bookText)
    if (Array.isArray(tunes) && tunes.length > tuneKey && tunes[tuneKey]) {
      return abcTools.json2abc(tunes[tuneKey])
    }
    return null
  }).filter(Boolean)
}

export function localCollectionSourceLabel(result) {
  return collectionLabelForIds(result && result.ids)
}

export async function searchLocalCollectionNotation(options) {
  const opts = options || {}
  const title = opts.title ? String(opts.title).trim() : ''
  if (!title) return []

  const index = opts.textSearchIndex || await loadTextSearchIndexFromResource()
  const results = searchLocalCollection(title, index)
  if (!results.length || !opts.abcTools) return []

  const candidates = []
  const limit = typeof opts.limit === 'number' ? opts.limit : 8

  for (let i = 0; i < Math.min(results.length, limit); i += 1) {
    const result = results[i]
    const settings = await loadAbcTextsFromIndexIds(result.ids, opts.abcTools)
    settings.forEach(function(abcText, settingIndex) {
      if (!abcText || String(abcText).indexOf('K:') === -1) return
      const source = localCollectionSourceLabel(result)
      const settingTitle = settings.length > 1
        ? result.name + ' — setting ' + (settingIndex + 1)
        : result.name
      candidates.push({
        abc: abcText,
        title: settingTitle,
        artist: '',
        source: source || 'local collection',
        sourceUrl: '',
        preview: abcPreview(abcText),
        titleOnly: false,
      })
    })
  }

  return candidates
}

async function loadTunesFromIndexIds(tuneIds, abcTools) {
  if (!Array.isArray(tuneIds) || tuneIds.length === 0 || !abcTools) return []

  const promises = []
  tuneIds.forEach(function(tuneId) {
    const tuneIdParts = String(tuneId).split('-')
    const collectionNumber = parseInt(tuneIdParts[0], 10)
    const fileNumber = tuneIdParts[1]
    const tuneNumber = tuneIdParts[2]
    if (!Number.isFinite(collectionNumber)
      || collectionNumber < 0
      || collectionNumber >= COLLECTION_FILE_PATHS.length) {
      return
    }
    const filePath = COLLECTION_FILE_PATHS[collectionNumber]
    const extension = COLLECTION_FILE_EXTENSIONS[collectionNumber]
    const base = getResourceBase() ? getResourceBase() + '/' : ''
    const url = base + filePath + fileNumber + extension
    promises.push(
      axios.get(url).then(function(results) {
        return [tuneNumber, results]
      })
    )
  })

  if (promises.length === 0) return []

  const extractData = await Promise.all(promises)
  return extractData.map(function(bookTextAndKey) {
    const bookText = bookTextAndKey[1].data
    const tuneKey = bookTextAndKey[0]
    const tunes = abcTools.abc2Tunebook(bookText)
    if (Array.isArray(tunes) && tunes.length > tuneKey && tunes[tuneKey]) {
      return tunes[tuneKey]
    }
    return null
  }).filter(Boolean)
}

export async function searchLocalCollectionLyrics(options) {
  const opts = options || {}
  const title = opts.title ? String(opts.title).trim() : ''
  if (!title) return []

  const index = opts.textSearchIndex || await loadTextSearchIndexFromResource()
  const results = searchLocalCollection(title, index)
  if (!results.length || !opts.abcTools) return []

  const candidates = []
  const limit = typeof opts.limit === 'number' ? opts.limit : 8

  for (let i = 0; i < Math.min(results.length, limit); i += 1) {
    const result = results[i]
    const tunes = await loadTunesFromIndexIds(result.ids, opts.abcTools)
    tunes.forEach(function(tune, settingIndex) {
      const lines = getPlainLyricLines(tune)
      if (!lines.length) return
      const text = lines.join('\n')
      const source = localCollectionSourceLabel(result)
      const settingTitle = tunes.length > 1
        ? result.name + ' — setting ' + (settingIndex + 1)
        : result.name
      candidates.push({
        text: text,
        lines: lines,
        stanzas: [],
        title: settingTitle,
        artist: (tune && tune.composer) ? String(tune.composer) : '',
        source: source || 'local collection',
        sourceUrl: '',
        preview: lyricsPreview(lines),
        titleOnly: false,
      })
    })
  }

  return candidates
}

export async function searchLocalCollectionChords(options) {
  const opts = options || {}
  const title = opts.title ? String(opts.title).trim() : ''
  if (!title) return []

  const index = opts.textSearchIndex || await loadTextSearchIndexFromResource()
  const results = searchLocalCollection(title, index)
  if (!results.length || !opts.abcTools || typeof opts.renderChords !== 'function') return []

  const candidates = []
  const limit = typeof opts.limit === 'number' ? opts.limit : 8

  for (let i = 0; i < Math.min(results.length, limit); i += 1) {
    const result = results[i]
    const tunes = await loadTunesFromIndexIds(result.ids, opts.abcTools)
    tunes.forEach(function(tune, settingIndex) {
      if (!tune) return
      let abcText = ''
      try {
        abcText = opts.abcTools.json2abc(tune)
      } catch (e) {
        return
      }
      const source = localCollectionSourceLabel(result)
      const settingTitle = tunes.length > 1
        ? result.name + ' — setting ' + (settingIndex + 1)
        : result.name
      const candidate = buildLocalAbcChordCandidate(abcText, tune, {
        title: settingTitle,
        artist: tune.composer ? String(tune.composer) : '',
        source: source || 'local collection',
        sourceUrl: '',
      }, opts.abcTools, opts.renderChords)
      if (candidate) candidates.push(candidate)
    })
  }

  return candidates
}

function abcPreview(abcText, maxLines) {
  const lines = String(abcText || '').split('\n').filter(function(line) {
    return line.trim()
  })
  return lines.slice(0, maxLines || 6).join('\n')
}
