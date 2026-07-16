import { useEffect, useRef } from 'react'
import { subscribeOpenFieldSuggestions } from '../fieldSuggestionsOpen'

/**
 * Subscribe to top-strip / deep-link requests to open suggestions for a field kind.
 * onOpen should open the selection dialog (using job Original Value).
 */
export function useOpenFieldSuggestions(tuneId, kind, onOpen) {
  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen

  useEffect(function() {
    if (!tuneId || !kind) return function() {}
    return subscribeOpenFieldSuggestions(function(openTuneId, openKind) {
      if (String(tuneId) !== String(openTuneId)) return
      if (String(kind) !== String(openKind)) return
      if (typeof onOpenRef.current === 'function') onOpenRef.current()
    })
  }, [tuneId, kind])
}
