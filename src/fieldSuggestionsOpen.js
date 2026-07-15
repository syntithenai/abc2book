/**
 * Cross-component request to open the suggestions UI for a tune field kind.
 * FieldLookupReviewButton (and Search buttons) subscribe while mounted.
 */
export const OPEN_FIELD_SUGGESTIONS_EVENT = 'abc2book:open-field-suggestions'

export function requestOpenFieldSuggestions(tuneId, kind) {
  if (!tuneId || !kind) return
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  window.dispatchEvent(new CustomEvent(OPEN_FIELD_SUGGESTIONS_EVENT, {
    detail: { tuneId: String(tuneId), kind: String(kind) },
  }))
}

export function subscribeOpenFieldSuggestions(handler) {
  if (typeof window === 'undefined' || typeof handler !== 'function') {
    return function() {}
  }
  function onEvent(event) {
    const detail = event && event.detail ? event.detail : {}
    handler(detail.tuneId, detail.kind)
  }
  window.addEventListener(OPEN_FIELD_SUGGESTIONS_EVENT, onEvent)
  return function() {
    window.removeEventListener(OPEN_FIELD_SUGGESTIONS_EVENT, onEvent)
  }
}
