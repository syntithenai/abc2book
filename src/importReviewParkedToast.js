import { toast } from 'react-toastify'
import {
  hasActiveImportReviewSession,
  isImportReviewUiVisible,
  subscribeImportReviewSession,
} from './importReviewSessionStore'

const PARKED_IMPORT_REVIEW_TOAST_ID = 'import-review-parked'
const AUTO_CLOSE_MS = 3000

/** Tracks last known UI visibility so we only toast on close→park, once. */
let wasUiVisible = false

/**
 * Show a brief toast once when import review is closed while a session remains.
 * Auto-closes after 3s. Idempotent for later parked-session updates.
 */
export function syncParkedImportReviewToast() {
  const uiVisible = isImportReviewUiVisible()
  const parked = hasActiveImportReviewSession() && !uiVisible
  const justClosed = wasUiVisible && !uiVisible && parked
  wasUiVisible = uiVisible

  if (!parked) {
    toast.dismiss(PARKED_IMPORT_REVIEW_TOAST_ID)
    return
  }
  if (!justClosed) return

  toast.info(
    'Import review paused, restart via review button in top navigation.',
    {
      toastId: PARKED_IMPORT_REVIEW_TOAST_ID,
      autoClose: AUTO_CLOSE_MS,
      closeOnClick: true,
      draggable: false,
    }
  )
}

/** Subscribe once from app chrome so parked sessions stay discoverable. */
export function startParkedImportReviewToastSync() {
  wasUiVisible = isImportReviewUiVisible()
  syncParkedImportReviewToast()
  return subscribeImportReviewSession(syncParkedImportReviewToast)
}

export function __resetParkedImportReviewToastForTests() {
  wasUiVisible = false
  toast.dismiss(PARKED_IMPORT_REVIEW_TOAST_ID)
}
