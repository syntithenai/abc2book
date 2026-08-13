/**
 * Report / clear note-aligned lyrics (tune.wLines) in an exported tunebook JSON.
 * Preserves plain block lyrics (tune.words); promotes wLines → words when words
 * are empty so clearing does not drop the only lyric copy.
 */
import {
  ensurePlainWordsFromNoteAlignedLyrics,
} from './wLinesUtils'

export function tuneHasNoteAlignedLyrics(tune) {
  if (!tune) return false
  const wLines = Array.isArray(tune.wLines) ? tune.wLines : []
  return wLines.some(function(line) { return String(line || '').trim().length > 0 })
}

export function listTunesWithNoteAlignedLyrics(tunes) {
  return (Array.isArray(tunes) ? tunes : []).filter(tuneHasNoteAlignedLyrics)
}

/**
 * Clear wLines on a tune. Returns a shallow-cloned tune when changed.
 */
export function clearNoteAlignedLyricsOnTune(tune) {
  if (!tune || !tuneHasNoteAlignedLyrics(tune)) return tune
  const next = Object.assign({}, tune, {
    words: Array.isArray(tune.words) ? tune.words.slice() : tune.words,
    wLines: Array.isArray(tune.wLines) ? tune.wLines.slice() : [],
  })
  ensurePlainWordsFromNoteAlignedLyrics(next)
  next.wLines = []
  return next
}

/**
 * @returns {{ total: number, withNoteAligned: number, cleared: number, dryRun: boolean, tunes: object[] }}
 */
export function clearNoteAlignedLyricsOnTunes(tunes, options) {
  const opts = options || {}
  const dryRun = !!opts.dryRun
  const source = Array.isArray(tunes) ? tunes : []
  let withNoteAligned = 0
  let cleared = 0
  const out = source.map(function(tune) {
    if (!tuneHasNoteAlignedLyrics(tune)) return tune
    withNoteAligned += 1
    if (dryRun) return tune
    cleared += 1
    return clearNoteAlignedLyricsOnTune(tune)
  })
  return {
    total: source.length,
    withNoteAligned: withNoteAligned,
    cleared: dryRun ? 0 : cleared,
    dryRun: dryRun,
    tunes: out,
  }
}
