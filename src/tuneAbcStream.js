/**
 * Stream-parse ABC tunebook text one tune at a time.
 */
import { stripPerformanceSetLines } from './performanceSetSync'
import { stripPlaylistLines } from './playlistSync'
import { stripPracticeListLines } from './practiceListSync'

function stripDeletedTuneLines(abc) {
  return (abc || '').split('\n').filter(function(line) {
    return !line.trim().startsWith('% abcbook-deleted-tune')
  }).join('\n')
}

function prepareAbcForTuneSplit(abc) {
  var withoutSets = stripPracticeListLines(stripPlaylistLines(stripPerformanceSetLines(abc || '')))
  return stripDeletedTuneLines(withoutSets)
}

/**
 * Invoke onTune(tune, index) for each tune in abc. Returns count parsed.
 * abc2json must be provided (from useAbcTools).
 */
export function iterateTunesFromAbc(abc, abc2json, onTune) {
  const cleaned = prepareAbcForTuneSplit(abc)
  const parts = cleaned.split('X:')
  let count = 0
  parts.forEach(function(part) {
    if (!part || !part.trim()) return
    const tune = abc2json('X:' + part)
    if (tune && tune.id != null) {
      count += 1
      onTune(tune, count - 1)
    }
  })
  return count
}

/**
 * Async generator-style: calls onTune per tune, yields to main between batches.
 */
export async function iterateTunesFromAbcAsync(abc, abc2json, onTune, options) {
  const opts = options || {}
  const batchSize = opts.batchSize > 0 ? opts.batchSize : 50
  const cleaned = prepareAbcForTuneSplit(abc)
  const parts = cleaned.split('X:').filter(function(p) { return p && p.trim() })
  let count = 0
  for (let i = 0; i < parts.length; i += 1) {
    const tune = abc2json('X:' + parts[i])
    if (tune && tune.id != null) {
      await onTune(tune, count)
      count += 1
    }
    if (count > 0 && count % batchSize === 0 && opts.yieldToMain) {
      await opts.yieldToMain()
    }
  }
  return count
}
