import { createTuneFileFromBlob } from './tuneFiles'
import { createAttachedAudioLink } from './linkRecording'
import { setPlainLyricLines } from './wLinesUtils'

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
 * Merge scratchpad notation melody into tune primary voice.
 */
export function mergeScratchpadNotationIntoTune(tune, scratchpadTune, melodyNotesText, mode) {
  const next = Object.assign({}, tune)
  const voices = Object.assign({}, next.voices || {})
  const voiceKeys = Object.keys(voices)
  const primaryKey = voiceKeys.length > 0 ? voiceKeys[0] : 'V'
  const voice = Object.assign({}, voices[primaryKey] || { notes: [], meta: {} })
  const incoming = String(melodyNotesText || '').trim()
    ? String(melodyNotesText).trim().split(/\s+/)
    : (scratchpadTune && scratchpadTune.voices && scratchpadTune.voices[primaryKey]
      ? scratchpadTune.voices[primaryKey].notes
      : [])
  const incomingNotes = Array.isArray(incoming) ? incoming : [incoming]
  const existingNotes = Array.isArray(voice.notes) ? voice.notes.slice() : []
  if (mode === 'append' && existingNotes.length) {
    voice.notes = existingNotes.concat(incomingNotes)
  } else if (incomingNotes.length) {
    voice.notes = incomingNotes
  }
  voices[primaryKey] = voice
  next.voices = voices
  if (scratchpadTune) {
    if (scratchpadTune.key && !next.key) next.key = scratchpadTune.key
    if (scratchpadTune.meter && !next.meter) next.meter = scratchpadTune.meter
    if (scratchpadTune.noteLength && !next.noteLength) next.noteLength = scratchpadTune.noteLength
  }
  return next
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

export function getAssociateModesForItem(item) {
  if (!item) return []
  if (item.type === 'text') {
    return [
      { id: 'lyrics', label: 'Use for lyrics' },
      { id: 'background', label: 'Use for background information' },
    ]
  }
  if (item.type === 'image') {
    return [{ id: 'snapshot', label: 'Attach as snapshot' }]
  }
  if (item.type === 'audio') {
    return [{ id: 'media', label: 'Attach as audio' }]
  }
  if (item.type === 'notation') {
    return [{ id: 'notation', label: 'Append to Notation' }]
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
