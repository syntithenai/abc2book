const STORAGE_KEY = 'bookstorage_performance_keys';

export const DEFAULT_PERFORMANCE_BINDINGS = {
  scrollDown: ['PageDown'],
  scrollUp: ['PageUp'],
  scrollStepFraction: 1,
  scrollEdgeThresholdPx: 24,
};

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return Object.assign({}, DEFAULT_PERFORMANCE_BINDINGS);
    const parsed = JSON.parse(raw);
    const merged = Object.assign({}, DEFAULT_PERFORMANCE_BINDINGS, parsed);
    merged.scrollDown = mergeKeyList(DEFAULT_PERFORMANCE_BINDINGS.scrollDown, parsed.scrollDown);
    merged.scrollUp = mergeKeyList(DEFAULT_PERFORMANCE_BINDINGS.scrollUp, parsed.scrollUp);
    merged.nextTune = mergeKeyList(DEFAULT_PERFORMANCE_BINDINGS.nextTune || [], parsed.nextTune);
    merged.previousTune = mergeKeyList(DEFAULT_PERFORMANCE_BINDINGS.previousTune || [], parsed.previousTune);
    return merged;
  } catch (e) {
    return Object.assign({}, DEFAULT_PERFORMANCE_BINDINGS);
  }
}

function mergeKeyList(defaultKeys, storedKeys) {
  const result = Array.isArray(defaultKeys) ? defaultKeys.slice() : [];
  if (!Array.isArray(storedKeys)) return result;
  storedKeys.forEach(function(key) {
    if (key && result.indexOf(key) === -1) result.push(key);
  });
  return result;
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

function eventKeyLabels(event) {
  const labels = [];
  const key = eventKeyLabel(event);
  if (key) labels.push(key);
  if (event && event.code && event.code !== key) labels.push(event.code);
  return labels;
}

export function matchPerformanceAction(event, bindings) {
  const config = bindings || readStored();
  const labels = eventKeyLabels(event);
  if (labels.length === 0) return null;
  for (let i = 0; i < labels.length; i++) {
    const key = labels[i];
    if ((config.nextTune || []).indexOf(key) !== -1) return 'nextTune';
    if ((config.previousTune || []).indexOf(key) !== -1) return 'previousTune';
    if ((config.scrollDown || []).indexOf(key) !== -1) return 'scrollDown';
    if ((config.scrollUp || []).indexOf(key) !== -1) return 'scrollUp';
  }
  return null;
}
