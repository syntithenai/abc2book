import abcjs from 'abcjs'
import { orderedVoiceKeys, reorderVoicesObject } from './voiceKeyOrder'
import { resolvePrimaryVoiceKey } from './abcVoiceUtils'
import {
  invalidateChordBlockCache,
  syncChordSectionLabelsFromPrimaryVoice,
} from './chordBlockMerge'

function cloneVoiceNotes(voice) {
  if (!voice) return { meta: '', notes: [''] }
  const notes = Array.isArray(voice.notes)
    ? voice.notes.slice()
    : (voice.notes ? [String(voice.notes)] : [''])
  return {
    meta: voice.meta || '',
    notes: notes.length ? notes : [''],
  }
}

function voiceNotesText(voice) {
  if (!voice) return ''
  return Array.isArray(voice.notes) ? voice.notes.join('\n') : String(voice.notes || '')
}

function notesFromParsedVoice(abcTools, parsedVoice) {
  const text = voiceNotesText(parsedVoice)
  if (abcTools && typeof abcTools.justNotes === 'function') {
    const cleaned = abcTools.justNotes(text)
    return cleaned ? cleaned.split('\n') : ['']
  }
  return text ? text.split('\n') : ['']
}

/**
 * Rewrite ABC note text for every voice (and the tune key) by a chromatic
 * interval. Does not change tune.transpose — that remains a display/playback
 * offset. Lyrics and other metadata are left untouched.
 *
 * @param {object} tune
 * @param {object} abcTools
 * @param {number} semitones
 * @returns {object|null} next tune, or null when nothing changed / failed
 */
export function transposeTuneAbcNotes(tune, abcTools, semitones) {
  const amount = Number(semitones) || 0
  if (!tune || !tune.voices || !abcTools || !amount) return null
  if (typeof abcjs.strTranspose !== 'function') return null

  const voiceKeys = orderedVoiceKeys(tune)
  if (!voiceKeys.length) return null

  const work = {
    name: tune.name || 'Tune',
    meter: tune.meter || '4/4',
    noteLength: tune.noteLength || '1/8',
    key: tune.key || 'C',
    tempo: tune.tempo || 100,
    transpose: 0,
    voiceOrder: voiceKeys.slice(),
    voices: {},
  }
  voiceKeys.forEach(function(vk) {
    work.voices[vk] = cloneVoiceNotes(tune.voices[vk])
  })
  work.voices = reorderVoicesObject(work.voices, voiceKeys)

  let transposedAbc = ''
  try {
    const abc = abcTools.json2abc(work)
    const visualObj = abcjs.renderAbc('*', abc)
    transposedAbc = abcjs.strTranspose(abc, visualObj, amount)
  } catch (e) {
    return null
  }
  if (!transposedAbc) return null

  let parsed
  try {
    parsed = abcTools.abc2json(transposedAbc)
  } catch (e) {
    return null
  }
  if (!parsed || !parsed.voices) return null

  const parsedKeys = orderedVoiceKeys(parsed)
  const nextVoices = Object.assign({}, tune.voices)
  let changed = false

  voiceKeys.forEach(function(origKey, index) {
    const parsedKey = parsed.voices[origKey] ? origKey : parsedKeys[index]
    const parsedVoice = parsedKey ? parsed.voices[parsedKey] : null
    if (!parsedVoice) return
    const nextNotes = notesFromParsedVoice(abcTools, parsedVoice)
    const prevText = voiceNotesText(tune.voices[origKey])
    const nextText = nextNotes.join('\n')
    if (nextText !== prevText) changed = true
    nextVoices[origKey] = Object.assign({}, tune.voices[origKey], {
      notes: nextNotes,
    })
  })

  const nextKey = parsed.key != null && String(parsed.key).trim()
    ? parsed.key
    : tune.key
  if (String(nextKey || '') !== String(tune.key || '')) changed = true
  if (!changed) return null

  const next = Object.assign({}, tune, {
    key: nextKey,
    voices: nextVoices,
  })
  invalidateChordBlockCache(next)
  const primary = resolvePrimaryVoiceKey(next.voices)
  if (primary && next.voices[primary]) {
    syncChordSectionLabelsFromPrimaryVoice(next, next.voices[primary].notes)
  }
  return next
}
