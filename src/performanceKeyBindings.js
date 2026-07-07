const STORAGE_KEY = 'bookstorage_performance_keys';

export const DEFAULT_PERFORMANCE_BINDINGS = {
  scrollDown: ['PageDown'],
  scrollUp: ['PageUp'],
  scrollStepFraction: 0.8,
  scrollEdgeThresholdPx: 8,
};

export const GIG_PERFORMANCE_BINDINGS = {
  scrollDown: ['ArrowDown'],
  scrollUp: ['ArrowUp'],
  nextTune: ['ArrowRight'],
  previousTune: ['ArrowLeft'],
  scrollStepFraction: 0.25,
  scrollEdgeThresholdPx: 8,
};

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return Object.assign({}, DEFAULT_PERFORMANCE_BINDINGS);
    const parsed = JSON.parse(raw);
    return Object.assign({}, DEFAULT_PERFORMANCE_BINDINGS, parsed);
  } catch (e) {
    return Object.assign({}, DEFAULT_PERFORMANCE_BINDINGS);
  }
}

function writeStored(bindings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
}

export function getPerformanceBindings() {
  return readStored();
}

export function setPerformanceBindings(bindings) {
  writeStored(Object.assign({}, DEFAULT_PERFORMANCE_BINDINGS, bindings));
}

export function resetPerformanceBindings() {
  writeStored(Object.assign({}, DEFAULT_PERFORMANCE_BINDINGS));
}

export function setPerformanceBindingKeys(action, keys) {
  const next = readStored();
  next[action] = Array.isArray(keys) ? keys.slice() : [];
  writeStored(next);
  return next;
}

function eventKeyLabel(event) {
  return event && event.key ? event.key : '';
}

export function matchPerformanceAction(event, bindings) {
  const config = bindings || readStored();
  const key = eventKeyLabel(event);
  if (!key) return null;
  if ((config.nextTune || []).indexOf(key) !== -1) return 'nextTune';
  if ((config.previousTune || []).indexOf(key) !== -1) return 'previousTune';
  if ((config.scrollDown || []).indexOf(key) !== -1) return 'scrollDown';
  if ((config.scrollUp || []).indexOf(key) !== -1) return 'scrollUp';
  return null;
}
