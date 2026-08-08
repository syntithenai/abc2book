import { searchChords } from './chordsSearchClient'
import { searchLyrics } from './lyricsSearchClient'
import { searchNotation } from './notationSearchClient'
import { commitChordSearchResultToTune } from './commitChordSearchResultToTune'
import { applyCandidateToTune, isTuneFieldEmptyForKind } from './fieldLookupApplyUtils'
import { pickFirstSearchCandidate } from './addTuneAutoEnrich'
import { pickAutoApplyNotationCandidate, pickRankedSolidAbcNotationCandidate } from './notationMatchUtils'
import { inferNotationSongType } from './textSearchIndexUtils'
import { enrichTuneMetadataFromMusicBrainz } from './tuneMetadataEnhance'

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

function cloneTune(tune) {
  try {
    return JSON.parse(JSON.stringify(tune || {}))
  } catch (e) {
    return Object.assign({}, tune || {})
  }
}

function emitEnhanceProgress(options, payload) {
  if (typeof options.onProgress === 'function') {
    options.onProgress(payload);
  }
}

function buildEnhanceProgressMessage(index, total, title, step) {
  const prefix = 'Enhancing ' + index + ' of ' + total + ': ' + title;
  if (!step) return prefix + '…';
  return prefix + ' — ' + step + '…';
}

export async function enrichBulkImportTune(tune, options) {
  const opts = options || {}
  const next = cloneTune(tune)
  const title = String(next.name || '').trim()
  const artist = String(next.composer || '').trim()
  const candidateIndex = opts.candidateIndex || 1
  const candidateTotal = opts.candidateTotal || 1

  function report(step) {
    emitEnhanceProgress(opts, {
      index: candidateIndex,
      total: candidateTotal,
      title: title,
      step: step || '',
      message: buildEnhanceProgressMessage(candidateIndex, candidateTotal, title, step),
    })
  }

  if (!title) return next

  const tunebook = opts.tunebook
  const abcjsParser = opts.abcjsParser
  const accessToken = opts.accessToken || ''
  const resolverAvailable = opts.resolverAvailable
  const songType = inferNotationSongType(next.rhythm || '', artist)

  const searchBase = {
    title: title,
    artist: artist,
    accessToken: accessToken,
    resolverAvailable: resolverAvailable,
    abcTools: tunebook && tunebook.abcTools ? tunebook.abcTools : null,
    signal: opts.signal,
  }

  if (artist) {
  if (isTuneFieldEmptyForKind(next, 'chords')) {
    report('chords')
    try {
      const chordResult = await searchChords(searchBase)
      const chordCandidate = pickFirstSearchCandidate(chordResult)
      if (chordCandidate && tunebook) {
        commitChordSearchResultToTune({
          result: chordCandidate,
          tune: next,
          tunebook: tunebook,
          abcjsParser: abcjsParser,
          updateLyrics: true,
        })
      }
    } catch (e) {
      if (e && e.name === 'AbortError') throw e
    }
  }

  if (isTuneFieldEmptyForKind(next, 'lyrics')) {
    report('lyrics')
    try {
      const lyricResult = await searchLyrics(searchBase)
      const lyricCandidate = pickFirstSearchCandidate(lyricResult)
      if (lyricCandidate) {
        applyCandidateToTune(next, 'lyrics', lyricCandidate, tunebook && tunebook.abcTools)
      }
    } catch (e) {
      if (e && e.name === 'AbortError') throw e
    }
  }

  if (notationLooksReplaceable(next)) {
    report('notation')
    try {
      const notationResult = await searchNotation(Object.assign({}, searchBase, {
        searchIndex: opts.searchIndex || null,
        loadTuneTexts: opts.loadTuneTexts || null,
        songType: songType,
      }))
      const notationCandidate = pickAutoApplyNotationCandidate(
        notationResult,
        title,
        artist,
        {
          songType: songType,
          preferMuseScoreImport: songType === 'song' && !!artist,
        }
      ) || pickRankedSolidAbcNotationCandidate(notationResult, title)
      if (notationCandidate) {
        applyCandidateToTune(next, 'notation', notationCandidate, tunebook && tunebook.abcTools)
      }
    } catch (e) {
      if (e && e.name === 'AbortError') throw e
    }
  }
  }

  try {
    await enrichTuneMetadataFromMusicBrainz(next, {
      title: title,
      artist: artist,
      accessToken: accessToken,
      resolverAvailable: resolverAvailable,
      signal: opts.signal,
      onProgress: function(step) {
        report(step)
      },
    })
  } catch (e) {
    if (e && e.name === 'AbortError') throw e
  }

  return next
}

export async function enrichBulkImportCandidates(candidates, options) {
  const list = Array.isArray(candidates) ? candidates : []
  const opts = options || {}
  const enriched = []

  for (let i = 0; i < list.length; i += 1) {
    if (opts.signal && opts.signal.aborted) break
    const candidate = list[i]
    const title = candidate && candidate.tune && candidate.tune.name
      ? String(candidate.tune.name).trim()
      : 'Untitled'
    emitEnhanceProgress(opts, {
      index: i + 1,
      total: list.length,
      title: title,
      step: 'start',
      message: buildEnhanceProgressMessage(i + 1, list.length, title, ''),
    })
    const tune = await enrichBulkImportTune(candidate && candidate.tune, Object.assign({}, opts, {
      candidateIndex: i + 1,
      candidateTotal: list.length,
    }))
    enriched.push(Object.assign({}, candidate, { tune: tune }))
  }

  return enriched
}
