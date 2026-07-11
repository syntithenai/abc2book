/**
 * Canonical bar/beat model for chord merge, scaffolds, and import.
 * Compound meters (6/8, 9/8, 12/8) use dotted-beat counts, not unit-slot counts as "beats".
 */

export function normalizeMeter(meterText) {
  const trimmed = String(meterText || '4/4').trim()
  if (!trimmed) return '4/4'
  if (trimmed === 'C') return '4/4'
  if (trimmed === 'C|') return '2/2'
  const parts = trimmed.split('/')
  if (parts.length === 2) {
    const num = parseInt(parts[0], 10)
    const den = parseInt(parts[1], 10)
    if (num > 0 && den > 0) return String(num) + '/' + String(den)
  }
  return '4/4'
}

export function parseMeterParts(meterText) {
  const normalized = normalizeMeter(meterText)
  const parts = normalized.split('/')
  return {
    num: parseInt(parts[0], 10) || 4,
    den: parseInt(parts[1], 10) || 4,
    meter: normalized,
  }
}

export function defaultNoteLengthForMeter(meterText) {
  const { num, den } = parseMeterParts(meterText)
  const meterValue = num / den
  return meterValue < 0.75 ? '1/16' : '1/8'
}

export function parseNoteLengthParts(noteLengthText, meterText) {
  const raw = String(noteLengthText || '').trim()
  if (raw) {
    const parts = raw.split('/')
    if (parts.length === 2 && parts[0] !== '' && parts[1] !== '') {
      const num = parseInt(parts[0], 10)
      const den = parseInt(parts[1], 10)
      if (num > 0 && den > 0) {
        return { num: num, den: den, noteLength: String(num) + '/' + String(den) }
      }
    }
  }
  const fallback = defaultNoteLengthForMeter(meterText)
  const fb = fallback.split('/')
  return { num: parseInt(fb[0], 10), den: parseInt(fb[1], 10), noteLength: fallback }
}

export function isCompoundMeter(meterText) {
  const { num, den } = parseMeterParts(meterText)
  return den === 8 && num >= 6 && num % 3 === 0
}

/**
 * @returns {{
 *   meter: string,
 *   noteLength: string,
 *   unitSlotsPerBar: number,
 *   beatCount: number,
 *   beatUnitSlots: number,
 *   compound: boolean,
 * }}
 */
export function getBarModel(meterText, noteLengthText) {
  const meterInfo = parseMeterParts(meterText)
  const lengthInfo = parseNoteLengthParts(noteLengthText, meterInfo.meter)
  const meterValue = meterInfo.num / meterInfo.den
  const unitValue = lengthInfo.num / lengthInfo.den
  const unitSlotsPerBar = Math.max(1, Math.round(meterValue / unitValue))

  const compound = isCompoundMeter(meterInfo.meter)
  let beatCount
  if (compound) {
    beatCount = Math.max(1, Math.round(meterInfo.num / 3))
  } else {
    beatCount = Math.max(1, meterInfo.num)
  }

  let beatUnitSlots = Math.max(1, Math.round(unitSlotsPerBar / beatCount))
  // Keep product consistent when rounding drifts.
  if (beatUnitSlots * beatCount !== unitSlotsPerBar && unitSlotsPerBar % beatCount === 0) {
    beatUnitSlots = unitSlotsPerBar / beatCount
  }

  return {
    meter: meterInfo.meter,
    noteLength: lengthInfo.noteLength,
    unitSlotsPerBar: unitSlotsPerBar,
    beatCount: beatCount,
    beatUnitSlots: beatUnitSlots,
    compound: compound,
  }
}

/**
 * Positions (in unit-slot indices) for chord tokens within one bar.
 * Compound / beat-matched counts snap to beat starts; otherwise even spread.
 * Anchors map word fraction through the bar's beat span.
 */
export function beatPositionsForBarChords(barChords, barModel, anchors, lyricWordCount) {
  const chords = Array.isArray(barChords) ? barChords : []
  const model = barModel || getBarModel('4/4', '1/8')
  const N = Math.max(1, model.unitSlotsPerBar)
  const beatCount = Math.max(1, model.beatCount)
  const beatUnitSlots = Math.max(1, model.beatUnitSlots)
  const wordCount = Math.max(1, lyricWordCount || 0)
  const hasAnchors = Array.isArray(anchors) && anchors.length > 0
  const tokenCount = chords.length
  const snapToBeats = tokenCount > 0
    && tokenCount <= beatCount
    && (model.compound || tokenCount === beatCount)

  const positions = []
  chords.forEach(function(chord, index) {
    let position
    if (hasAnchors && anchors[index] && typeof anchors[index].wordIndex === 'number') {
      const frac = anchors[index].wordIndex / wordCount
      const beatIndex = Math.min(beatCount - 1, Math.floor(frac * beatCount))
      const withinBeat = (frac * beatCount) - beatIndex
      position = beatIndex * beatUnitSlots + withinBeat * beatUnitSlots
    } else if (snapToBeats) {
      position = index * beatUnitSlots
    } else {
      position = (index / Math.max(1, tokenCount)) * N
    }
    if (position < 0) position = 0
    if (position >= N) position = N - 0.001
    positions.push(position)
  })
  return positions
}

export function metersEquivalent(a, b) {
  return normalizeMeter(a) === normalizeMeter(b)
}

/**
 * Resolve sheet vs notation meter before merge.
 * @returns {{ options: Array, assumedDefault: boolean, resolvedMeter: string }}
 */
export function buildMeterMergeOptions(sheetMeter, notationMeter) {
  const sheet = String(sheetMeter || '').trim()
  const notation = String(notationMeter || '').trim()
  const hasSheet = !!sheet
  const hasNotation = !!notation

  if (hasSheet && hasNotation && !metersEquivalent(sheet, notation)) {
    return {
      assumedDefault: false,
      resolvedMeter: normalizeMeter(notation),
      options: [
        {
          id: 'keep-notation',
          label: 'Keep notation meter (' + normalizeMeter(notation) + ')',
          meter: normalizeMeter(notation),
          rationale: 'Use the tune / ABC time signature for chord placement.',
        },
        {
          id: 'use-sheet',
          label: 'Use sheet meter (' + normalizeMeter(sheet) + ')',
          meter: normalizeMeter(sheet),
          rationale: 'Apply the chord sheet time signature (does not invent a third meter).',
        },
      ],
    }
  }

  if (hasNotation) {
    return {
      assumedDefault: false,
      resolvedMeter: normalizeMeter(notation),
      options: [{
        id: 'notation',
        label: 'Notation meter (' + normalizeMeter(notation) + ')',
        meter: normalizeMeter(notation),
        rationale: '',
      }],
    }
  }

  if (hasSheet) {
    return {
      assumedDefault: false,
      resolvedMeter: normalizeMeter(sheet),
      options: [{
        id: 'sheet',
        label: 'Sheet meter (' + normalizeMeter(sheet) + ')',
        meter: normalizeMeter(sheet),
        rationale: '',
      }],
    }
  }

  return {
    assumedDefault: true,
    resolvedMeter: '4/4',
    options: [{
      id: 'assume-4-4',
      label: 'Assumed 4/4',
      meter: '4/4',
      rationale: 'No time signature on the sheet or tune — assuming 4/4 for chord placement.',
    }],
  }
}

export function fullBarRestAbc(unitSlotsPerBar) {
  const slots = Math.max(1, parseInt(unitSlotsPerBar, 10) || 8)
  return '|: z' + slots + ' |]'
}
