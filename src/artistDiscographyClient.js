import axios from 'axios'
import {
  cleanImportTitleForMatching,
  preferCleanImportTitle,
} from './importTitleMatch'

const MUSICBRAINZ_BASE = 'https://musicbrainz.org/ws/2'
const CLIENT_USER_AGENT = 'ABC2Book/1.0 (https://tunebook.net)'
const PAGE_SIZE = 100
const PAGE_DELAY_MS = 1000

function mbRequestConfig(signal) {
  return {
    headers: { 'User-Agent': CLIENT_USER_AGENT },
    signal: signal,
  }
}

function delay(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms)
  })
}

function emitProgress(onProgress, message, progress) {
  if (typeof onProgress === 'function') {
    onProgress(message, progress)
  }
}

function levenshteinDistance(a, b) {
  const left = String(a || '')
  const right = String(b || '')
  if (left === right) return 0
  if (!left.length) return right.length
  if (!right.length) return left.length
  const matrix = []
  for (let i = 0; i <= right.length; i += 1) matrix[i] = [i]
  for (let j = 0; j <= left.length; j += 1) matrix[0][j] = j
  for (let i = 1; i <= right.length; i += 1) {
    for (let j = 1; j <= left.length; j += 1) {
      if (right.charAt(i - 1) === left.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }
  return matrix[right.length][left.length]
}

export function discographyTitlesMatch(titleA, titleB) {
  const cleanA = cleanImportTitleForMatching(titleA)
  const cleanB = cleanImportTitleForMatching(titleB)
  if (!cleanA || !cleanB) return false
  if (cleanA === cleanB) return true

  const rawA = String(titleA || '').trim()
  const rawB = String(titleB || '').trim()
  const shorter = cleanA.length <= cleanB.length ? cleanA : cleanB
  const longer = cleanA.length > cleanB.length ? cleanA : cleanB
  const rawLonger = cleanA.length > cleanB.length ? rawA : rawB
  if (
    longer.indexOf(shorter) === 0
    && shorter.length >= 4
    && /\([^)]+\)\s*$/.test(rawLonger)
  ) {
    return true
  }

  const tokensA = cleanA.split(/\s+/).filter(Boolean)
  const tokensB = cleanB.split(/\s+/).filter(Boolean)
  if (tokensA.length !== tokensB.length || tokensA.length === 0) return false
  let mismatches = 0
  for (let i = 0; i < tokensA.length; i += 1) {
    if (tokensA[i] === tokensB[i]) continue
    if (
      tokensA[i].length >= 4
      && tokensB[i].length >= 4
      && levenshteinDistance(tokensA[i], tokensB[i]) <= 1
    ) {
      mismatches += 1
      continue
    }
    return false
  }
  return mismatches === 1
}

export function dedupeDiscographyTitles(titles) {
  const kept = []
  ;(Array.isArray(titles) ? titles : []).forEach(function(title) {
    const text = String(title || '').trim()
    if (!text) return
    let matchIndex = -1
    for (let i = 0; i < kept.length; i += 1) {
      if (discographyTitlesMatch(text, kept[i])) {
        matchIndex = i
        break
      }
    }
    if (matchIndex < 0) {
      kept.push(text)
      return
    }
    kept[matchIndex] = preferCleanImportTitle(kept[matchIndex], text)
  })
  return kept.sort(function(a, b) {
    return a.localeCompare(b, undefined, { sensitivity: 'base' })
  })
}

export async function resolveArtistMbid(name, signal, onProgress) {
  const query = String(name || '').trim()
  if (!query) return null
  emitProgress(onProgress, 'Looking up artist…', 5)
  const response = await axios.get(MUSICBRAINZ_BASE + '/artist', {
    params: { query: query, fmt: 'json', limit: 25 },
    ...mbRequestConfig(signal),
  })
  const artists = (response.data && response.data.artists) || []
  if (!artists.length) return null
  const exact = artists.find(function(artist) {
    return artist && artist.name && artist.name.toLowerCase() === query.toLowerCase()
  })
  const chosen = exact || artists[0]
  if (!chosen || !chosen.id) return null
  return { id: chosen.id, name: chosen.name }
}

async function paginateMusicBrainz(fetchPage, signal, pageDelayMs, pageSize, onProgress, progressBase, progressSpan, label) {
  const items = []
  let offset = 0
  let total = null
  let pageIndex = 0
  while (total === null || offset < total) {
    if (pageIndex > 0) await delay(pageDelayMs)
    if (signal && signal.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    const pageNumber = pageIndex + 1
    const pageLabel = total != null && total > pageSize
      ? label + ' (page ' + pageNumber + ')…'
      : label + '…'
    const pageProgress = progressBase + (progressSpan * Math.min(0.9, pageIndex / Math.max(1, Math.ceil(total / pageSize) || 1)))
    emitProgress(onProgress, pageLabel, pageProgress)
    const page = await fetchPage(offset)
    total = typeof page.total === 'number' ? page.total : (page.items || []).length
    ;(page.items || []).forEach(function(item) {
      items.push(item)
    })
    if (total > 0 && items.length > 0) {
      emitProgress(
        onProgress,
        label + ' (' + items.length + (total > items.length ? ' of ' + total : '') + ')…',
        progressBase + (progressSpan * Math.min(0.95, items.length / total))
      )
    }
    if (!(page.items || []).length) break
    offset += pageSize
    pageIndex += 1
    if ((page.items || []).length < pageSize) break
  }
  return items
}

async function fetchRecordingTitles(mbid, signal, pageDelayMs, pageSize, onProgress) {
  return paginateMusicBrainz(function(offset) {
    return axios.get(MUSICBRAINZ_BASE + '/recording', {
      params: {
        query: 'arid:' + mbid,
        fmt: 'json',
        limit: pageSize,
        offset: offset,
      },
      ...mbRequestConfig(signal),
    }).then(function(response) {
      const data = response.data || {}
      return {
        total: typeof data['recording-count'] === 'number' ? data['recording-count'] : 0,
        items: (data.recordings || []).map(function(recording) {
          return recording && recording.title ? recording.title : ''
        }).filter(Boolean),
      }
    })
  }, signal, pageDelayMs, pageSize, onProgress, 15, 55, 'Fetching recordings')
}

async function fetchWorkTitles(mbid, signal, pageDelayMs, pageSize, onProgress) {
  return paginateMusicBrainz(function(offset) {
    return axios.get(MUSICBRAINZ_BASE + '/work', {
      params: {
        artist: mbid,
        fmt: 'json',
        limit: pageSize,
        offset: offset,
      },
      ...mbRequestConfig(signal),
    }).then(function(response) {
      const data = response.data || {}
      return {
        total: typeof data['work-count'] === 'number' ? data['work-count'] : 0,
        items: (data.works || []).map(function(work) {
          return work && work.title ? work.title : ''
        }).filter(Boolean),
      }
    })
  }, signal, pageDelayMs, pageSize, onProgress, 70, 25, 'Fetching compositions')
}

export async function fetchArtistDiscography(artistName, options) {
  const opts = options || {}
  const signal = opts.signal
  const onProgress = opts.onProgress
  const pageDelayMs = typeof opts.pageDelayMs === 'number' ? opts.pageDelayMs : PAGE_DELAY_MS
  const pageSize = typeof opts.pageSize === 'number' ? opts.pageSize : PAGE_SIZE
  const queryName = String(artistName || '').trim()
  if (!queryName) {
    return { titles: [], artistName: '', artistMbid: '' }
  }

  const resolved = await resolveArtistMbid(queryName, signal, onProgress)
  if (!resolved) {
    emitProgress(onProgress, 'Artist not found', 100)
    return { titles: [], artistName: queryName, artistMbid: '' }
  }

  emitProgress(onProgress, 'Found ' + resolved.name + ' — loading discography…', 10)
  const recordingTitles = await fetchRecordingTitles(
    resolved.id, signal, pageDelayMs, pageSize, onProgress
  )
  const workTitles = await fetchWorkTitles(
    resolved.id, signal, pageDelayMs, pageSize, onProgress
  )
  emitProgress(onProgress, 'Building song list…', 95)
  const titles = dedupeDiscographyTitles(recordingTitles.concat(workTitles))
  emitProgress(onProgress, 'Found ' + titles.length + ' song' + (titles.length === 1 ? '' : 's'), 100)

  return {
    titles: titles,
    artistName: resolved.name,
    artistMbid: resolved.id,
  }
}
