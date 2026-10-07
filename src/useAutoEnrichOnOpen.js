import { useEffect } from 'react'
import { runAddTuneAutoEnrich, isAddTuneAutoEnrichPending } from './addTuneAutoEnrich'
import { inferNotationSongType } from './textSearchIndexUtils'

/**
 * Imported records can carry `% abcbook-auto-enrich pending` so the first open
 * runs the same background search as Add. The flag is cleared and saved before
 * the search starts so a reload never repeats it.
 */
export function startAutoEnrichOnOpen(options) {
  const opts = options || {}
  const tune = opts.tune
  const tunebook = opts.tunebook
  if (!tune || !tune.id || !tune.autoEnrichOnOpen || !tunebook) return false
  if (isAddTuneAutoEnrichPending(tune.id)) return false

  const cleared = tunebook.saveTune(
    Object.assign({}, tune, { autoEnrichOnOpen: false }),
    false,
    { skipHistory: true, immediate: true }
  ) || Object.assign({}, tune, { autoEnrichOnOpen: false })
  if (typeof opts.forceRefresh === 'function') opts.forceRefresh()

  const run = opts.runEnrich || runAddTuneAutoEnrich
  Promise.resolve(run({
    tune: cleared,
    tunebook: tunebook,
    abcjsParser: opts.abcjsParser,
    accessToken: opts.accessToken || '',
    resolverAvailable: opts.resolverAvailable,
    searchIndex: opts.searchIndex,
    loadTuneTexts: opts.loadTuneTexts,
    forceRefresh: opts.forceRefresh,
    songType: inferNotationSongType(cleared.rhythm || '', cleared.composer || ''),
  })).catch(function() {})
  return true
}

export default function useAutoEnrichOnOpen(options) {
  const opts = options || {}
  const tune = opts.tune
  const enabled = opts.enabled !== false
  const flagged = !!(tune && tune.autoEnrichOnOpen)
  const tuneId = tune && tune.id
  useEffect(function() {
    if (!enabled || !flagged) return
    startAutoEnrichOnOpen(opts)
    // Only re-check when the viewed tune or its flag changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, flagged, tuneId])
}
