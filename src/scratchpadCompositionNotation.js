import { resolvePrimaryVoiceKey } from './abcVoiceUtils'
import { getTuneVoiceKeys } from './abcVoiceViewSettings'
import { splitMelodyStrainsWithBarlines, noteLinesForMelodyMerge } from './chordBlockMerge'
import { flattenMelodyText, extractBarsFromMelodyText } from './lyricBarAlignmentUtils'

function cloneTune(tune) {
  return JSON.parse(JSON.stringify(tune || {}))
}

export function strainMarkerFromStrain(strain) {
  const text = String(strain && strain.text || '').trim()
  if (!text) return ''
  const bars = extractBarsFromMelodyText(text)
  if (bars.length) return String(bars[0] || '').trim()
  return text.length > 72 ? text.slice(0, 71) + '…' : text
}

export function findStrainIndexByMarker(strains, marker) {
  const raw = String(marker || '').trim()
  if (!raw || !Array.isArray(strains)) return -1
  for (let i = 0; i < strains.length; i += 1) {
    if (strainMarkerFromStrain(strains[i]) === raw) return i
  }
  return -1
}

function strainsFromNoteLines(notes) {
  const merged = noteLinesForMelodyMerge(notes)
  let strains = splitMelodyStrainsWithBarlines(notes)
  if (strains.length <= 1) {
    const flat = flattenMelodyText(merged)
    const spaced = flat.split(/\|\s*\|/)
    if (spaced.length > 1) {
      strains = spaced.map(function(part) {
        return { text: String(part || '').trim() }
      }).filter(function(strain) { return strain.text })
    }
  }
  if (strains.length <= 1 && merged.length > 1) {
    const anyStrainBreak = merged.some(function(line) {
      return /\|\||::|\|:/.test(String(line || ''))
    })
    if (anyStrainBreak) {
      const perLine = []
      merged.forEach(function(line) {
        const lineStrains = splitMelodyStrainsWithBarlines([line])
        if (lineStrains.length > 1) {
          lineStrains.forEach(function(strain) {
            if (String(strain.text || '').trim()) perLine.push(strain)
          })
        } else if (String(line || '').trim()) {
          perLine.push({ text: String(line).trim() })
        }
      })
      if (perLine.length > 1) strains = perLine
    }
  }
  return strains
}

export function listNotationStrainsForTune(tune, voiceKey) {
  if (!tune || !tune.voices) return []
  const key = voiceKey || resolvePrimaryVoiceKey(tune.voices)
  const voice = tune.voices[key]
  const notes = voice && Array.isArray(voice.notes) ? voice.notes : []
  const strains = strainsFromNoteLines(notes)
  return strains.map(function(strain, index) {
    return {
      index: index,
      label: 'Strain ' + (index + 1),
      preview: String(strain.text || '').trim().slice(0, 72),
      marker: strainMarkerFromStrain(strain),
    }
  })
}

export function listNotationStrainsForItem(item) {
  if (!item || item.type !== 'notation' || !item.notation) return []
  return listNotationStrainsForTune(item.notation.tuneSnapshot)
}

export function notationChunkVoiceKeys(chunk, sourceTune) {
  if (!chunk) return []
  if (Array.isArray(chunk.voiceKeys) && chunk.voiceKeys.length) {
    return chunk.voiceKeys.slice()
  }
  if (!sourceTune) return []
  return getTuneVoiceKeys(sourceTune)
}

function strainNotesForVoice(notes, chunk) {
  const lines = Array.isArray(notes) ? notes.slice() : []
  if (chunk.wholeItem) return lines
  const strains = splitMelodyStrainsWithBarlines(lines)
  if (!strains.length) return []
  let strainIndex = chunk.strainIndex != null ? chunk.strainIndex : 0
  if (chunk.strainMarker) {
    const byMarker = findStrainIndexByMarker(strains, chunk.strainMarker)
    if (byMarker >= 0) strainIndex = byMarker
  }
  if (strainIndex < 0 || strainIndex >= strains.length) return null
  const text = String(strains[strainIndex].text || '').trim()
  if (!text) return null
  return [text]
}

export function isNotationChunkSourceResolved(item, chunk) {
  if (!chunk || chunk.sourceKind !== 'notation-strain') return true
  if (chunk.wholeItem) return true
  if (!item || item.type !== 'notation' || !item.notation) return false
  const tune = item.notation.tuneSnapshot
  if (chunk.strainMarker) {
    const primaryKey = resolvePrimaryVoiceKey(tune.voices || {})
    const primaryVoice = tune.voices && tune.voices[primaryKey]
    const strains = splitMelodyStrainsWithBarlines(primaryVoice && primaryVoice.notes || [])
    if (findStrainIndexByMarker(strains, chunk.strainMarker) < 0) return false
  }
  return !!buildNotationChunkSourceTune(tune, chunk)
}

export function buildNotationChunkSourceTune(sourceTune, chunk) {
  if (!sourceTune || !chunk) return null
  const voiceKeys = notationChunkVoiceKeys(chunk, sourceTune)
  if (!voiceKeys.length) return null
  const primaryKey = resolvePrimaryVoiceKey(sourceTune.voices || {})
  const primaryVoice = sourceTune.voices && sourceTune.voices[primaryKey]
  if (!chunk.wholeItem) {
    const primaryStrainNotes = primaryVoice
      ? strainNotesForVoice(primaryVoice.notes, chunk)
      : null
    if (primaryStrainNotes == null) return null
  }
  const next = cloneTune(sourceTune)
  const voices = {}
  voiceKeys.forEach(function(voiceKey) {
    const srcVoice = sourceTune.voices && sourceTune.voices[voiceKey]
    if (!srcVoice) return
    const strainNotes = strainNotesForVoice(srcVoice.notes, chunk)
    if (strainNotes == null) return
    voices[voiceKey] = Object.assign({}, srcVoice, { notes: strainNotes })
  })
  if (!Object.keys(voices).length) return null
  next.voices = voices
  return next
}
