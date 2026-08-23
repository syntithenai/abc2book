/** Pre-quantization MIDI note cleanup (mirrors local-resolver/midi_cleanup.py). */

export const DEFAULT_CLEANUP_OPTIONS = {
  velocityGate: 0,
  velocityMax: 127,
  minDurationMs: 0,
  maxDurationMs: 0,
  retriggerMergeMs: 0,
  swingAmount: 0,
  sustainTrim: false,
  keepPolyphonicChords: true,
  pitchMin: 0,
  pitchMax: 127,
};

/** Light preset for notation-first MIDI import — only obvious ghosts. */
export const LIGHT_CLEANUP_OPTIONS = {
  velocityGate: 1,
  velocityMax: 127,
  minDurationMs: 40,
  maxDurationMs: 0,
  retriggerMergeMs: 25,
  swingAmount: 0,
  sustainTrim: true,
  keepPolyphonicChords: true,
  pitchMin: 0,
  pitchMax: 127,
};

export const CLEANUP_PRESETS = {
  ghost: Object.assign({}, LIGHT_CLEANUP_OPTIONS),
  piano: Object.assign({}, LIGHT_CLEANUP_OPTIONS, {
    velocityGate: 8,
    minDurationMs: 30,
    retriggerMergeMs: 40,
    keepPolyphonicChords: true,
  }),
  orchestral: Object.assign({}, LIGHT_CLEANUP_OPTIONS, {
    velocityGate: 1,
    minDurationMs: 40,
    retriggerMergeMs: 20,
    keepPolyphonicChords: true,
  }),
  drums: Object.assign({}, LIGHT_CLEANUP_OPTIONS, {
    velocityGate: 5,
    minDurationMs: 20,
    retriggerMergeMs: 15,
    keepPolyphonicChords: true,
  }),
};

export function normalizeCleanupOptions(options) {
  const opts = options && typeof options === 'object' ? options : {};
  const keepPoly = opts.keepPolyphonicChords ?? opts.keep_polyphonic_chords;
  const collapse = opts.collapseChords ?? opts.collapse_chords;
  let keepPolyphonicChords = true;
  if (keepPoly != null) keepPolyphonicChords = !!keepPoly;
  else if (collapse != null) keepPolyphonicChords = !collapse;

  return {
    velocityGate: Math.max(0, Math.min(127, parseInt(opts.velocityGate ?? opts.velocity_gate ?? 0, 10) || 0)),
    velocityMax: Math.max(0, Math.min(127, parseInt(opts.velocityMax ?? opts.velocity_max ?? 127, 10) || 127)),
    minDurationMs: Math.max(0, parseFloat(opts.minDurationMs ?? opts.min_duration_ms ?? 0) || 0),
    maxDurationMs: Math.max(0, parseFloat(opts.maxDurationMs ?? opts.max_duration_ms ?? 0) || 0),
    retriggerMergeMs: Math.max(0, parseFloat(opts.retriggerMergeMs ?? opts.retrigger_merge_ms ?? 0) || 0),
    swingAmount: Math.max(0, Math.min(0.5, parseFloat(opts.swingAmount ?? opts.swing_amount ?? 0) || 0)),
    sustainTrim: !!(opts.sustainTrim ?? opts.sustain_trim),
    keepPolyphonicChords: keepPolyphonicChords,
    pitchMin: Math.max(0, Math.min(127, parseInt(opts.pitchMin ?? opts.pitch_min ?? 0, 10) || 0)),
    pitchMax: Math.max(0, Math.min(127, parseInt(opts.pitchMax ?? opts.pitch_max ?? 127, 10) || 127)),
  };
}

function noteVelocity(note) {
  return note.velocity != null
    ? note.velocity
    : Math.round((note.confidence || 0.5) * 127);
}

function applyVelocityGate(notes, gate) {
  if (!gate) return notes;
  return notes.filter(function(note) {
    return noteVelocity(note) >= gate;
  });
}

function applyVelocityMax(notes, maxVel) {
  if (maxVel >= 127) return notes;
  return notes.filter(function(note) {
    return noteVelocity(note) <= maxVel;
  });
}

function applyMinDuration(notes, minMs) {
  if (!minMs) return notes;
  const minSec = minMs / 1000;
  return notes.filter(function(note) {
    return (note.end - note.start) >= minSec;
  });
}

function applyMaxDuration(notes, maxMs, minMs) {
  if (!maxMs) return notes;
  const maxSec = maxMs / 1000;
  const minSec = (minMs || 0) / 1000;
  return notes.map(function(note) {
    const start = note.start;
    let end = note.end;
    if (end - start > maxSec) {
      end = start + maxSec;
    }
    if (minSec && end - start < minSec) {
      return null;
    }
    return Object.assign({}, note, { end: end });
  }).filter(Boolean);
}

function applyPitchRange(notes, pitchMin, pitchMax) {
  const lo = Math.min(pitchMin, pitchMax);
  const hi = Math.max(pitchMin, pitchMax);
  if (lo <= 0 && hi >= 127) return notes;
  return notes.filter(function(note) {
    const midi = Number(note.midi) || 0;
    return midi >= lo && midi <= hi;
  });
}

export function applyRetriggerMerge(notes, mergeMs) {
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

export function applyCollapseChords(notes) {
  if (!notes || !notes.length) return notes;
  const ordered = notes.slice().sort(function(a, b) {
    return a.start - b.start || b.midi - a.midi;
  });
  const kept = [];
  const ONSET_TOL = 0.02;
  ordered.forEach(function(note) {
    const start = note.start;
    let cluster = null;
    for (let i = kept.length - 1; i >= 0; i -= 1) {
      if (Math.abs(kept[i].start - start) <= ONSET_TOL) {
        cluster = kept[i];
        break;
      }
      if (kept[i].start < start - ONSET_TOL) break;
    }
    if (!cluster) {
      kept.push(Object.assign({}, note));
      return;
    }
    if ((Number(note.midi) || 0) > (Number(cluster.midi) || 0)) {
      cluster.midi = note.midi;
      cluster.end = Math.max(cluster.end, note.end);
      if (note.velocity != null) cluster.velocity = Math.max(cluster.velocity || 0, note.velocity);
    }
  });
  return kept;
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

export function applySustainTrim(notes, tempoBpm) {
  if (!notes || !notes.length) return notes;
  const beatDuration = 60 / Math.max(tempoBpm || 120, 1);
  const maxSustain = beatDuration * 8;
  const ordered = notes.slice().sort(function(a, b) {
    return a.start - b.start || a.midi - b.midi;
  });
  const nextStartByPitch = {};
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    const note = ordered[i];
    const pitch = note.midi;
    const nextSame = nextStartByPitch[pitch];
    let end = note.end;
    if (nextSame != null && nextSame > note.start + 0.02) {
      end = Math.min(end, nextSame);
    }
    if (end - note.start > maxSustain) {
      end = note.start + maxSustain;
    }
    nextStartByPitch[pitch] = note.start;
    ordered[i] = Object.assign({}, note, { end: Math.max(note.start + 0.03, end) });
  }
  return ordered;
}

export function cleanupIsActive(options) {
  const opts = normalizeCleanupOptions(options);
  return opts.velocityGate > 0
    || opts.velocityMax < 127
    || opts.minDurationMs > 0
    || opts.maxDurationMs > 0
    || opts.retriggerMergeMs > 0
    || opts.swingAmount > 0
    || opts.sustainTrim
    || !opts.keepPolyphonicChords
    || opts.pitchMin > 0
    || opts.pitchMax < 127;
}

export function applyMidiCleanup(notes, options, tempoBpm) {
  const originalCount = (notes || []).length;
  const opts = normalizeCleanupOptions(options);
  let cleaned = (notes || []).map(function(note) { return Object.assign({}, note); });

  cleaned = applyVelocityGate(cleaned, opts.velocityGate);
  cleaned = applyVelocityMax(cleaned, opts.velocityMax);
  cleaned = applyPitchRange(cleaned, opts.pitchMin, opts.pitchMax);
  cleaned = applyMinDuration(cleaned, opts.minDurationMs);
  cleaned = applyMaxDuration(cleaned, opts.maxDurationMs, opts.minDurationMs);
  cleaned = applyRetriggerMerge(cleaned, opts.retriggerMergeMs);
  if (!opts.keepPolyphonicChords) {
    cleaned = applyCollapseChords(cleaned);
  }
  cleaned = applySwing(cleaned, opts.swingAmount, tempoBpm || 120);
  if (opts.sustainTrim) {
    cleaned = applySustainTrim(cleaned, tempoBpm || 120);
  }

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
