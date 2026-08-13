import { searchChords } from './chordsSearchClient'
import { searchLyrics } from './lyricsSearchClient'
import { searchNotation } from './notationSearchClient'
import { commitChordSearchResultToTune } from './commitChordSearchResultToTune'
import { pickUltimateGuitarPasteCandidate, pickNotationPasteCandidate, isUltimateGuitarUrl } from './chordSearchSites'
import { pickAutoApplyNotationCandidate, hasSolidAbcNotationMatch, pickRankedSolidAbcNotationCandidate } from './notationMatchUtils'
import { inferNotationSongType } from './textSearchIndexUtils'
import {
  applyCandidateToTune,
  historyLabelForKind,
  isTuneFieldEmptyForKind,
} from './fieldLookupApplyUtils'
import { enrichTuneMetadataFromMusicBrainz } from './tuneMetadataEnhance'
import { isAbortError } from './abortUtils'

export { shouldSkipAbcMergeForChordPaste } from './chordPastePolicy'

const enrichByTuneId = {}
const listeners = new Set()
const activeEnrichAbortByTuneId = {}

export function dismissAddTuneAutoEnrichSummary(tuneId) {
  const key = String(tuneId || '').trim()
  if (!key || !enrichByTuneId[key] || !enrichByTuneId[key].summary) return
  enrichByTuneId[key] = Object.assign({}, enrichByTuneId[key], { summary: '' })
  notify()
}

function searchSourceLabel(candidate, fallback) {
  if (!candidate || typeof candidate !== 'object') return ''
  if (candidate.source) return String(candidate.source)
  if (candidate.sourceUrl) {
    try {
      return new URL(String(candidate.sourceUrl)).hostname.replace(/^www\./, '')
    } catch (e) {
      return String(candidate.sourceUrl)
    }
  }
  return fallback || ''
}

function formatEnrichmentSummary(parts) {
  const items = []
  if (parts.chords) items.push('Chords from ' + parts.chords)
  if (parts.lyrics) items.push('Lyrics from ' + parts.lyrics)
  if (parts.notation) items.push('Notation from ' + parts.notation)
  if (parts.composer) items.push('Artist from ' + parts.composer)
  if (parts.artists) items.push('Performers from MusicBrainz')
  if (parts.albums) items.push('Albums from MusicBrainz')
  if (parts.genre) items.push('Genre: ' + parts.genre)
  if (!items.length) return ''
  if (parts.missing && parts.missing.length) {
    items.push('Not found: ' + parts.missing.join(', '))
  }
  return items.join(' · ')
}

function buildEnrichmentSummary(tune, parts) {
  const chordApplied = !!parts.chordApplied
  const lyricApplied = !!parts.lyricApplied
  const notationApplied = !!parts.notationApplied
  const notationAttempted = !!parts.notationAttempted
  const missing = []
  if (!chordApplied && isTuneFieldEmptyForKind(tune, 'chords')) missing.push('chords')
  if (!lyricApplied && isTuneFieldEmptyForKind(tune, 'lyrics')) missing.push('lyrics')
  if (notationAttempted && !notationApplied && notationLooksReplaceable(tune)) missing.push('notation')
  return formatEnrichmentSummary({
    chords: parts.chordSource,
    lyrics: parts.lyricSource,
    notation: parts.notationSource,
    composer: parts.composer,
    artists: parts.artists,
    albums: parts.albums,
    genre: parts.genre,
    missing: missing,
  })
}

function emptyState() {
  return {
    pending: false,
    progress: 0,
    message: '',
    failure: '',
    needsChordPaste: false,
    chordPasteCandidate: null,
    chordManualCandidates: [],
    needsNotationPaste: false,
    notationPasteCandidate: null,
    notationManualCandidates: [],
    musescorePaywalled: false,
    summary: '',
  }
}

function notify() {
  listeners.forEach(function(listener) {
    try {
      listener()
    } catch (e) {
      console.log(e)
    }
  })
}

function updateState(tuneId, patch) {
  const key = String(tuneId || '').trim()
  if (!key) return
  const controller = activeEnrichAbortByTuneId[key]
  if (controller && controller.signal.aborted) return
  enrichByTuneId[key] = Object.assign({}, emptyState(), enrichByTuneId[key] || {}, patch)
  notify()
}

function clearState(tuneId) {
  const key = String(tuneId || '').trim()
  if (!key) return
  delete enrichByTuneId[key]
  notify()
}

function stateIsIdle(state) {
  return !state.pending
    && !state.failure
    && !state.needsChordPaste
    && !state.needsNotationPaste
}

export function subscribeAddTuneAutoEnrich(listener) {
  listeners.add(listener)
  return function unsubscribe() {
    listeners.delete(listener)
  }
}

export function getAddTuneAutoEnrichState(tuneId) {
  const key = String(tuneId || '').trim()
  return enrichByTuneId[key] || emptyState()
}

export function isAddTuneAutoEnrichPending(tuneId) {
  return !!getAddTuneAutoEnrichState(tuneId).pending
}

export function cancelAddTuneAutoEnrich(tuneId) {
  const key = String(tuneId || '').trim()
  if (!key) return
  const controller = activeEnrichAbortByTuneId[key]
  if (controller) controller.abort()
  clearState(tuneId)
}

export function dismissAddTuneAutoEnrichFailure(tuneId) {
  const key = String(tuneId || '').trim()
  if (!key || !enrichByTuneId[key]) return
  const next = Object.assign({}, enrichByTuneId[key], {
    failure: '',
    needsChordPaste: false,
    chordPasteCandidate: null,
    chordManualCandidates: [],
    needsNotationPaste: false,
    notationPasteCandidate: null,
    notationManualCandidates: [],
    message: '',
  })
  if (stateIsIdle(next)) {
    delete enrichByTuneId[key]
  } else {
    enrichByTuneId[key] = next
  }
  notify()
}

export function dismissAddTuneAutoEnrichChordPaste(tuneId) {
  const key = String(tuneId || '').trim()
  if (!key || !enrichByTuneId[key]) return
  const next = Object.assign({}, enrichByTuneId[key], {
    needsChordPaste: false,
    chordPasteCandidate: null,
    chordManualCandidates: [],
    message: enrichByTuneId[key].needsNotationPaste
      ? (enrichByTuneId[key].message || '')
      : '',
  })
  if (stateIsIdle(next)) {
    delete enrichByTuneId[key]
  } else {
    enrichByTuneId[key] = next
  }
  notify()
}

/**
 * Seed single-view Ultimate Guitar paste warning when chord search found
 * concrete UG tabs but chords were not auto-applied.
 */
export function offerAddTuneAutoEnrichChordPaste(tuneId, options) {
  const key = String(tuneId || '').trim()
  if (!key) return false
  const opts = options && typeof options === 'object' ? options : {}
  const manuals = Array.isArray(opts.manualCandidates) ? opts.manualCandidates : []
  const ugManuals = manuals.filter(function(item) {
    return item && item.url && isUltimateGuitarUrl(item.url)
  })
  const candidate = opts.chordPasteCandidate
    || pickUltimateGuitarPasteCandidate(manuals)
  if (!candidate || !candidate.url) return false
  const existing = enrichByTuneId[key] || emptyState()
  if (existing.pending) return false
  updateState(tuneId, {
    pending: false,
    progress: 100,
    message: opts.message || 'Chords need a manual paste from Ultimate Guitar.',
    failure: '',
    needsChordPaste: true,
    chordPasteCandidate: candidate,
    chordManualCandidates: ugManuals.length ? ugManuals : manuals.filter(function(item) {
      return item && item.url
    }),
    summary: existing.summary || '',
  })
  return true
}

export function dismissAddTuneAutoEnrichNotationPaste(tuneId) {
  const key = String(tuneId || '').trim()
  if (!key || !enrichByTuneId[key]) return
  const next = Object.assign({}, enrichByTuneId[key], {
    needsNotationPaste: false,
    notationPasteCandidate: null,
    notationManualCandidates: [],
    message: enrichByTuneId[key].needsChordPaste
      ? (enrichByTuneId[key].message || '')
      : '',
  })
  if (stateIsIdle(next)) {
    delete enrichByTuneId[key]
  } else {
    enrichByTuneId[key] = next
  }
  notify()
}

export function pickFirstSearchCandidate(result) {
  if (!result || typeof result !== 'object') return null
  if (Array.isArray(result.candidates)) {
    return result.candidates[0] || null
  }
  if (result.empty) return null
  if (
    result.chordText
    || result.chordProSource
    || result.abc
    || result.text
    || Array.isArray(result.lines)
    || Array.isArray(result.sheetLines)
  ) {
    return result
  }
  return null
}

export function manualCandidatesFromSearchResult(result) {
  if (!result || typeof result !== 'object') return []
  if (!Array.isArray(result.manualCandidates)) return []
  return result.manualCandidates.filter(function(item) {
    return item && item.url
  })
}

/**
 * Whether notation is empty/rest-only and may receive chord scaffold merge.
 */
function notationLooksReplaceable(tune) {
  if (!tune || !tune.voices || typeof tune.voices !== 'object') return true
  const voiceKeys = Object.keys(tune.voices)
  if (voiceKeys.length === 0) return true
  let hasMusic = false
  let hasOnlyRests = true
  voiceKeys.forEach(function(key) {
    const notes = tune.voices[key] && Array.isArray(tune.voices[key].notes)
      ? tune.voices[key].notes
      : []
    notes.forEach(function(line) {
      const text = String(line || '').trim()
      if (!text) return
      const withoutChordSymbols = text.replace(/"[^"]*"/g, '')
      if (/[A-Ga-g]/.test(withoutChordSymbols)) hasMusic = true
      if (!/^[\s|:[\]0-9/'",._~()-]*z[\s|:[\]0-9/'",._~()-]*$/i.test(withoutChordSymbols)) {
        hasOnlyRests = false
      }
    })
  })
  if (!hasMusic) return true
  return hasOnlyRests
}

function saveAppliedCandidate(tune, kind, candidate, tunebook, forceRefresh) {
  const applied = applyCandidateToTune(tune, kind, candidate, tunebook && tunebook.abcTools)
  if (!applied) return false
  tunebook.saveTune(tune, false, {
    historyLabel: historyLabelForKind(kind),
    immediate: true,
  })
  if (typeof forceRefresh === 'function') forceRefresh()
  return true
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)))
}

function fractionProgress(progress) {
  if (typeof progress !== 'number' || !isFinite(progress)) return null
  if (progress > 1) return Math.max(0, Math.min(1, progress / 100))
  return Math.max(0, Math.min(1, progress))
}

export async function runAddTuneAutoEnrich(options) {
  const opts = options || {}
  const tune = opts.tune
  const tuneId = tune && tune.id ? tune.id : null
  if (!tuneId || !tune || !opts.tunebook) return false

  const title = String(tune.name || '').trim()
  const artist = String(tune.composer || '').trim()
  if (!title) return false
  const songType = opts.songType || inferNotationSongType(tune.rhythm || '', artist)

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const signal = controller ? controller.signal : undefined
  activeEnrichAbortByTuneId[tuneId] = controller

  function isCancelled() {
    return !!(controller && controller.signal.aborted)
  }

  function swallowAbort(promise) {
    if (!promise || typeof promise.catch !== 'function') return promise
    return promise.catch(function(e) {
      if (isAbortError(e) || isCancelled()) return null
      throw e
    })
  }

  function notationPickOptions() {
    return {
      songType: songType,
      preferMuseScoreImport: songType === 'song' && !!artist,
    }
  }

  let chordFrac = 0
  let lyricFrac = 0
  let lastMessage = 'Searching for chords and lyrics...'

  function emitParallelProgress() {
    if (isCancelled()) return
    const avg = (chordFrac + lyricFrac) / 2
    updateState(tuneId, {
      pending: true,
      progress: clampPercent(5 + avg * 65),
      message: lastMessage,
      failure: '',
      needsChordPaste: false,
      chordPasteCandidate: null,
      chordManualCandidates: [],
    })
  }

  updateState(tuneId, {
    pending: true,
    progress: 2,
    message: lastMessage,
    failure: '',
    needsChordPaste: false,
    chordPasteCandidate: null,
    chordManualCandidates: [],
  })

  let lyricApplied = !isTuneFieldEmptyForKind(tune, 'lyrics')
  let chordApplied = !isTuneFieldEmptyForKind(tune, 'chords')
  // Rest-only scaffolds count as empty for enrichment purposes.
  let notationApplied = !notationLooksReplaceable(tune)
  let lyricsSearchFailed = false
  let notationSearchFailed = false
  let notationAttempted = false
  let chordManualCandidates = []
  let notationManualCandidates = []
  let notationMusescorePaywalled = false
  let notationSettledResult = null
  let chordSource = chordApplied ? 'already on tune' : ''
  let lyricSource = lyricApplied ? 'already on tune' : ''
  let notationSource = notationApplied ? 'already on tune' : ''
  let metadataComposer = ''
  let metadataArtists = ''
  let metadataAlbums = ''
  let metadataGenre = ''

  try {
    if (artist) {
    const chordPromise = swallowAbort(searchChords({
      title: title,
      artist: artist,
      accessToken: opts.accessToken || '',
      resolverAvailable: opts.resolverAvailable,
      signal: signal,
      abcTools: opts.tunebook.abcTools || null,
      renderChords: opts.abcjsParser && typeof opts.abcjsParser.renderChords === 'function'
        ? function(abc) { return opts.abcjsParser.renderChords(abc, true) }
        : undefined,
      onProgress: function(message, progress) {
        if (isCancelled()) return
        const frac = fractionProgress(progress)
        if (frac != null) chordFrac = frac
        if (message) lastMessage = String(message)
        emitParallelProgress()
      },
    }))
    const lyricPromise = swallowAbort(searchLyrics({
      title: title,
      artist: artist,
      accessToken: opts.accessToken || '',
      resolverAvailable: opts.resolverAvailable,
      signal: signal,
      abcTools: opts.tunebook.abcTools || null,
      onProgress: function(message, progress) {
        if (isCancelled()) return
        const frac = fractionProgress(progress)
        if (frac != null) lyricFrac = frac
        if (message) lastMessage = String(message)
        emitParallelProgress()
      },
    }))
    // Start notation early so instrumental tunes (e.g. The Session) are not
    // blocked behind long chords/lyrics searches.
    // Settle immediately so a fast miss cannot become an unhandled rejection
    // while chords/lyrics are still running.
    const notationSettled = searchNotation({
      title: title,
      artist: artist,
      accessToken: opts.accessToken || '',
      resolverAvailable: opts.resolverAvailable,
      signal: signal,
      abcTools: opts.tunebook.abcTools || null,
      searchIndex: opts.searchIndex || null,
      loadTuneTexts: opts.loadTuneTexts || null,
      songType: songType,
      onProgress: function(message, progress) {
        if (isCancelled()) return
        // Keep early notation progress quiet while chords/lyrics own the bar;
        // surface it once those parallel searches have finished.
        if (chordFrac < 1 || lyricFrac < 1) return
        const frac = fractionProgress(progress)
        updateState(tuneId, {
          pending: true,
          progress: clampPercent(55 + (frac != null ? frac : 0) * 40),
          message: message ? String(message) : 'Searching for notation...',
          failure: '',
          needsChordPaste: false,
        })
      },
    }).then(
      function(value) { return { ok: true, value: value } },
      function(error) { return { ok: false, error: error } }
    )

    try {
      updateState(tuneId, {
        pending: true,
        progress: clampPercent(Math.max(getAddTuneAutoEnrichState(tuneId).progress, 10)),
        message: lastMessage || 'Searching for chords...',
        failure: '',
      })
      const chordResult = await chordPromise
      if (isCancelled()) return false
      chordFrac = 1
      emitParallelProgress()
      chordManualCandidates = manualCandidatesFromSearchResult(chordResult)
      const chordCandidate = pickFirstSearchCandidate(chordResult)
      if (chordCandidate) {
        updateState(tuneId, {
          pending: true,
          progress: clampPercent(Math.max(getAddTuneAutoEnrichState(tuneId).progress, 40)),
          message: 'Applying chord results...',
          failure: '',
        })
        const committed = commitChordSearchResultToTune({
          result: chordCandidate,
          tune: tune,
          tunebook: opts.tunebook,
          abcjsParser: opts.abcjsParser,
          updateLyrics: true,
          historyLabel: 'Search chords and lyrics',
        })
        if (committed && committed.ok) {
          if (typeof opts.forceRefresh === 'function') opts.forceRefresh()
          chordApplied = true
          chordSource = searchSourceLabel(chordCandidate, 'chord search')
          lyricApplied = lyricApplied || !!(committed.lyricLines && committed.lyricLines.some(function(line) {
            return String(line || '').trim()
          }))
          if (lyricApplied && !lyricSource) {
            lyricSource = searchSourceLabel(chordCandidate, 'chord search')
          }
        }
      }
    } catch (e) {
      if (isCancelled()) return false
    }

    if (isCancelled()) return false

    try {
      updateState(tuneId, {
        pending: true,
        progress: clampPercent(Math.max(getAddTuneAutoEnrichState(tuneId).progress, 45)),
        message: lastMessage || 'Searching for lyrics...',
        failure: '',
      })
      const lyricCandidate = pickFirstSearchCandidate(await lyricPromise)
      if (isCancelled()) return false
      lyricFrac = 1
      emitParallelProgress()
      if (lyricCandidate && isTuneFieldEmptyForKind(tune, 'lyrics')) {
        updateState(tuneId, {
          pending: true,
          progress: clampPercent(Math.max(getAddTuneAutoEnrichState(tuneId).progress, 68)),
          message: 'Applying lyrics...',
          failure: '',
        })
        lyricApplied = saveAppliedCandidate(
          tune,
          'lyrics',
          lyricCandidate,
          opts.tunebook,
          opts.forceRefresh
        ) || lyricApplied
        if (lyricApplied) {
          lyricSource = searchSourceLabel(lyricCandidate, 'lyrics search')
        }
        if (!lyricApplied) lyricsSearchFailed = true
      } else if (lyricCandidate) {
        lyricApplied = true
        lyricSource = searchSourceLabel(lyricCandidate, 'lyrics search')
      } else {
        lyricsSearchFailed = !lyricApplied
      }
    } catch (e) {
      if (isCancelled()) return false
      lyricsSearchFailed = !lyricApplied
    }

    if (isCancelled()) return false

    // Always try notation when the staff is empty/replaceable — art songs often
    // have lyrics and MuseScore notation; lyrics must not suppress notation.
    if (notationLooksReplaceable(tune)) {
      notationAttempted = true
      if (!lyricApplied) lyricsSearchFailed = true
      updateState(tuneId, {
        pending: true,
        progress: clampPercent(Math.max(getAddTuneAutoEnrichState(tuneId).progress, 72)),
        message: 'Searching for notation...',
        failure: '',
      })
      const settled = await notationSettled
      notationSettledResult = settled
      if (isCancelled()) return false
      if (!settled.ok) {
        notationSearchFailed = true
      } else {
        notationManualCandidates = manualCandidatesFromSearchResult(settled.value)
        notationMusescorePaywalled = !!(
          settled.ok
          && settled.value
          && settled.value.musescorePaywalled
        )
        const notationCandidate = settled.ok
          ? (
            pickAutoApplyNotationCandidate(
              settled.value,
              title,
              artist,
              notationPickOptions()
            )
            || pickRankedSolidAbcNotationCandidate(settled.value, title)
          )
          : null
        if (notationCandidate) {
          updateState(tuneId, {
            pending: true,
            progress: 96,
            message: 'Applying notation...',
            failure: '',
          })
          const applied = saveAppliedCandidate(
            tune,
            'notation',
            notationCandidate,
            opts.tunebook,
            opts.forceRefresh
          )
          if (applied) {
            notationApplied = true
            notationSource = searchSourceLabel(notationCandidate, 'notation search')
          }
          else notationSearchFailed = true
        } else if (settled.ok && pickFirstSearchCandidate(settled.value)) {
          notationSearchFailed = true
        } else {
          notationSearchFailed = true
        }
      }
    } else {
      // Drain settled promise so a fast miss cannot become an unhandled rejection.
      await notationSettled
    }
    }

    if (!isCancelled()) {
      try {
        const metaResult = await enrichTuneMetadataFromMusicBrainz(tune, {
          title: title,
          artist: artist,
          accessToken: opts.accessToken || '',
          resolverAvailable: opts.resolverAvailable,
          signal: signal,
        })
        if (isCancelled()) return false
        const applied = metaResult && metaResult.applied ? metaResult.applied : {}
        if (applied.composer) metadataComposer = 'MusicBrainz'
        if (applied.artists && applied.artists.length) metadataArtists = 'MusicBrainz'
        if (applied.albums && applied.albums.length) metadataAlbums = 'MusicBrainz'
        if (applied.genre) metadataGenre = applied.genre
        if (Object.keys(applied).length && typeof opts.forceRefresh === 'function') {
          opts.forceRefresh()
        }
      } catch (e) {
        if (isCancelled() || isAbortError(e)) return false
      }
    }

    return true
  } catch (e) {
    if (isCancelled() || isAbortError(e)) return false
    throw e
  } finally {
    delete activeEnrichAbortByTuneId[tuneId]
    if (isCancelled()) return

    const stillNeedsChords = !chordApplied && isTuneFieldEmptyForKind(tune, 'chords')
    const stillNeedsNotation = notationAttempted
      && !notationApplied
      && notationLooksReplaceable(tune)
    const notationPasteCandidate = stillNeedsNotation
      && !(
        notationSettledResult
        && notationSettledResult.ok
        && hasSolidAbcNotationMatch(notationSettledResult.value, title)
      )
      ? pickNotationPasteCandidate(notationManualCandidates, title, artist, {
        musescorePaywalled: notationMusescorePaywalled,
      })
      : null
    const chordPasteCandidate = stillNeedsChords
      ? pickUltimateGuitarPasteCandidate(chordManualCandidates)
      : null
    const bothFailed = artist && lyricsSearchFailed
      && (notationAttempted ? notationSearchFailed : false)
      && !notationPasteCandidate
      && !chordPasteCandidate

    const enrichmentSummary = buildEnrichmentSummary(tune, {
      chordApplied: chordApplied,
      lyricApplied: lyricApplied,
      notationApplied: notationApplied,
      notationAttempted: notationAttempted,
      chordSource: chordSource,
      lyricSource: lyricSource,
      notationSource: notationSource,
      composer: metadataComposer,
      artists: metadataArtists,
      albums: metadataAlbums,
      genre: metadataGenre,
    })

    if (notationPasteCandidate || chordPasteCandidate) {
      const messages = []
      if (chordPasteCandidate) {
        messages.push('Chords need a manual paste from Ultimate Guitar.')
      }
      if (notationPasteCandidate) {
        messages.push(notationPasteCandidate.searchFallback
          ? 'No downloadable notation was found automatically. Search MuseScore and import MusicXML, .mxl, .mscz, or MIDI (paste or choose file).'
          : 'Notation was found on MuseScore, but needs a manual download (MusicXML, .mxl, .mscz, or MIDI) or paste.')
      }
      updateState(tuneId, {
        pending: false,
        progress: 100,
        message: messages.join(' '),
        failure: '',
        summary: enrichmentSummary,
        needsChordPaste: !!chordPasteCandidate,
        chordPasteCandidate: chordPasteCandidate,
        chordManualCandidates: chordPasteCandidate ? chordManualCandidates.slice() : [],
        needsNotationPaste: !!notationPasteCandidate,
        notationPasteCandidate: notationPasteCandidate,
        notationManualCandidates: notationPasteCandidate ? notationManualCandidates.slice() : [],
        musescorePaywalled: false,
      })
    } else if (notationMusescorePaywalled && stillNeedsNotation && !notationPasteCandidate && !chordPasteCandidate) {
      updateState(tuneId, {
        pending: false,
        progress: 100,
        message: 'MuseScore matches require PRO or purchase; try MIDI or ABC sources instead.',
        failure: '',
        summary: enrichmentSummary,
        needsChordPaste: false,
        chordPasteCandidate: null,
        chordManualCandidates: [],
        needsNotationPaste: false,
        notationPasteCandidate: null,
        notationManualCandidates: [],
        musescorePaywalled: true,
      })
    } else if (bothFailed) {
      updateState(tuneId, {
        pending: false,
        progress: 100,
        message: '',
        failure: 'Could not find lyrics or notation for this tune.',
        summary: enrichmentSummary,
        needsChordPaste: false,
        chordPasteCandidate: null,
        chordManualCandidates: [],
        needsNotationPaste: false,
        notationPasteCandidate: null,
        notationManualCandidates: [],
        musescorePaywalled: false,
      })
    } else {
      if (enrichmentSummary) {
        updateState(tuneId, {
          pending: false,
          progress: 100,
          message: '',
          failure: '',
          summary: enrichmentSummary,
          needsChordPaste: false,
          chordPasteCandidate: null,
          chordManualCandidates: [],
          needsNotationPaste: false,
          notationPasteCandidate: null,
          notationManualCandidates: [],
          musescorePaywalled: false,
        })
      } else {
        clearState(tuneId)
      }
    }
  }
}

export async function tryApplyNotationMidiFallback(options) {
  const opts = options || {}
  const tune = opts.tune
  const tunebook = opts.tunebook
  if (!tune || !tunebook || !notationLooksReplaceable(tune)) {
    return { applied: false, source: '' }
  }
  const title = String(opts.title || tune.name || '').trim()
  if (!title) return { applied: false, source: '' }
  const artist = String(opts.artist || tune.composer || '').trim()
  const songType = opts.songType || inferNotationSongType(tune.rhythm || '', artist)
  try {
    const result = await searchNotation({
      title: title,
      artist: artist,
      songType: songType,
      resolverAvailable: opts.resolverAvailable,
      accessToken: opts.accessToken || '',
      midiFallback: true,
    })
    const candidate = pickAutoApplyNotationCandidate(
      result,
      title,
      artist,
      { songType: songType, fallbackPool: true }
    )
    if (!candidate) return { applied: false, source: '' }
    const source = searchSourceLabel(candidate, 'notation search')
    const applied = saveAppliedCandidate(tune, 'notation', candidate, tunebook, opts.forceRefresh)
    return { applied: !!applied, source: applied ? source : '' }
  } catch (e) {
    return { applied: false, source: '' }
  }
}

export async function abandonAutoEnrichNotationPaste(options) {
  const opts = options || {}
  const tuneId = opts.tuneId
  const tune = opts.tune
  const tunebook = opts.tunebook
  if (!tuneId || !tune || !tunebook) return { applied: false, source: '' }

  const result = await tryApplyNotationMidiFallback({
    tune: tune,
    tunebook: tunebook,
    title: opts.title,
    artist: opts.artist,
    accessToken: opts.accessToken || '',
    resolverAvailable: opts.resolverAvailable,
    forceRefresh: opts.forceRefresh,
  })

  if (result.applied) {
    updateState(tuneId, {
      needsNotationPaste: false,
      notationPasteCandidate: null,
      notationManualCandidates: [],
      musescorePaywalled: false,
      message: '',
    })
  } else {
    dismissAddTuneAutoEnrichNotationPaste(tuneId)
  }

  return result
}
