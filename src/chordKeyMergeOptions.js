/**
 * Deterministic chord-key merge options (no LLM).
 * Detect mismatch vs notation key and score transpose candidates.
 */
import { chordParserFactory, chordRendererFactory } from 'chord-symbol'
import { parseKeySignatureForTests } from './melodyPitchSpelling'
import { normalizePracticeKey, pitchOffsetToPracticeKey } from './practiceSessionPlanner'
import utilsFunctions from './utilsFunctions'

const parseChord = chordParserFactory()
const utils = utilsFunctions()

/** Local copy — practiceSessionPlanner does not export ROOT_PITCH_CLASS. */
const ROOT_PITCH_CLASS = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
}

const PC_TO_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11]
const NATURAL_MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10]

const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

function pitchClassForRoot(root) {
  if (!root) return null
  return ROOT_PITCH_CLASS[root] != null ? ROOT_PITCH_CLASS[root] : null
}

function normalizeKeyInfo(key) {
  const info = parseKeySignatureForTests(key)
  if (!info) return null
  return {
    root: info.root,
    mode: info.mode,
    label: info.mode === 'minor' ? info.root + 'm' : info.root,
  }
}

function scalePitchClasses(keyInfo) {
  if (!keyInfo) return null
  const rootPc = pitchClassForRoot(keyInfo.root)
  if (rootPc == null) return null
  const steps = keyInfo.mode === 'minor' ? NATURAL_MINOR_SCALE : MAJOR_SCALE
  return steps.map(function(step) { return (rootPc + step) % 12 })
}

function relativeKeyLabel(keyInfo) {
  if (!keyInfo) return ''
  const rootPc = pitchClassForRoot(keyInfo.root)
  if (rootPc == null) return ''
  if (keyInfo.mode === 'minor') {
    const majorPc = (rootPc + 3) % 12
    return PC_TO_SHARP[majorPc]
  }
  const minorPc = (rootPc + 9) % 12
  return PC_TO_SHARP[minorPc] + 'm'
}

function keysAreCompatible(a, b) {
  const na = normalizePracticeKey(a)
  const nb = normalizePracticeKey(b)
  if (!na || !nb) return false
  if (na === nb) return true
  const infoA = normalizeKeyInfo(a)
  const infoB = normalizeKeyInfo(b)
  if (!infoA || !infoB) return false
  return relativeKeyLabel(infoA) === nb || relativeKeyLabel(infoB) === na
}

/** Exported for import-review inferred-key auto-apply. */
export { keysAreCompatible }

function wrapSemitones(semitones) {
  let value = Number(semitones) || 0
  while (value > 6) value -= 12
  while (value < -6) value += 12
  return value
}

function transposeRootBySemitones(root, semitones) {
  const pc = pitchClassForRoot(root)
  if (pc == null) return root
  const next = (pc + (Number(semitones) || 0) % 12 + 12) % 12
  return PC_TO_SHARP[next]
}

function transposeKeyBySemitones(key, semitones) {
  const info = normalizeKeyInfo(key)
  if (!info) return key
  const nextRoot = transposeRootBySemitones(info.root, semitones)
  return info.mode === 'minor' ? nextRoot + 'm' : nextRoot
}

function parseChordRootInfo(token) {
  const raw = String(token || '').trim()
  if (!raw || raw === '.' || /^\.+$/.test(raw)) return null
  const match = raw.match(/^([A-Ga-g])([#b]?)/)
  if (!match) return null
  const root = match[1].toUpperCase() + (match[2] || '')
  if (pitchClassForRoot(root) == null) return null
  const rest = raw.slice(match[0].length)
  const isMinor = /^(m(?!aj)|min|minor|-)/i.test(rest)
  return { root: root, isMinor: isMinor, token: raw }
}

function extractChordTokensFromGrid(chordGridText) {
  const tokens = []
  String(chordGridText || '').split(/\r?\n/).forEach(function(line) {
    let clean = String(line || '').trim()
    if (!clean) return
    // ChordPro inline chords in lyric lines: [Am]word [G]…
    const inlineRe = /\[([A-G][#b]?[^\]]*)\]/gi
    let inlineMatch
    while ((inlineMatch = inlineRe.exec(clean)) !== null) {
      const info = parseChordRootInfo(inlineMatch[1])
      if (info) tokens.push(info)
    }
    if (clean.endsWith('||')) clean = clean.slice(0, -2)
    else if (clean.endsWith('|')) clean = clean.slice(0, -1)
    clean.split('|').forEach(function(bar) {
      String(bar || '').trim().split(/\s+/).forEach(function(token) {
        if (!token || token === '.' || /^\.+$/.test(token)) return
        // Skip raw ChordPro brackets already handled
        if (token.charAt(0) === '[') return
        const info = parseChordRootInfo(token)
        if (info) tokens.push(info)
      })
    })
  })
  return tokens
}

/**
 * Histogram of chord roots → best major/minor guess (deterministic).
 */
export function inferKeyFromChordGrid(chordGridText) {
  const tokens = extractChordTokensFromGrid(chordGridText)
  if (tokens.length === 0) return ''

  const rootCounts = {}
  const rootMinor = {}
  const rootMajor = {}
  tokens.forEach(function(info) {
    rootCounts[info.root] = (rootCounts[info.root] || 0) + 1
    if (info.isMinor) rootMinor[info.root] = (rootMinor[info.root] || 0) + 1
    else rootMajor[info.root] = (rootMajor[info.root] || 0) + 1
  })

  const roots = Object.keys(rootCounts).sort(function(a, b) {
    const countDiff = rootCounts[b] - rootCounts[a]
    if (countDiff !== 0) return countDiff
    const pcA = pitchClassForRoot(a)
    const pcB = pitchClassForRoot(b)
    if (pcA !== pcB) return pcA - pcB
    return a < b ? -1 : a > b ? 1 : 0
  })

  const bestRoot = roots[0]
  const minorCount = rootMinor[bestRoot] || 0
  const majorCount = rootMajor[bestRoot] || 0
  if (minorCount > majorCount) return bestRoot + 'm'
  return bestRoot
}

function simpleTransposeChordToken(token, semitones, targetKey) {
  const info = parseChordRootInfo(token)
  if (!info) return token
  const nextRoot = transposeRootBySemitones(info.root, semitones)
  const originalMatch = String(token).match(/^([A-Ga-g])([#b]?)/)
  const consumed = originalMatch ? originalMatch[0].length : info.root.length
  const rest = String(token).slice(consumed)
  let next = nextRoot + rest
  if (targetKey) {
    try {
      next = utils.canonicalChordForKey(targetKey, next) || next
    } catch (e) {
      // keep next
    }
  }
  return next
}

function transposeChordToken(token, semitones, targetKey) {
  const cleaned = String(token || '').trim()
  if (!cleaned || cleaned === '.' || /^\.+$/.test(cleaned)) return token
  if (!semitones && !targetKey) return token

  try {
    const parsed = parseChord(cleaned)
    if (parsed && !parsed.error) {
      const renderOptions = { useShortNamings: true }
      if (semitones) renderOptions.transposeValue = Number(semitones)
      const rendered = chordRendererFactory(renderOptions)(parsed)
      if (rendered) {
        if (targetKey) {
          try {
            return utils.canonicalChordForKey(targetKey, rendered) || rendered
          } catch (e) {
            return rendered
          }
        }
        return rendered
      }
    }
  } catch (e) {
    // fall through
  }
  return simpleTransposeChordToken(cleaned, semitones, targetKey)
}

/**
 * Transpose chord tokens in a wizard grid; preserve bars, dots, and spacing.
 */
export function transposeChordGridText(text, semitones, targetKey) {
  const amount = Number(semitones) || 0
  if (!amount && !targetKey) return String(text || '')

  return String(text || '').split('\n').map(function(line) {
    return String(line).replace(/\S+/g, function(token) {
      if (token === '|' || token === '||' || token === '.' || /^[|.:]+$/.test(token)) {
        return token
      }
      // Tokens like "G|" — transpose chord portion, keep trailing barlines
      const barSuffix = token.match(/\|+$/)
      const core = barSuffix ? token.slice(0, -barSuffix[0].length) : token
      if (!core || core === '.' || /^\.+$/.test(core)) return token
      if (!parseChordRootInfo(core)) return token
      const transposed = transposeChordToken(core, amount, targetKey)
      return transposed + (barSuffix ? barSuffix[0] : '')
    })
  }).join('\n')
}

function extractMelodyPitchClasses(melodyAbc, noteLines) {
  const text = melodyAbc != null && String(melodyAbc).trim()
    ? String(melodyAbc)
    : (Array.isArray(noteLines) ? noteLines.join('\n') : '')
  if (!text.trim()) return []

  const stripped = text.replace(/"[^"]*"/g, '')
  const pcs = []
  const re = /([_=^]?)([a-gA-G])/g
  let match
  while ((match = re.exec(stripped)) !== null) {
    const accidental = match[1]
    const letter = match[2].toUpperCase()
    let pc = LETTER_PC[letter]
    if (pc == null) continue
    if (accidental === '^' || accidental === '#') pc = (pc + 1) % 12
    else if (accidental === '_' || accidental === 'b') pc = (pc + 11) % 12
    pcs.push(pc)
  }
  return pcs
}

function chordTonePitchClasses(root, isMinor) {
  const rootPc = pitchClassForRoot(root)
  if (rootPc == null) return []
  const third = isMinor ? 3 : 4
  return [rootPc, (rootPc + third) % 12, (rootPc + 7) % 12]
}

function scoreDiatonicFit(tokens, targetKey, semitones) {
  const keyInfo = normalizeKeyInfo(targetKey)
  const allowed = scalePitchClasses(keyInfo)
  if (!allowed || tokens.length === 0) return 0
  let hits = 0
  tokens.forEach(function(info) {
    const root = transposeRootBySemitones(info.root, semitones)
    const pc = pitchClassForRoot(root)
    if (pc != null && allowed.indexOf(pc) >= 0) hits += 1
  })
  return hits / tokens.length
}

function scoreMelodyFit(tokens, melodyPcs, semitones) {
  if (!melodyPcs.length || tokens.length === 0) return 0
  const toneSet = {}
  tokens.forEach(function(info) {
    const root = transposeRootBySemitones(info.root, semitones)
    chordTonePitchClasses(root, info.isMinor).forEach(function(pc) {
      toneSet[pc] = true
    })
  })
  let hits = 0
  melodyPcs.forEach(function(pc) {
    if (toneSet[pc]) hits += 1
  })
  return hits / melodyPcs.length
}

function buildOption(id, label, semitones, chordGridText, sheetKey, targetKey, score, rationale) {
  const amount = wrapSemitones(semitones)
  const grid = amount
    ? transposeChordGridText(chordGridText, amount, targetKey)
    : String(chordGridText || '')
  return {
    id: id,
    label: label,
    transposeSemitones: amount,
    chordGridText: grid,
    sheetKey: sheetKey || '',
    targetKey: targetKey || '',
    score: score,
    rationale: rationale || '',
  }
}

/**
 * Build as-is / transposed chord-grid merge options for review.
 * Options change grids only — never overwrite a user-set tune key.
 */
export function buildChordKeyMergeOptions(input) {
  const opts = input || {}
  const chordGridText = String(opts.chordGridText || '')
  const notationKey = String(opts.notationKey || '').trim()
  const capo = parseInt(opts.capo, 10)
  const capoSemitones = Number.isFinite(capo) && capo > 0 ? capo : 0
  const tokens = extractChordTokensFromGrid(chordGridText)

  if (!notationKey || tokens.length === 0) {
    return [
      buildOption('as-is', 'As imported', 0, chordGridText, opts.sheetKey || '', notationKey, 1, 'No key comparison available'),
    ]
  }

  const inferred = inferKeyFromChordGrid(chordGridText)
  const writtenSheetKey = String(opts.sheetKey || '').trim() || inferred
  const soundingSheetKey = capoSemitones
    ? transposeKeyBySemitones(writtenSheetKey, capoSemitones)
    : writtenSheetKey

  if (keysAreCompatible(soundingSheetKey, notationKey) || keysAreCompatible(writtenSheetKey, notationKey)) {
    return [
      buildOption(
        'as-is',
        'As imported',
        0,
        chordGridText,
        writtenSheetKey,
        notationKey,
        1,
        keysAreCompatible(soundingSheetKey, notationKey) && capoSemitones
          ? 'Sheet sounding key matches notation (capo ' + capoSemitones + ')'
          : 'Sheet key matches notation key'
      ),
    ]
  }

  const melodyPcs = extractMelodyPitchClasses(opts.melodyAbc, opts.noteLines)
  const candidateOffsets = {}
  candidateOffsets[0] = true
  const toNotation = pitchOffsetToPracticeKey(writtenSheetKey, notationKey)
  candidateOffsets[wrapSemitones(toNotation)] = true
  if (capoSemitones) {
    candidateOffsets[wrapSemitones(toNotation - capoSemitones)] = true
    candidateOffsets[wrapSemitones(capoSemitones)] = true
  }
  const relative = relativeKeyLabel(normalizeKeyInfo(notationKey))
  if (relative) {
    candidateOffsets[wrapSemitones(pitchOffsetToPracticeKey(writtenSheetKey, relative))] = true
  }
  // Nearby alternatives around the primary offset
  ;[-2, -1, 1, 2].forEach(function(delta) {
    candidateOffsets[wrapSemitones(toNotation + delta)] = true
  })

  const scored = Object.keys(candidateOffsets).map(function(key) {
    const semitones = Number(key)
    const diatonic = scoreDiatonicFit(tokens, notationKey, semitones)
    const melody = scoreMelodyFit(tokens, melodyPcs, semitones)
    const score = melodyPcs.length > 0
      ? (diatonic * 0.45) + (melody * 0.55)
      : diatonic
    return {
      semitones: semitones,
      score: score,
      diatonic: diatonic,
      melody: melody,
    }
  }).sort(function(a, b) {
    if (b.score !== a.score) return b.score - a.score
    if (a.semitones === 0 && b.semitones !== 0) return -1
    if (b.semitones === 0 && a.semitones !== 0) return 1
    return Math.abs(a.semitones) - Math.abs(b.semitones)
  })

  const asIs = buildOption(
    'as-is',
    'As imported',
    0,
    chordGridText,
    writtenSheetKey,
    notationKey,
    scored.filter(function(row) { return row.semitones === 0 })[0]
      ? scored.filter(function(row) { return row.semitones === 0 })[0].score
      : 0,
    'Keep imported chord spellings'
  )

  const transposed = []
  scored.forEach(function(row) {
    if (row.semitones === 0) return
    if (transposed.length >= 2) return
    const targetLabel = transposeKeyBySemitones(writtenSheetKey, row.semitones) || notationKey
    const rationaleParts = [
      'Diatonic fit ' + Math.round(row.diatonic * 100) + '%',
    ]
    if (melodyPcs.length > 0) {
      rationaleParts.push('melody fit ' + Math.round(row.melody * 100) + '%')
    }
    transposed.push(buildOption(
      transposed.length === 0 ? 'best' : 'next-best',
      (row.semitones > 0 ? '+' : '') + row.semitones + ' → ' + targetLabel,
      row.semitones,
      chordGridText,
      writtenSheetKey,
      notationKey,
      row.score,
      rationaleParts.join(', ')
    ))
  })

  return [asIs].concat(transposed)
}

/**
 * Suggestions when the declared key does not match chords in a lyric/chord chart.
 * Prefers correcting the key field to match chord spellings (keep chart as-is).
 *
 * @returns {Array<{id: string, label: string, action: string, key?: string, chordGridText?: string, preferred?: boolean, rationale?: string}>}
 */
export function buildImportKeyChordSuggestions(input) {
  const opts = input || {}
  const chordSource = String(opts.chordGridText || opts.lyricsText || '')
  const declaredKey = String(opts.declaredKey || opts.notationKey || '').trim()
  const inferred = inferKeyFromChordGrid(chordSource)
  if (!inferred || !declaredKey) return []
  if (keysAreCompatible(inferred, declaredKey)) return []

  const transposeOpts = buildChordKeyMergeOptions({
    chordGridText: chordSource,
    notationKey: declaredKey,
    sheetKey: inferred,
    capo: opts.capo,
    melodyAbc: opts.melodyAbc,
    noteLines: opts.noteLines,
  })
  const bestTranspose = (transposeOpts || []).find(function(opt) {
    return opt && opt.id !== 'as-is' && opt.transposeSemitones
  })

  const suggestions = [
    {
      id: 'fix-key',
      label: 'Set key to ' + inferred + ' (match chords)',
      action: 'setKey',
      key: inferred,
      preferred: true,
      rationale: 'Declared key ' + declaredKey + ' does not match chord chart (' + inferred + ')',
    },
  ]
  if (bestTranspose) {
    suggestions.push({
      id: 'transpose-chords',
      label: bestTranspose.label || ('Transpose chords to ' + declaredKey),
      action: 'transposeChords',
      key: declaredKey,
      chordGridText: bestTranspose.chordGridText,
      transposeSemitones: bestTranspose.transposeSemitones,
      preferred: false,
      rationale: bestTranspose.rationale || '',
    })
  }
  suggestions.push({
    id: 'as-is',
    label: 'Keep key and chords as-is',
    action: 'noop',
    key: declaredKey,
    preferred: false,
    rationale: 'Do not change key or chord spellings',
  })
  return suggestions
}

