/** Pre-quantization MIDI note cleanup (mirrors local-resolver/midi_cleanup.py). */

export const DEFAULT_CLEANUP_OPTIONS = {
  velocityGate: 0,
  minDurationMs: 0,
  retriggerMergeMs: 0,
  swingAmount: 0,
  sustainTrim: false,
};

export function normalizeCleanupOptions(options) {
  const opts = options && typeof options === 'object' ? options : {};
  return {
    velocityGate: Math.max(0, Math.min(127, parseInt(opts.velocityGate ?? opts.velocity_gate ?? 0, 10) || 0)),
    minDurationMs: Math.max(0, parseFloat(opts.minDurationMs ?? opts.min_duration_ms ?? 0) || 0),
    retriggerMergeMs: Math.max(0, parseFloat(opts.retriggerMergeMs ?? opts.retrigger_merge_ms ?? 0) || 0),
    swingAmount: Math.max(0, Math.min(0.5, parseFloat(opts.swingAmount ?? opts.swing_amount ?? 0) || 0)),
    sustainTrim: !!(opts.sustainTrim ?? opts.sustain_trim),
  };
}

function applyVelocityGate(notes, gate) {
  if (!gate) return notes;
  return notes.filter(function(note) {
    const velocity = note.velocity != null
      ? note.velocity
      : Math.round((note.confidence || 0.5) * 127);
    return velocity >= gate;
  });
}

function applyMinDuration(notes, minMs) {
  if (!minMs) return notes;
  const minSec = minMs / 1000;
  return notes.filter(function(note) {
    return (note.end - note.start) >= minSec;
  });
}

function applyRetriggerMerge(notes, mergeMs) {
  if (!mergeMs || !notes.length) return notes;
  const tol = mergeMs / 1000;
  const ordered = notes.slice().sort(function(a, b) {
    return a.start - b.start || a.midi - b.midi;
  });
  const merged = [];
  ordered.forEach(function(note) {
    if (!merged.length) {
      merged.push(Object.assign({}, note));
      return;
    }
    const prev = merged[merged.length - 1];
    const samePitch = prev.midi === note.midi;
    const close = Math.abs(note.start - prev.end) <= tol;
    if (samePitch && close) {
      prev.end = Math.max(prev.end, note.end);
      return;
    }
    merged.push(Object.assign({}, note));
  });
  return merged;
}

function applySwing(notes, swingAmount, tempoBpm) {
  if (!swingAmount || !notes.length) return notes;
  const beatDuration = 60 / Math.max(tempoBpm || 120, 1);
  const eighth = beatDuration / 2;
  return notes.map(function(note) {
    const start = note.start;
    const posInBeat = beatDuration > 0 ? (start % beatDuration) / beatDuration : 0;
    if (posInBeat > 0.4 && posInBeat < 0.6) {
      const shift = swingAmount * eighth;
      return Object.assign({}, note, {
        start: start + shift,
        end: note.end + shift,
      });
    }
    return Object.assign({}, note);
  });
}

export function cleanupIsActive(options) {
  const opts = normalizeCleanupOptions(options);
  return opts.velocityGate > 0
    || opts.minDurationMs > 0
    || opts.retriggerMergeMs > 0
    || opts.swingAmount > 0
    || opts.sustainTrim;
}

export function applyMidiCleanup(notes, options, tempoBpm) {
  const originalCount = (notes || []).length;
  const opts = normalizeCleanupOptions(options);
  let cleaned = (notes || []).map(function(note) { return Object.assign({}, note); });

  cleaned = applyVelocityGate(cleaned, opts.velocityGate);
  cleaned = applyMinDuration(cleaned, opts.minDurationMs);
  cleaned = applyRetriggerMerge(cleaned, opts.retriggerMergeMs);
  cleaned = applySwing(cleaned, opts.swingAmount, tempoBpm || 120);

  const removed = originalCount - cleaned.length;
  return {
    notes: cleaned,
    stats: {
      originalCount: originalCount,
      cleanedCount: cleaned.length,
      removedCount: Math.max(0, removed),
      removedPercent: Math.round(100 * Math.max(0, removed) / Math.max(originalCount, 1) * 10) / 10,
    },
  };
}
