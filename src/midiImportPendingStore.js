/**
 * Bridges openMidiImportWizard() promises with the /import/midi page route.
 *
 * Options stay available until complete/cancel so React StrictMode remounts
 * (and soft navigations back to the page) can still read the chosen file.
 */

let pendingCallbacks = null;
let pendingOptions = null;
let hostNavigate = null;

export function registerMidiImportNavigate(navigate, onlyIfCurrent) {
  if (navigate == null && onlyIfCurrent != null && hostNavigate !== onlyIfCurrent) {
    return;
  }
  hostNavigate = navigate;
}

export function beginMidiImportOpen(options, resolve, reject) {
  pendingCallbacks = { resolve: resolve, reject: reject };
  pendingOptions = options || {};
  if (hostNavigate) {
    hostNavigate('/import/midi');
  }
}

/** Read pending open options without clearing (StrictMode-safe). */
export function peekMidiImportOptions() {
  return pendingOptions;
}

/**
 * @deprecated Prefer peekMidiImportOptions + clear on complete/cancel.
 * Kept for callers; does not clear so remounts still see the file.
 */
export function consumeMidiImportOptions() {
  return pendingOptions;
}

export function hasMidiImportPending() {
  return pendingOptions != null || pendingCallbacks != null;
}

export function completeMidiImportOpen(payload) {
  if (pendingCallbacks && pendingCallbacks.resolve) {
    pendingCallbacks.resolve(payload);
  }
  pendingCallbacks = null;
  pendingOptions = null;
}

export function cancelMidiImportOpen(error) {
  if (pendingCallbacks && pendingCallbacks.reject) {
    pendingCallbacks.reject(error || new Error('MIDI import cancelled'));
  }
  pendingCallbacks = null;
  pendingOptions = null;
}
