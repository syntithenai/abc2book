import { searchChords } from './chordsSearchClient'
import { searchLyrics } from './lyricsSearchClient'
import { searchNotation } from './notationSearchClient'
import { researchTuneBackground } from './tuneBackgroundResearchClient'
import { unwrapSearchResult } from './searchResultUtils'
import { setPlainLyricLines } from './wLinesUtils'
import { importedTuneFromNotationCandidate } from './notationImportUtils'
import { enqueueStemCreateJob } from './stemCreateQueue'
import { resolveActiveLinkForTune } from './mediaLinkResolve'
import { syncTuneFromStore } from './bulkCheckTuneSync'

function tuneTitle(tune) {
  return tune && tune.name ? String(tune.name).trim() : ''
}

function tuneArtist(tune) {
  return tune && tune.composer ? String(tune.composer).trim() : ''
}

function getPrimaryLink(tune, tunebook) {
  const isYoutubeLink = tunebook && tunebook.utils ? tunebook.utils.isYoutubeLink : null
  return resolveActiveLinkForTune(tune, null, isYoutubeLink)
}

export function tuneHasAudioForFix(tune, tunebook) {
  return !!getPrimaryLink(tune, tunebook)
}

function saveFixTune(tune, tunebook, opts) {
  const synced = syncTuneFromStore(tune, opts)
  tunebook.saveTune(synced, false, { historyLabel: 'Bulk check fix', immediate: true })
  return syncTuneFromStore(synced, opts)
}

async function searchChordsAndLyricsForTune(tune, tunebook, token, signal, fixOpts) {
  const title = tuneTitle(tune)
  const artist = tuneArtist(tune)
  const searchOpts = {
    title: title,
    artist: artist,
    accessToken: token,
    signal: signal,
    resolverAvailable: fixOpts && fixOpts.resolverAvailable,
    abcTools: tunebook && tunebook.abcTools ? tunebook.abcTools : null,
    renderChords: fixOpts && typeof fixOpts.renderChords === 'function' ? fixOpts.renderChords : null,
  }
  try {
    const chordResult = unwrapSearchResult(await searchChords(searchOpts))
    return {
      chordText: chordResult.chordText || '',
      lyricLines: Array.isArray(chordResult.lyricLines) ? chordResult.lyricLines : [],
      artist: chordResult.artist || artist,
    }
  } catch (chordError) {
    if (chordError && chordError.name === 'AbortError') throw chordError
    const lyricResult = unwrapSearchResult(await searchLyrics(searchOpts))
    return {
      chordText: '',
      lyricLines: Array.isArray(lyricResult.lines)
        ? lyricResult.lines
        : String(lyricResult.text || '').replace(/\r\n/g, '\n').split('\n'),
      artist: lyricResult.artist || artist,
    }
  }
}

function applyChordsLyricsToTune(tune, result) {
  const next = Object.assign({}, tune)
  if (result.artist && !next.composer) next.composer = result.artist
  if (Array.isArray(result.lyricLines) && result.lyricLines.length > 0) {
    setPlainLyricLines(next, result.lyricLines)
  }
  if (result.chordText && result.chordText.trim()) {
    next.timingScaffold = true
    if (!next.voices) next.voices = { '1': { notes: [] } }
    const voiceKey = Object.keys(next.voices)[0] || '1'
    if (!next.voices[voiceKey]) next.voices[voiceKey] = { notes: [] }
    if (!Array.isArray(next.voices[voiceKey].notes) || next.voices[voiceKey].notes.length === 0) {
      next.voices[voiceKey].notes = ['z z z z |']
    }
  }
  return next
}

async function searchAbcForTune(tune, tunebook, token, signal, fixOpts) {
  const result = await searchNotation({
    title: tuneTitle(tune),
    artist: tuneArtist(tune),
    accessToken: token,
    signal: signal,
    resolverAvailable: fixOpts && fixOpts.resolverAvailable,
    abcTools: tunebook && tunebook.abcTools ? tunebook.abcTools : null,
  })
  if (result.multiple && Array.isArray(result.candidates) && result.candidates.length > 0) {
    const candidate = result.candidates[0]
    if (candidate && candidate.abc) {
      return importedTuneFromNotationCandidate(tunebook.abcTools, candidate.abc, candidate)
    }
  }
  if (result && result.abc) {
    return importedTuneFromNotationCandidate(tunebook.abcTools, result.abc, result)
  }
  throw new Error('No ABC notation found')
}

function mergeImportedTune(original, imported) {
  const next = Object.assign({}, original)
  if (imported.name && !next.name) next.name = imported.name
  if (imported.composer && !next.composer) next.composer = imported.composer
  if (imported.meter && !next.meter) next.meter = imported.meter
  if (imported.key && !next.key) next.key = imported.key
  if (imported.tempo && !next.tempo) next.tempo = imported.tempo
  if (imported.noteLength && !next.noteLength) next.noteLength = imported.noteLength
  if (imported.voices) next.voices = imported.voices
  if (imported.rhythm && !next.rhythm) next.rhythm = imported.rhythm
  return next
}

async function runAnalyseForTune(next, opts, tunebook) {
  const linkInfo = getPrimaryLink(next, tunebook)
  if (!linkInfo) throw new Error('No audio link to analyse')
  const link = Array.isArray(next.links) ? next.links[linkInfo.linkIndex] : null
  if (!link) throw new Error('No audio link to analyse')

  if (typeof opts.maybeAutoScan === 'function') {
    await opts.maybeAutoScan(next.id, linkInfo.linkIndex, link, {
      force: true,
      currentLinks: next.links,
    })
    next = syncTuneFromStore(next, opts)
  }

  if (typeof opts.runMediaAnalysis === 'function') {
    await opts.runMediaAnalysis(next, {
      force: true,
      linkIndex: linkInfo.linkIndex,
    })
    next = syncTuneFromStore(next, opts)
  } else if (typeof opts.maybeAutoScan !== 'function') {
    throw new Error('Playback region scan is not available')
  }

  return next
}

export async function runBulkCheckFixAction(action, options) {
  const opts = options || {}
  const tune = opts.tune
  const tunebook = opts.tunebook
  const token = opts.token
  const signal = opts.signal
  if (!tune || !tunebook) return tune

  let next = syncTuneFromStore(Object.assign({}, tune), opts)

  if (action === 'analyse') {
    return runAnalyseForTune(next, opts, tunebook)
  }

  if (action === 'searchAbc') {
    const imported = await searchAbcForTune(next, tunebook, token, signal, opts)
    next = mergeImportedTune(next, imported)
    return syncTuneFromStore(next, opts)
  }

  if (action === 'searchChordsLyrics') {
    const result = await searchChordsAndLyricsForTune(next, tunebook, token, signal, opts)
    next = applyChordsLyricsToTune(next, result)
    return syncTuneFromStore(next, opts)
  }

  if (action === 'backgroundInfo') {
    const bg = await researchTuneBackground({
      title: tuneTitle(next),
      artist: tuneArtist(next),
      accessToken: token,
      signal: signal,
    })
    if (bg && bg.text) next.backgroundInfo = bg.text
    return syncTuneFromStore(next, opts)
  }

  if (action === 'stems') {
    const linkInfo = getPrimaryLink(next, tunebook)
    if (!linkInfo) throw new Error('No audio link for stems')
    const src = String(linkInfo.src || '').trim()
    enqueueStemCreateJob({
      tuneId: next.id,
      linkIndex: linkInfo.linkIndex,
      src: src,
      srcType: linkInfo.srcType || 'audio',
      tuneName: next.name || '',
      linkTitle: linkInfo.link.title || '',
      accessToken: token,
    })
    return next
  }

  if (action === 'searchAll') {
    const actions = ['searchAbc', 'searchChordsLyrics', 'backgroundInfo']
    if (tuneHasAudioForFix(next, tunebook)) {
      actions.unshift('analyse')
      actions.push('stems')
    }
    for (let i = 0; i < actions.length; i++) {
      if (signal && signal.aborted) break
      try {
        next = await runBulkCheckFixAction(actions[i], Object.assign({}, opts, { tune: next }))
        next = syncTuneFromStore(next, opts)
        if (actions[i] !== 'analyse' && actions[i] !== 'stems' && tunebook) {
          next = saveFixTune(next, tunebook, opts)
        }
      } catch (e) {
        if (e && e.name === 'AbortError') throw e
      }
    }
    return syncTuneFromStore(next, opts)
  }

  return next
}

export const BULK_CHECK_FIX_ACTIONS = [
  { id: 'searchAll', label: 'Search All' },
  { id: 'analyse', label: 'Analyse', requiresAudio: true },
  { id: 'searchAbc', label: 'Search ABC' },
  { id: 'searchChordsLyrics', label: 'Search Chords And Lyrics' },
  { id: 'backgroundInfo', label: 'Background Info' },
  { id: 'stems', label: 'Stems', requiresAudio: true },
]

export { syncTuneFromStore }
