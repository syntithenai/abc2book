import { createTuneFileFromBlob } from './tuneFiles'
import { createAttachedAudioLink, createAttachedMidiLink } from './linkRecording'
import { normalizeMidiBinaryData, isMidiHeader } from './midiFileUtils'
import { setPlainLyricLines } from './wLinesUtils'
import { filterTuneVoices } from './abcVoiceFilter'
import { getTuneVoiceKeys, getVisibleVoiceKeys } from './abcVoiceViewSettings'
import { applyScratchpadNotationMerge } from './scratchpadNotationMerge'
import { commitChordSearchResultToTune } from './commitChordSearchResultToTune'

/**
 * Attach scratchpad image to tune as snapshot.
 */
export async function attachScratchpadImageToTune(tune, blob, options) {
  const opts = options || {}
  const result = await createTuneFileFromBlob({
    tune: tune,
    blob: blob,
    name: opts.name || 'Scratchpad image',
    type: opts.type || (blob && blob.type) || 'image/png',
    source: 'scratchpad',
    uploadToDrive: opts.uploadToDrive !== false,
    setActive: opts.setActive !== false,
  })
  return result.tune
}

/**
 * Attach scratchpad audio to tune as owned-media link (uses mixdown when available).
 */
export async function attachScratchpadAudioToTune(tune, blob, options) {
  const opts = options || {}
  let exportBlob = blob
  if (opts.item && opts.item.audio && opts.item.audio.mixdownBlobKey) {
    const { getScratchpadBlob } = await import('./scratchpadBlobs')
    const mix = await getScratchpadBlob(opts.item.audio.mixdownBlobKey)
    if (mix && mix.size > 0) exportBlob = mix
  }
  const file = exportBlob instanceof Blob
    ? new File([exportBlob], opts.title || 'scratchpad-audio.wav', { type: exportBlob.type || 'audio/wav' })
    : exportBlob
  const link = await createAttachedAudioLink({
    tune: tune,
    file: file,
    title: opts.title || 'Scratchpad audio',
    token: opts.token,
    driveApi: opts.driveApi,
    uploadToDrive: opts.uploadToDrive !== false,
  })
  const links = Array.isArray(tune.links) ? tune.links.slice() : []
  links.unshift(link)
  return Object.assign({}, tune, { links: links })
}

/**
 * Merge scratchpad notation into tune (supports multi-voice mapping via options).
 */
export function mergeScratchpadNotationIntoTune(tune, scratchpadTune, melodyNotesText, mode, options) {
  const opts = options || {}
  return applyScratchpadNotationMerge(tune, scratchpadTune, {
    mode: mode,
    voiceMapping: opts.voiceMapping,
    fromBar: opts.fromBar,
    toBar: opts.toBar,
  })
}

/**
 * Merge scratchpad lyrics text into tune.
 */
export function mergeScratchpadLyricsIntoTune(tune, lyricsText, mode) {
  const next = Object.assign({}, tune)
  const lines = String(lyricsText || '').split('\n')
  if (mode === 'append') {
    const existing = Array.isArray(next.words) ? next.words.slice() : []
    setPlainLyricLines(next, existing.concat(lines))
  } else {
    setPlainLyricLines(next, lines)
  }
  return next
}

/**
 * Merge scratchpad text into tune background information.
 */
export function mergeScratchpadBackgroundIntoTune(tune, text, mode) {
  const next = Object.assign({}, tune)
  const incoming = String(text || '').trim()
  if (!incoming) return next
  const existing = String(next.backgroundInfo || '').trim()
  if (mode === 'append' && existing) {
    next.backgroundInfo = existing + '\n\n' + incoming
  } else {
    next.backgroundInfo = incoming
  }
  return next
}

/**
 * Parse scratchpad chord-sheet text and merge into tune (wipe notation + lyrics).
 */
export function mergeScratchpadChordsIntoTune(tune, text, options) {
  const opts = options || {}
  const body = String(text || '').trim()
  if (!body) throw new Error('Scratchpad text is empty')
  const committed = commitChordSearchResultToTune({
    result: { chordText: body },
    tune: tune,
    tunebook: opts.tunebook,
    abcjsParser: opts.abcjsParser,
    abc: opts.abc,
    updateLyrics: true,
    skipSave: true,
    historyLabel: opts.historyLabel || 'Paste chords and lyrics from scratchpad',
  })
  if (!committed.ok) {
    throw new Error(
      (committed.error && committed.error.message)
        ? committed.error.message
        : 'Could not apply chords and lyrics'
    )
  }
  return committed.tune
}

/**
 * Scratchpad notation for MIDI export: only voices visible in the editor.
 */
export function filterScratchpadNotationForMidiExport(scratchpadTune, scratchpadItemId) {
  if (!scratchpadTune) return scratchpadTune
  const voiceKeys = getTuneVoiceKeys(scratchpadTune)
  const visibleKeys = getVisibleVoiceKeys(scratchpadItemId || scratchpadTune.id, voiceKeys)
  return filterTuneVoices(scratchpadTune, visibleKeys)
}

/**
 * Attach scratchpad notation as a notation-friendly MIDI media link.
 */
export async function attachScratchpadNotationMidiToTune(tune, scratchpadTune, options) {
  const opts = options || {}
  const tunebook = opts.tunebook
  if (!tune || !tunebook || typeof tunebook.getMidiData !== 'function') {
    throw new Error('Cannot generate MIDI')
  }
  const snapshot = filterScratchpadNotationForMidiExport(
    scratchpadTune || tune,
    opts.scratchpadItemId
  )
  const midiBytes = normalizeMidiBinaryData(
    tunebook.getMidiData(snapshot, 'binary', { notationFriendly: true })
  )
  if (!midiBytes || !isMidiHeader(midiBytes)) {
    throw new Error('Could not generate MIDI')
  }
  const blob = new Blob([midiBytes], { type: 'audio/midi' })
  const baseName = String(opts.title || snapshot.name || 'scratchpad').replace(/\.[^.]+$/, '')
  const file = new File([blob], baseName + '.notation.mid', { type: 'audio/midi' })
  const attached = await createAttachedMidiLink({
    tune: tune,
    file: file,
    title: opts.title || snapshot.name || 'Scratchpad notation MIDI',
    token: opts.token,
    driveApi: opts.driveApi,
    uploadToDrive: opts.uploadToDrive === true,
    linkIndex: 0,
  })
  const links = Array.isArray(tune.links) ? tune.links.slice() : []
  if (attached && attached.link) links.unshift(attached.link)
  return Object.assign({}, tune, { links: links })
}

export function getNotationAssociateMergeMode(associateMode, notationOperation) {
  if (notationOperation === 'replace' || notationOperation === 'insert' || notationOperation === 'merge') {
    return notationOperation
  }
  if (associateMode === 'notation-replace') return 'replace'
  if (associateMode === 'notation-insert') return 'insert'
  return 'merge'
}

export function isNotationAssociateMode(associateMode) {
  return associateMode === 'notation'
    || associateMode === 'notation-merge'
    || associateMode === 'notation-insert'
    || associateMode === 'notation-replace'
}

export function isNotationBarPickerMode(associateMode) {
  return isNotationAssociateMode(associateMode)
}

export function isScratchpadAnalyseMode(associateMode) {
  return associateMode === 'analyse'
}

export function getAssociateModesForItem(item) {
  if (!item) return []
  if (item.type === 'text') {
    return [
      { id: 'chords', label: 'For Chords' },
      { id: 'lyrics', label: 'For Lyrics' },
      { id: 'background', label: 'For Background Information' },
    ]
  }
  if (item.type === 'image') {
    return [{ id: 'snapshot', label: 'As Snapshot' }]
  }
  if (item.type === 'audio') {
    return [{ id: 'media', label: 'As Linked Media' }]
  }
  if (item.type === 'notation') {
    return [
      { id: 'notation', label: 'As Notation' },
      { id: 'midi', label: 'As Midi Linked Media' },
    ]
  }
  return []
}
export function getTuneMelodyNotesText(tune) {
  if (!tune || !tune.voices) return ''
  const keys = Object.keys(tune.voices)
  if (!keys.length) return ''
  const voice = tune.voices[keys[0]]
  if (!voice || !Array.isArray(voice.notes)) return ''
  return voice.notes.join(' ')
}

/**
 * Extract melody notes from scratchpad notation item.
 */
export function getScratchpadMelodyNotesText(item) {
  if (!item) return ''
  if (item.type === 'notation' && item.notation) {
    return getTuneMelodyNotesText(item.notation.tuneSnapshot)
  }
  return ''
}
