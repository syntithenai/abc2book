/** Inline ABC header tokens for scratchpad notation inserted into another tune. */

function beatLengthForMeter(meter) {
  switch (String(meter || '').trim()) {
    case '2/2':
    case '3/2':
    case '4/2':
      return '1/2'
    case '3/8':
    case '6/8':
    case '9/8':
    case '12/8':
      return '3/8'
  }
  return '1/4'
}

function cleanTempo(tempoIn) {
  const tempo = String(tempoIn == null ? '' : tempoIn).trim()
  if (!tempo) return 0
  const parts = tempo.split('=')
  const parsed = parseInt(parts[parts.length - 1], 10)
  return parsed > 0 ? parsed : 0
}

function normalizeKey(key) {
  return String(key == null ? '' : key).trim()
}

function normalizeMeter(meter) {
  return String(meter == null ? '' : meter).trim()
}

/**
 * Build inline [M:…] / [K:…] / [Q:…] tokens when scratchpad meta differs from target.
 */
export function scratchpadInlineHeaderTokens(sourceTune, targetTune) {
  const tokens = []
  if (!sourceTune || !targetTune) return tokens

  const sourceMeter = normalizeMeter(sourceTune.meter)
  const targetMeter = normalizeMeter(targetTune.meter)
  if (sourceMeter && targetMeter && sourceMeter !== targetMeter) {
    tokens.push('[M:' + sourceMeter + ']')
  }

  const sourceKey = normalizeKey(sourceTune.key)
  const targetKey = normalizeKey(targetTune.key)
  if (sourceKey && targetKey && sourceKey !== targetKey) {
    tokens.push('[K:' + sourceKey + ']')
  }

  const sourceTempo = cleanTempo(sourceTune.tempo)
  const targetTempo = cleanTempo(targetTune.tempo)
  if (sourceTempo > 0 && sourceTempo !== targetTempo) {
    const beat = beatLengthForMeter(sourceMeter || targetMeter || '4/4')
    tokens.push('[Q:' + beat + '=' + sourceTempo + ']')
  }

  return tokens
}

/** Prepend inline header tokens to the first note line of a voice. */
export function prependInlineHeadersToNotes(notes, tokens) {
  if (!tokens || !tokens.length || !Array.isArray(notes) || !notes.length) {
    return notes
  }
  const prefix = tokens.join(' ') + ' '
  const next = notes.slice()
  next[0] = (prefix + String(next[0] || '').trim()).trim()
  return next
}

/** Inject inline header tokens at a 1-based bar index in serialized note lines. */
export function injectInlineHeadersAtBar(noteLines, tokens, fromBar) {
  if (!tokens || !tokens.length || !Array.isArray(noteLines) || !noteLines.length) {
    return noteLines
  }
  const prefix = tokens.join(' ') + ' '
  const barTarget = Math.max(1, parseInt(fromBar, 10) || 1)
  let barCount = 0
  const next = noteLines.slice()
  for (let li = 0; li < next.length; li += 1) {
    const line = String(next[li] || '')
    const parts = line.split('|')
    for (let pi = 0; pi < parts.length; pi += 1) {
      barCount += 1
      if (barCount === barTarget) {
        parts[pi] = (prefix + String(parts[pi] || '').trim()).trim()
        next[li] = parts.join('|')
        return next
      }
    }
  }
  return prependInlineHeadersToNotes(next, tokens)
}
