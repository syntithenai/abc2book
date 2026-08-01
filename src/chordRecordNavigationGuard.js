let activeBlocker = null;

export function setChordRecordNavigationBlocker(blocker) {
  activeBlocker = typeof blocker === 'function' ? blocker : null;
}

export function isChordRecordNavigationBlocked() {
  return !!(activeBlocker && activeBlocker());
}

export const CHORD_RECORD_LEAVE_MESSAGE =
  'Save your recorded chords or cancel the recording session before leaving.';

export function confirmLeaveChordRecord() {
  if (!isChordRecordNavigationBlocked()) return true;
  return window.confirm(CHORD_RECORD_LEAVE_MESSAGE);
}
