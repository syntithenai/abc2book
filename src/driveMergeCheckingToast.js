/** Ref-count helpers for concurrent Drive merge checks (silent — no progress toast). */

let pendingCount = 0

export function beginDriveMergeCheckingToast() {
  pendingCount += 1
}

export function endDriveMergeCheckingToast() {
  pendingCount = Math.max(0, pendingCount - 1)
}

export function resetDriveMergeCheckingToastForTests() {
  pendingCount = 0
}
