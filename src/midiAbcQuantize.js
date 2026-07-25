/**
 * Shared ABC quantization helpers for MIDI cleanup/import previews.
 */

function durationSuffix(slots, slotsPerBeat) {
  if (slots <= 0) return '';
  if (slots === 1) return '';
  if (slots === slotsPerBeat) return String(slotsPerBeat);
  return String(slots);
}

function restToken(slots, slotsPerBeat) {
  if (slots <= 0) return '';
  if (slots === 1) return 'z';
  return 'z' + durationSuffix(slots, slotsPerBeat * 2);
}

function tokenWithDuration(token, slots, slotsPerBeat) {
  const dur = durationSuffix(slots, slotsPerBeat * 2);
  if (token.length >= 2 && token.charAt(0) === '!' && token.charAt(token.length - 1) === '!') {
    const inner = token.slice(1, -1).replace(/\d+$/, '');
    return '!' + inner + dur + '!';
  }
  const pitch = token.replace(/\d+$/, '');
  return pitch + dur;
}

export function trimNotesForQuantization(notes, marginSec) {
  const margin = marginSec == null ? 1.0 : marginSec;
  if (!notes || !notes.length) return { notes: [], durationSec: 0 };
  const starts = notes.map(function(note) { return Number(note.start) || 0; });
  const ends = notes.map(function(note) { return Number(note.end) || 0; });
  let lo = Math.min.apply(null, starts);
  let hi = Math.max.apply(null, ends);
  const endsSorted = ends.slice().sort(function(a, b) { return a - b; });
  const p99Index = Math.min(endsSorted.length - 1, Math.floor(endsSorted.length * 0.99));
  const p99 = endsSorted[p99Index];
  if (p99 + 2 < hi) {
    hi = p99 + margin;
  } else {
    hi += margin;
  }
  const trimmed = [];
  notes.forEach(function(note) {
    const start = Math.max(Number(note.start) || 0, lo);
    const end = Math.min(Number(note.end) || start, hi);
    if (end <= start + 0.001) return;
    trimmed.push(Object.assign({}, note, {
      start: start - lo,
      end: end - lo,
    }));
  });
  const durationSec = trimmed.length ? Math.max(hi - lo, margin) : 0;
  return { notes: trimmed, durationSec: durationSec };
}

function formatWithinBar(barEvents, barStart, barSlots, slotsPerBeat) {
  const sorted = barEvents.slice().sort(function(a, b) {
    return a.slot - b.slot || a.durSlots - b.durSlots;
  });
  const parts = [];
  let cursor = barStart;
  sorted.forEach(function(event) {
    const slot = event.slot;
    const durSlots = Math.max(1, event.durSlots || 1);
    if (slot > cursor) {
      const gap = slot - cursor;
      parts.push(restToken(gap, slotsPerBeat));
      cursor = slot;
    }
    parts.push(event.token);
    cursor = slot + durSlots;
  });
  const barEnd = barStart + barSlots;
  if (cursor < barEnd) {
    parts.push(restToken(barEnd - cursor, slotsPerBeat));
  }
  return parts.join(' ').trim();
}

/** One measure per line — abcjs wrap/multi-voice parsing is more reliable this way. */
export function joinAbcMeasures(measureParts) {
  if (!measureParts || !measureParts.length) return '';
  return measureParts.map(function(part) {
    const trimmed = String(part || '').trim();
    return trimmed ? trimmed + ' |' : '|';
  }).join('\n');
}

export function splitEventsAtBarBoundaries(events, barSlots, slotsPerBeat) {
  const split = [];
  (events || []).forEach(function(event) {
    let slot = event.slot;
    let remaining = Math.max(1, event.durSlots || 1);
    while (remaining > 0) {
      const posInBar = slot % barSlots;
      const room = barSlots - posInBar;
      const chunk = Math.min(remaining, room);
      split.push({
        slot: slot,
        durSlots: chunk,
        token: tokenWithDuration(event.token, chunk, slotsPerBeat),
      });
      remaining -= chunk;
      slot += chunk;
    }
  });
  return split;
}

export function formatNoteEventsToAbcBody(events, options) {
  const opts = options || {};
  const beatsPerBar = opts.beatsPerBar || 4;
  const slotsPerBeat = Math.max(1, opts.slotsPerBeat || 2);
  const barSlots = beatsPerBar * slotsPerBeat;
  if (!events || !events.length) {
    if (opts.totalBars > 0) {
      const empty = Array(opts.totalBars).fill(restToken(barSlots, slotsPerBeat));
      return joinAbcMeasures(empty);
    }
    return '';
  }

  const splitEvents = splitEventsAtBarBoundaries(events, barSlots, slotsPerBeat);
  const maxEnd = splitEvents.reduce(function(max, event) {
    return Math.max(max, event.slot + Math.max(1, event.durSlots || 1));
  }, 0);
  const computedBars = Math.max(1, Math.ceil(maxEnd / barSlots));
  const numBars = opts.totalBars != null
    ? Math.max(opts.totalBars, computedBars)
    : computedBars;

  const byBar = {};
  splitEvents.forEach(function(event) {
    const bar = Math.floor(event.slot / barSlots);
    if (!byBar[bar]) byBar[bar] = [];
    byBar[bar].push(event);
  });

  const measureParts = [];
  for (let bar = 0; bar < numBars; bar += 1) {
    const barEvents = byBar[bar] || [];
    if (!barEvents.length) {
      measureParts.push(restToken(barSlots, slotsPerBeat));
    } else {
      measureParts.push(formatWithinBar(barEvents, bar * barSlots, barSlots, slotsPerBeat));
    }
  }

  return joinAbcMeasures(measureParts);
}

export function fillSlotGap(parts, cursor, targetSlot, barSlots, slotsPerBeat) {
  let pos = cursor;
  while (pos < targetSlot) {
    if (pos > 0 && pos % barSlots === 0) {
      parts.push('|');
    }
    const remaining = targetSlot - pos;
    const toBarEnd = barSlots - (pos % barSlots);
    const chunk = Math.min(remaining, toBarEnd);
    if (chunk <= 0) break;
    parts.push(restToken(chunk, slotsPerBeat));
    pos += chunk;
  }
  return pos;
}

export { durationSuffix };
