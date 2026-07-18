/**
 * Tiny UI store so BackgroundReviewNotifications can open File OCR review.
 */
const listeners = new Set()
let state = { show: false, focusJobId: null }

function notify() {
  listeners.forEach(function(listener) {
    listener()
  })
}

export function getFileOcrReviewUiState() {
  return state
}

export function subscribeFileOcrReviewUi(listener) {
  listeners.add(listener)
  return function unsubscribe() {
    listeners.delete(listener)
  }
}

export function requestFileOcrReview(jobId) {
  state = { show: true, focusJobId: jobId || null }
  notify()
}

export function hideFileOcrReview() {
  state = { show: false, focusJobId: null }
  notify()
}

export function __resetFileOcrReviewUiForTests() {
  state = { show: false, focusJobId: null }
}
