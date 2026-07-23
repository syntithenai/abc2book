/** Next unused numeric voice key (e.g. "1", "2", …). */
export function nextVoiceKey(voices) {
  let n = 1;
  while (voices && voices[String(n)]) n += 1;
  return String(n);
}

/** Ordered voice keys for a tune; prefers stored voiceOrder, then object key order. */
export function orderedVoiceKeys(tune) {
  const voices = tune && tune.voices ? tune.voices : {};
  const keys = Object.keys(voices);
  const stored = Array.isArray(tune && tune.voiceOrder) ? tune.voiceOrder : [];
  const ordered = [];
  stored.forEach(function(key) {
    if (voices[key] && ordered.indexOf(key) < 0) ordered.push(key);
  });
  keys.forEach(function(key) {
    if (ordered.indexOf(key) < 0) ordered.push(key);
  });
  return ordered;
}

/** Rebuild voices object so keys appear in the given order. */
export function reorderVoicesObject(voices, orderedKeys) {
  const next = {};
  (orderedKeys || []).forEach(function(key) {
    if (voices && voices[key]) next[key] = voices[key];
  });
  Object.keys(voices || {}).forEach(function(key) {
    if (!next[key]) next[key] = voices[key];
  });
  return next;
}

/** Move one voice key up/down in order; returns new key array or null if unchanged. */
export function moveVoiceKeyInOrder(voiceKeys, index, delta) {
  const keys = (voiceKeys || []).slice();
  const nextIndex = index + delta;
  if (index < 0 || index >= keys.length || nextIndex < 0 || nextIndex >= keys.length) return null;
  const moved = keys.splice(index, 1)[0];
  keys.splice(nextIndex, 0, moved);
  return keys;
}
