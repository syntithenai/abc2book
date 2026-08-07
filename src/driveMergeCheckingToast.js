import { toast } from 'react-toastify'

const DRIVE_MERGE_CHECKING_TOAST_ID = 'drive-merge-checking'
const SHOW_DELAY_MS = 500

let pendingCount = 0
let showTimer = null

export function beginDriveMergeCheckingToast() {
  pendingCount += 1
  if (pendingCount !== 1 || showTimer) return
  showTimer = setTimeout(function() {
    showTimer = null
    if (pendingCount > 0) {
      toast.info('Checking Google Drive for updates…', {
        toastId: DRIVE_MERGE_CHECKING_TOAST_ID,
        autoClose: false,
        hideProgressBar: true,
      })
    }
  }, SHOW_DELAY_MS)
}

export function endDriveMergeCheckingToast() {
  pendingCount = Math.max(0, pendingCount - 1)
  if (pendingCount > 0) return
  if (showTimer) {
    clearTimeout(showTimer)
    showTimer = null
  }
  toast.dismiss(DRIVE_MERGE_CHECKING_TOAST_ID)
}

export function resetDriveMergeCheckingToastForTests() {
  pendingCount = 0
  if (showTimer) {
    clearTimeout(showTimer)
    showTimer = null
  }
  toast.dismiss(DRIVE_MERGE_CHECKING_TOAST_ID)
}
