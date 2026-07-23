import {
  createEventId,
  cloneVoiceEvent,
  pitchToMidi,
  eventMidiPitch,
} from './voiceEventModel';
import {
  beatsToDuration,
  durationToBeats,
  measureCapacityBeats,
} from './beatGrid';
import { DURATION_KEY_MULTIPLIERS } from './notationConstants';
import { midiToAbcPitch, enharmonicAbcName } from '../melodyPitchSpelling';
import { reassignEventTiming } from './abcVoiceSerializer';
import { defaultNoteExtensions, attachTupletToNewEvent, advanceTupletMode } from './notationMarks';

export function durationFromSession(session) {
  const mult = DURATION_KEY_MULTIPLIERS[session.durationKey] || 2;
  const unit = session.unitLengthDecimal;
  const beats = mult * unit * 4 * (session.dotted ? 1.5 : 1);
  return beatsToDuration(beats, unit);
}

export function pitchFromMidi(midi, tuneMeta) {
  const abc = midiToAbcPitch(midi, { key: tuneMeta.key });
  let accidental = 0;
  let body = abc;
  if (body.startsWith('^^')) { accidental = 2; body = body.slice(2); }
  else if (body.startsWith('__')) { accidental = -2; body = body.slice(2); }
  else if (body.startsWith('^')) { accidental = 1; body = body.slice(1); }
  else if (body.startsWith('_')) { accidental = -1; body = body.slice(1); }
  else if (body.startsWith('=')) { accidental = 0; body = body.slice(1); }
  // ABC: C = C4, c = C5, C, = C3, c' = C6 (must match voiceEventModel)
  const lower = body.toLowerCase();
  const commas = (body.match(/,/g) || []).length;
  const apostrophes = (body.match(/'/g) || []).length;
  const octave = body === lower
    ? 5 + apostrophes - commas
    : 4 - commas + apostrophes;
  return {
    step: lower.replace(/[,']/g, '').charAt(0).toUpperCase(),
    octave: octave,
    accidental: accidental,
    abcName: abc,
  };
}

const DIATONIC_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

function diatonicLetterIndex(step) {
  return DIATONIC_LETTERS.indexOf(String(step || 'C').charAt(0).toUpperCase());
}

export function pitchFromLetter(letter, session) {
  const key = session.tuneMeta.key || 'C';
  const targetIdx = diatonicLetterIndex(letter);
  if (targetIdx < 0) return pitchFromMidi(60, session.tuneMeta);
  let midi = 60;
  let curIdx = 0;
  while (curIdx !== targetIdx) {
    midi = nextDiatonicMidi(midi, 1, session.tuneMeta);
    curIdx = (curIdx + 1) % 7;
  }
  const pitch = pitchFromMidi(midi, session.tuneMeta);
  if (session.accidentalCarry != null) {
    pitch.accidental = session.accidentalCarry;
    pitch.abcName = midiToAbcPitch(midi + session.accidentalCarry, { key: key });
  }
  return pitch;
}

function patchSession(session, patch) {
  return Object.assign({}, session, patch, {
    events: reassignEventTiming(patch.events || session.events, session.tuneMeta),
  });
}

function newNoteEvent(type, fields) {
  return Object.assign({
    id: createEventId(type),
    type: type,
    duration: durationFromSession(fields.session),
    tieStart: false,
    tieEnd: false,
  }, defaultNoteExtensions(), fields.extra || {});
}

export function insertRestAtCaret(session) {
  const events = session.events.map(cloneVoiceEvent);
  const idx = Math.min(session.caretIndex, events.length);
  const ev = attachTupletToNewEvent(newNoteEvent('rest', { session: session, extra: {
    pitches: null,
    pitch: null,
    sourceToken: 'z',
  } }), session.tupletMode);
  events.splice(idx, 0, ev);
  return patchSession(session, {
    events: events,
    caretIndex: idx + 1,
    lastEvent: ev,
    tupletMode: advanceTupletMode(session.tupletMode),
  });
}

/** Insert layout tokens before the leftmost selected note, or at the caret. */
export function layoutInsertIndex(session, lastSelection, pinnedEventId) {
  if (!session || !Array.isArray(session.events)) return 0;
  const events = session.events;

  if (pinnedEventId) {
    const pinnedIdx = events.findIndex(function(ev) { return ev.id === pinnedEventId; });
    if (pinnedIdx >= 0) return pinnedIdx;
  }

  const hasExplicitSelection = !!(
    (session.selection && session.selection.eventIds && session.selection.eventIds.length)
    || (lastSelection && lastSelection.eventIds && lastSelection.eventIds.length)
  );
  if (hasExplicitSelection) {
    const resolved = resolveEditTargetIds(session, lastSelection);
    if (resolved && resolved.eventIds.length) {
      let minIdx = events.length;
      resolved.eventIds.forEach(function(id) {
        const i = events.findIndex(function(ev) { return ev.id === id; });
        if (i >= 0 && i < minIdx) minIdx = i;
      });
      if (minIdx < events.length) return minIdx;
    }
  }

  const caret = typeof session.caretIndex === 'number' ? session.caretIndex : 0;
  return Math.min(Math.max(0, caret), events.length);
}

export function insertBarlineAtCaret(session, barToken) {
  const events = session.events.map(cloneVoiceEvent);
  const idx = layoutInsertIndex(session);
  const ev = {
    id: createEventId('bar'),
    type: 'barline',
    barToken: barToken || '|',
    duration: { num: 0, den: 1, dotted: false },
    tieStart: false,
    tieEnd: false,
  };
  events.splice(idx, 0, ev);
  return patchSession(session, { events: events, caretIndex: idx + 1, lastEvent: null });
}

export function insertSystemBreakAtCaret(session) {
  const events = session.events.map(cloneVoiceEvent);
  const idx = layoutInsertIndex(session);
  const ev = {
    id: createEventId('break'),
    type: 'lineBreak',
    duration: { num: 0, den: 1, dotted: false },
    tieStart: false,
    tieEnd: false,
  };
  events.splice(idx, 0, ev);
  return patchSession(session, { events: events, caretIndex: idx + 1, lastEvent: null });
}

export function insertPitchAtCaret(session, pitch, options) {
  const opts = options || {};
  const events = session.events.map(cloneVoiceEvent);
  const idx = Math.min(session.caretIndex, events.length);
  if (!opts.forceNew && session.chordBuild && idx > 0) {
    const prev = events[idx - 1];
    if (prev && (prev.type === 'note' || prev.type === 'chord')) {
      return addToneToEvent(session, idx - 1, pitch);
    }
  }
  const ev = attachTupletToNewEvent(newNoteEvent('note', { session: session, extra: {
    pitch: pitch,
    pitches: [pitch],
  } }), session.tupletMode);
  events.splice(idx, 0, ev);
  return patchSession(session, {
    events: events,
    caretIndex: idx + 1,
    lastEvent: ev,
    accidentalCarry: null,
    tupletMode: advanceTupletMode(session.tupletMode),
  });
}

export function insertMidiAtCaret(session, midi) {
  return insertPitchAtCaret(session, pitchFromMidi(midi, session.tuneMeta));
}

export function insertMidiChordAtCaret(session, midis) {
  const pitches = midis.map(function(m) { return pitchFromMidi(m, session.tuneMeta); });
  pitches.sort(function(a, b) { return pitchToMidi(a) - pitchToMidi(b); });
  const events = session.events.map(cloneVoiceEvent);
  const idx = Math.min(session.caretIndex, events.length);
  const ev = attachTupletToNewEvent(newNoteEvent(pitches.length > 1 ? 'chord' : 'note', { session: session, extra: {
    pitch: pitches.length === 1 ? pitches[0] : null,
    pitches: pitches,
  } }), session.tupletMode);
  events.splice(idx, 0, ev);
  return patchSession(session, {
    events: events,
    caretIndex: idx + 1,
    lastEvent: ev,
    tupletMode: advanceTupletMode(session.tupletMode),
  });
}

export function addToneToEvent(session, eventIndex, pitch) {
  const events = session.events.map(cloneVoiceEvent);
  const ev = events[eventIndex];
  if (!ev || (ev.type !== 'note' && ev.type !== 'chord')) return null;
  const pitches = (ev.pitches || (ev.pitch ? [ev.pitch] : [])).slice();
  pitches.push(pitch);
  pitches.sort(function(a, b) { return pitchToMidi(a) - pitchToMidi(b); });
  if (pitches.length > 1) {
    ev.type = 'chord';
    ev.pitches = pitches;
    ev.pitch = null;
  } else {
    ev.type = 'note';
    ev.pitch = pitches[0];
    ev.pitches = pitches;
  }
  return patchSession(session, { events: events, lastEvent: ev });
}

function convertEventToRest(ev) {
  return Object.assign({}, ev, {
    type: 'rest',
    pitch: null,
    pitches: null,
  });
}

/** @param {{ backward?: boolean }} [options] backward=true (Backspace): event before caret; false (Delete): event at caret */
export function deleteSelectionToRest(session, options) {
  const backward = !options || options.backward !== false;
  const ids = session.selection.eventIds || [];
  const events = session.events.map(cloneVoiceEvent);

  if (ids.length > 0) {
    let changed = false;
    const next = [];
    events.forEach(function(ev) {
      if (ids.indexOf(ev.id) < 0) {
        next.push(ev);
        return;
      }
      changed = true;
      // Bar lines and system breaks are layout — remove rather than turn into rests.
      if (ev.type === 'barline' || ev.type === 'lineBreak') return;
      next.push(convertEventToRest(ev));
    });
    if (!changed) return null;
    return patchSession(session, {
      events: next,
      caretIndex: Math.min(session.caretIndex, next.length),
      selection: { eventIds: [], toneIndex: null, anchorId: null },
    });
  }

  let idx = null;
  if (backward) {
    if (session.caretIndex > 0) idx = session.caretIndex - 1;
  } else if (session.caretIndex < session.events.length) {
    idx = session.caretIndex;
  }
  if (idx == null) return null;
  const target = events[idx];
  if (!target) return null;
  if (target.type === 'barline' || target.type === 'lineBreak') {
    events.splice(idx, 1);
    return patchSession(session, {
      events: events,
      caretIndex: Math.min(session.caretIndex, events.length),
    });
  }
  if (target.type !== 'note' && target.type !== 'chord') return null;
  events[idx] = convertEventToRest(target);
  return patchSession(session, { events: events });
}

export function removeSelection(session) {
  const ids = session.selection.eventIds || [];
  if (ids.length === 0) return null;
  const events = session.events.filter(function(ev) { return ids.indexOf(ev.id) < 0; });
  return patchSession(session, {
    events: events,
    caretIndex: Math.min(session.caretIndex, events.length),
    selection: { eventIds: [], toneIndex: null, anchorId: null },
  });
}

/** One staff-ladder step (abcjs drag.step unit) along the diatonic scale in the tune key. */
export function nextDiatonicMidi(midi, direction, tuneMeta) {
  if (midi == null || !direction) return midi;
  const pitch = pitchFromMidi(midi, tuneMeta);
  if (!pitch) return midi + direction * 2;
  let letterIdx = diatonicLetterIndex(pitch.step);
  letterIdx += direction;
  while (letterIdx < 0) letterIdx += 7;
  while (letterIdx > 6) letterIdx -= 7;
  const targetLetter = DIATONIC_LETTERS[letterIdx];
  for (let delta = 1; delta <= 12; delta += 1) {
    const candidate = midi + direction * delta;
    const spelled = pitchFromMidi(candidate, tuneMeta);
    if (spelled && spelled.step === targetLetter) return candidate;
  }
  return midi + direction * 2;
}

/**
 * Transpose selection by abcjs staff drag steps (vertical staff spaces).
 * Positive staffSteps = drag down on the staff = lower pitch.
 */
export function transposeSelectionByStaffSteps(session, staffSteps, toneIndex) {
  if (!staffSteps) return null;
  const ids = session.selection.eventIds.length
    ? session.selection.eventIds
    : (session.caretIndex > 0 ? [session.events[session.caretIndex - 1].id] : []);
  const direction = staffSteps > 0 ? -1 : 1;
  const count = Math.abs(staffSteps);
  const events = session.events.map(cloneVoiceEvent);
  events.forEach(function(ev) {
    if (ids.indexOf(ev.id) < 0) return;
    if (ev.type === 'rest' || ev.type === 'barline' || ev.type === 'lineBreak') return;
    if (ev.type === 'chord' && typeof toneIndex === 'number') {
      let midi = eventMidiPitch(ev, toneIndex);
      if (midi == null) return;
      for (let i = 0; i < count; i += 1) {
        midi = nextDiatonicMidi(midi, direction, session.tuneMeta);
      }
      ev.pitches[toneIndex] = pitchFromMidi(midi, session.tuneMeta);
      return;
    }
    let midi = eventMidiPitch(ev);
    if (midi == null) return;
    for (let i = 0; i < count; i += 1) {
      midi = nextDiatonicMidi(midi, direction, session.tuneMeta);
    }
    const newPitch = pitchFromMidi(midi, session.tuneMeta);
    if (ev.type === 'chord') {
      ev.pitches = ev.pitches.map(function() { return newPitch; });
    } else {
      ev.pitch = newPitch;
      ev.pitches = [newPitch];
    }
  });
  return patchSession(session, { events: events });
}

export function transposeSelection(session, semitones, toneIndex) {
  const ids = session.selection.eventIds.length
    ? session.selection.eventIds
    : (session.caretIndex > 0 ? [session.events[session.caretIndex - 1].id] : []);
  const events = session.events.map(cloneVoiceEvent);
  events.forEach(function(ev) {
    if (ids.indexOf(ev.id) < 0) return;
    if (ev.type === 'rest' || ev.type === 'barline' || ev.type === 'lineBreak') return;
    if (ev.type === 'chord' && typeof toneIndex === 'number') {
      const midi = eventMidiPitch(ev, toneIndex);
      if (midi != null) ev.pitches[toneIndex] = pitchFromMidi(midi + semitones, session.tuneMeta);
      return;
    }
    const midi = eventMidiPitch(ev);
    if (midi == null) return;
    const newPitch = pitchFromMidi(midi + semitones, session.tuneMeta);
    if (ev.type === 'chord') {
      ev.pitches = ev.pitches.map(function() { return newPitch; });
    } else {
      ev.pitch = newPitch;
      ev.pitches = [newPitch];
    }
  });
  return patchSession(session, { events: events });
}

/** Apply accidental to selected note/chord pitches. value: -2..2 (0 = natural). */
export function applyAccidentalToSelection(session, value) {
  let ids = session.selection.eventIds || [];
  if (!ids.length && session.caretIndex > 0) {
    const prev = session.events[session.caretIndex - 1];
    if (prev && (prev.type === 'note' || prev.type === 'chord')) ids = [prev.id];
  }
  if (!ids.length) return null;
  const acc = typeof value === 'number' ? value : 0;
  const events = session.events.map(cloneVoiceEvent);
  let changed = false;
  events.forEach(function(ev) {
    if (ids.indexOf(ev.id) < 0) return;
    if (ev.type !== 'note' && ev.type !== 'chord') return;
    const toneIndex = session.selection.toneIndex;
    function patchPitch(p) {
      const step = p.step || 'C';
      const octave = typeof p.octave === 'number' ? p.octave : 4;
      let name = step;
      if (octave >= 5) name = String(step).toLowerCase() + "'".repeat(octave - 5);
      else if (octave < 4) name = step + ','.repeat(4 - octave);
      let prefix = '';
      if (acc === 2) prefix = '^^';
      else if (acc === -2) prefix = '__';
      else if (acc === 1) prefix = '^';
      else if (acc === -1) prefix = '_';
      else prefix = '=';
      return Object.assign({}, p, {
        step: String(step).charAt(0).toUpperCase(),
        octave: octave,
        accidental: acc,
        forceNatural: acc === 0,
        abcName: prefix + name,
      });
    }
    if (ev.type === 'chord' && typeof toneIndex === 'number' && ev.pitches && ev.pitches[toneIndex]) {
      ev.pitches = ev.pitches.slice();
      ev.pitches[toneIndex] = patchPitch(ev.pitches[toneIndex]);
      changed = true;
      return;
    }
    if (ev.type === 'chord' && Array.isArray(ev.pitches)) {
      ev.pitches = ev.pitches.map(patchPitch);
      ev.pitch = null;
      changed = true;
      return;
    }
    if (ev.pitch) {
      ev.pitch = patchPitch(ev.pitch);
      ev.pitches = [ev.pitch];
      changed = true;
    }
  });
  if (!changed) return null;
  return patchSession(session, {
    events: events,
    accidentalCarry: null,
    selection: {
      eventIds: ids.slice(),
      toneIndex: session.selection.toneIndex,
      anchorId: session.selection.anchorId || ids[0],
    },
  });
}

/** Replace pitch of selected notes (select mode). */
export function replaceSelectionPitch(session, pitch) {
  const ids = session.selection.eventIds || [];
  if (!ids.length || !pitch) return null;
  const events = session.events.map(cloneVoiceEvent);
  let changed = false;
  events.forEach(function(ev) {
    if (ids.indexOf(ev.id) < 0) return;
    if (ev.type !== 'note' && ev.type !== 'chord') return;
    if (ev.type === 'chord') {
      ev.pitches = (ev.pitches || []).map(function() { return pitch; });
      ev.pitch = null;
      ev.type = ev.pitches.length > 1 ? 'chord' : 'note';
      if (ev.type === 'note') {
        ev.pitch = pitch;
        ev.pitches = [pitch];
      }
    } else {
      ev.pitch = pitch;
      ev.pitches = [pitch];
    }
    changed = true;
  });
  if (!changed) return null;
  return patchSession(session, { events: events, accidentalCarry: null, lastEvent: events.find(function(ev) {
    return ids.indexOf(ev.id) >= 0;
  }) || session.lastEvent });
}

/**
 * MuseScore re-pitch: change pitch of the note at/before caret and advance to the next note.
 */
export function rePitchAtCaret(session, pitch) {
  if (!pitch) return null;
  const events = session.events.map(cloneVoiceEvent);
  let idx = -1;
  const ids = session.selection.eventIds || [];
  if (ids.length) {
    idx = events.findIndex(function(ev) { return ev.id === ids[0]; });
  }
  if (idx < 0) {
    idx = Math.min(session.caretIndex, events.length) - 1;
    while (idx >= 0 && events[idx] && events[idx].type !== 'note' && events[idx].type !== 'chord') {
      idx -= 1;
    }
  }
  if (idx < 0 || !events[idx]) return null;
  const ev = events[idx];
  if (ev.type !== 'note' && ev.type !== 'chord') return null;
  if (ev.type === 'chord' && typeof session.selection.toneIndex === 'number' && ev.pitches) {
    const tones = ev.pitches.slice();
    if (tones[session.selection.toneIndex]) {
      tones[session.selection.toneIndex] = pitch;
      ev.pitches = tones;
    } else {
      ev.pitch = pitch;
      ev.pitches = [pitch];
      ev.type = 'note';
    }
  } else {
    ev.pitch = pitch;
    ev.pitches = [pitch];
    ev.type = 'note';
  }
  let nextIdx = idx + 1;
  while (nextIdx < events.length && events[nextIdx].type !== 'note' && events[nextIdx].type !== 'chord') {
    nextIdx += 1;
  }
  const nextEv = nextIdx < events.length ? events[nextIdx] : null;
  return patchSession(session, {
    events: events,
    caretIndex: nextEv ? nextIdx + 1 : events.length,
    lastEvent: ev,
    pitchCarry: pitch,
    accidentalCarry: null,
    selection: nextEv
      ? { eventIds: [nextEv.id], toneIndex: null, anchorId: nextEv.id }
      : { eventIds: [], toneIndex: null, anchorId: null },
  });
}

/**
 * Staff steps from pointer delta. Positive deltaY (drag down) → positive steps (lower pitch).
 * Clamped so abcjs coordinate glitches cannot jump many octaves.
 */
export function staffStepsFromPointerDelta(deltaY, stepPx, clampAbs) {
  const step = stepPx > 0 ? stepPx : 14;
  const lim = typeof clampAbs === 'number' && clampAbs > 0 ? clampAbs : 16;
  const raw = Math.round(Number(deltaY) / step);
  if (!isFinite(raw)) return 0;
  return Math.max(-lim, Math.min(lim, raw));
}

/**
 * Resolve committed staff steps for a pitch drag.
 * Pointer delta is authoritative; abcjs drag.step is ignored for pitch commit
 * (abcjs can inflate when the pointer leaves the glyph).
 */
export function resolveDragStaffSteps(options) {
  const opts = options || {};
  const stepPx = opts.stepPx > 0 ? opts.stepPx : 14;
  const clampAbs = typeof opts.clampAbs === 'number' && opts.clampAbs > 0 ? opts.clampAbs : 4;
  const pointerDeltaY = typeof opts.pointerDeltaY === 'number' ? opts.pointerDeltaY : 0;
  const movedPx = Math.abs(pointerDeltaY);
  if (movedPx < stepPx * 0.35) return 0;
  // Intentionally ignore opts.abcStep — hybrid preference was a false-green failure mode.
  return staffStepsFromPointerDelta(pointerDeltaY, stepPx, clampAbs);
}

/**
 * Keep edit-target IDs that still exist after LOAD_VOICE / remount.
 * Falls back to note at caret, then note before caret.
 */
export function resolveEditTargetIds(session, lastSelection) {
  if (!session || !Array.isArray(session.events)) return null;
  const idSet = {};
  session.events.forEach(function(ev) {
    if (ev && ev.id) idSet[ev.id] = true;
  });
  function liveIds(ids) {
    return (ids || []).filter(function(id) { return idSet[id]; });
  }
  let toneIndex = session.selection && session.selection.toneIndex;
  let anchorId = session.selection && session.selection.anchorId;
  let ids = liveIds(session.selection && session.selection.eventIds);
  if (!ids.length && lastSelection) {
    ids = liveIds(lastSelection.eventIds);
    if (ids.length) {
      toneIndex = lastSelection.toneIndex;
      anchorId = lastSelection.anchorId;
    }
  }
  if (!ids.length) {
    const caret = typeof session.caretIndex === 'number' ? session.caretIndex : 0;
    const atCaret = session.events[caret];
    if (atCaret && (atCaret.type === 'note' || atCaret.type === 'chord')) {
      ids = [atCaret.id];
    } else if (caret > 0) {
      const prev = session.events[caret - 1];
      if (prev && (prev.type === 'note' || prev.type === 'chord')) ids = [prev.id];
    }
  }
  if (!ids.length) return null;
  return {
    eventIds: ids,
    toneIndex: toneIndex != null ? toneIndex : null,
    anchorId: (anchorId && idSet[anchorId]) ? anchorId : ids[0],
  };
}

export function changeSelectedDuration(session, durationKey, dotted) {
  const ids = session.selection.eventIds || [];
  const events = session.events.map(cloneVoiceEvent);
  const mult = DURATION_KEY_MULTIPLIERS[durationKey] || 2;
  const unit = session.unitLengthDecimal;
  const beats = mult * unit * 4 * (dotted ? 1.5 : 1);
  const duration = beatsToDuration(beats, unit);
  events.forEach(function(ev, i) {
    if (ids.length && ids.indexOf(ev.id) < 0) return;
    if (!ids.length && i !== Math.max(0, session.caretIndex - 1)) return;
    if (ev.type === 'barline' || ev.type === 'lineBreak') return;
    ev.duration = duration;
  });
  return patchSession(session, { events: events, durationKey: durationKey, dotted: !!dotted });
}

export function toggleDotOnSelection(session) {
  const resolved = resolveEditTargetIds(session);
  if (!resolved || !resolved.eventIds.length) return null;
  const ids = resolved.eventIds;
  const events = session.events.map(cloneVoiceEvent);
  let changed = false;
  events.forEach(function(ev) {
    if (ids.indexOf(ev.id) < 0) return;
    if (ev.type === 'barline' || ev.type === 'lineBreak' || ev.type === 'rest') return;
    if (!ev.duration) return;
    ev.duration = Object.assign({}, ev.duration, { dotted: !ev.duration.dotted });
    changed = true;
  });
  if (!changed) return null;
  return patchSession(session, {
    events: events,
    selection: resolved,
  });
}

export function scaleDuration(session, factor, dotAware) {
  const ids = session.selection.eventIds || [];
  const targetIndex = ids.length ? null : Math.max(0, session.caretIndex - 1);
  const events = session.events.map(cloneVoiceEvent);
  events.forEach(function(ev, i) {
    if (ev.type === 'barline' || ev.type === 'lineBreak') return;
    if (ids.length && ids.indexOf(ev.id) < 0) return;
    if (targetIndex != null && i !== targetIndex) return;
    let beats = durationToBeats(ev.duration, session.unitLengthDecimal);
    if (dotAware && ev.duration.dotted && factor < 1) {
      ev.duration = Object.assign({}, ev.duration, { dotted: false });
    } else if (dotAware && !ev.duration.dotted && factor > 1) {
      ev.duration = Object.assign({}, ev.duration, { dotted: true });
    } else {
      beats *= factor;
      ev.duration = beatsToDuration(beats, session.unitLengthDecimal);
    }
  });
  return patchSession(session, { events: events });
}

export function moveCaret(session, delta) {
  const idx = Math.max(0, Math.min(session.caretIndex + delta, session.events.length));
  return Object.assign({}, session, { caretIndex: idx });
}

export function repeatLast(session) {
  if (!session.lastEvent) return null;
  const clone = cloneVoiceEvent(session.lastEvent);
  clone.id = createEventId(clone.type);
  const events = session.events.map(cloneVoiceEvent);
  const idx = session.caretIndex;
  events.splice(idx, 0, clone);
  return patchSession(session, { events: events, caretIndex: idx + 1, lastEvent: clone });
}

export function selectEventRange(events, anchorId, targetId) {
  const a = events.findIndex(function(ev) { return ev.id === anchorId; });
  const b = events.findIndex(function(ev) { return ev.id === targetId; });
  if (a < 0 || b < 0) return targetId ? [targetId] : [];
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  const ids = [];
  for (let i = start; i <= end; i += 1) ids.push(events[i].id);
  return ids;
}

/** Toggle eventId in a selection (Ctrl/Cmd+click). */
export function toggleSelectionEventId(selection, eventId) {
  if (!eventId) return selection || { eventIds: [], toneIndex: null, anchorId: null };
  const prev = selection || { eventIds: [], toneIndex: null, anchorId: null };
  const ids = (prev.eventIds || []).slice();
  const found = ids.indexOf(eventId);
  if (found >= 0) ids.splice(found, 1);
  else ids.push(eventId);
  let anchorId = prev.anchorId || null;
  if (!ids.length) {
    anchorId = null;
  } else if (!anchorId || ids.indexOf(anchorId) < 0) {
    // If we removed the anchor, keep a remaining id; if we added, use the new id.
    anchorId = found >= 0 ? ids[ids.length - 1] : eventId;
  }
  return { eventIds: ids, toneIndex: null, anchorId: anchorId };
}

/**
 * Select the measure containing eventId: notes/rests from after the previous
 * barline through the trailing barline of that measure (exclusive of next measure).
 */
export function selectMeasureContaining(events, eventId) {
  if (!events || !events.length || !eventId) return [];
  const idx = events.findIndex(function(ev) { return ev.id === eventId; });
  if (idx < 0) return [];

  let start = 0;
  for (let i = idx - 1; i >= 0; i -= 1) {
    if (events[i].type === 'barline') {
      start = i + 1;
      break;
    }
  }

  if (events[idx].type === 'barline') {
    // Barline click/double-click: measure that *ends* at this bar.
    start = 0;
    for (let i = idx - 1; i >= 0; i -= 1) {
      if (events[i].type === 'barline') {
        start = i + 1;
        break;
      }
    }
    const ids = [];
    for (let j = start; j <= idx; j += 1) ids.push(events[j].id);
    return ids;
  }

  let end = events.length - 1;
  for (let i = idx; i < events.length; i += 1) {
    if (events[i].type === 'barline') {
      end = i;
      break;
    }
  }
  const ids = [];
  for (let j = start; j <= end; j += 1) ids.push(events[j].id);
  return ids;
}

/**
 * Insert one empty measure (rests totaling meter capacity + barline) at caret.
 */
export function insertEmptyMeasureAtCaret(session) {
  const events = session.events.map(cloneVoiceEvent);
  const idx = Math.min(session.caretIndex, events.length);
  const unit = session.unitLengthDecimal;
  const cap = measureCapacityBeats(session.tuneMeta.meter || '4/4');
  const dur = beatsToDuration(cap, unit);
  const unitBeats = unit * 4;
  const units = cap / unitBeats;
  const duration = Math.abs(units - Math.round(units)) < 0.001
    ? { num: Math.round(units), den: 1, dotted: false }
    : dur;
  const rest = Object.assign({
    id: createEventId('rest'),
    type: 'rest',
    duration: duration,
    tieStart: false,
    tieEnd: false,
    pitches: null,
    pitch: null,
    sourceToken: 'z',
  }, defaultNoteExtensions());
  const bar = {
    id: createEventId('bar'),
    type: 'barline',
    barToken: '|',
    duration: { num: 0, den: 1, dotted: false },
    tieStart: false,
    tieEnd: false,
  };
  events.splice(idx, 0, rest, bar);
  return patchSession(session, { events: events, caretIndex: idx + 2, lastEvent: null });
}

function pitchPreferFlats(pitch) {
  if (!pitch) return null;
  if (pitch.accidental < 0) return true;
  if (pitch.accidental > 0) return false;
  const name = String(pitch.abcName || '');
  if (name.indexOf('_') >= 0) return true;
  if (name.indexOf('^') >= 0) return false;
  return null;
}

function pitchFromAbcToken(abc) {
  let accidental = 0;
  let body = String(abc || '');
  if (body.startsWith('^^')) { accidental = 2; body = body.slice(2); }
  else if (body.startsWith('__')) { accidental = -2; body = body.slice(2); }
  else if (body.startsWith('^')) { accidental = 1; body = body.slice(1); }
  else if (body.startsWith('_')) { accidental = -1; body = body.slice(1); }
  else if (body.startsWith('=')) { accidental = 0; body = body.slice(1); }
  const lower = body.toLowerCase();
  const commas = (body.match(/,/g) || []).length;
  const apostrophes = (body.match(/'/g) || []).length;
  const octave = body === lower
    ? 5 + apostrophes - commas
    : 4 - commas + apostrophes;
  return {
    step: lower.replace(/[,']/g, '').charAt(0).toUpperCase(),
    octave: octave,
    accidental: accidental,
    abcName: abc,
  };
}

function respellPitchEnharmonic(pitch) {
  if (!pitch) return pitch;
  const midi = pitchToMidi(pitch);
  if (midi == null) return pitch;
  const prefer = pitchPreferFlats(pitch);
  if (prefer == null) {
    // Natural white-key spelling with no alternate table entry.
    const sharpAlt = enharmonicAbcName(midi, false);
    const flatAlt = enharmonicAbcName(midi, true);
    if (!sharpAlt && !flatAlt) return pitch;
    // Rare cases (B# vs C): prefer flipping toward flats first.
    const nextName = flatAlt && flatAlt !== midiToAbcPitch(midi, { preferFlats: false })
      ? flatAlt
      : sharpAlt;
    if (!nextName) return pitch;
    return pitchFromAbcToken(nextName);
  }
  const nextName = enharmonicAbcName(midi, !prefer);
  if (!nextName) return pitch;
  return pitchFromAbcToken(nextName);
}

export function respellEnharmonicSelection(session) {
  const resolved = resolveEditTargetIds(session);
  if (!resolved || !resolved.eventIds || !resolved.eventIds.length) return null;
  const ids = resolved.eventIds;
  const events = session.events.map(cloneVoiceEvent);
  const idSet = {};
  ids.forEach(function(id) { idSet[id] = true; });
  events.forEach(function(ev) {
    if (!idSet[ev.id]) return;
    if (ev.type !== 'note' && ev.type !== 'chord') return;
    if (ev.pitches && ev.pitches.length) {
      ev.pitches = ev.pitches.map(respellPitchEnharmonic);
      ev.pitch = ev.pitches[0];
    } else if (ev.pitch) {
      ev.pitch = respellPitchEnharmonic(ev.pitch);
      ev.pitches = [ev.pitch];
    }
  });
  return patchSession(session, { events: events });
}
