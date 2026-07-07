import {
  createEventId,
  cloneVoiceEvent,
  pitchToMidi,
  eventMidiPitch,
} from './voiceEventModel';
import {
  beatsToDuration,
  durationToBeats,
} from './beatGrid';
import { DURATION_KEY_MULTIPLIERS } from './notationConstants';
import { midiToAbcPitch } from '../melodyPitchSpelling';
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
  const lower = body.toLowerCase();
  const commas = (body.match(/,/g) || []).length;
  const apostrophes = (body.match(/'/g) || []).length;
  let octave = 4;
  if (body === lower) octave = 4 - commas;
  else octave = 5 + apostrophes;
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

export function insertBarlineAtCaret(session, barToken) {
  const events = session.events.map(cloneVoiceEvent);
  const idx = Math.min(session.caretIndex, events.length);
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
  const idx = Math.min(session.caretIndex, events.length);
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
    events.forEach(function(ev, i) {
      if (ids.indexOf(ev.id) >= 0) {
        events[i] = convertEventToRest(ev);
        changed = true;
      }
    });
    if (!changed) return null;
    return patchSession(session, {
      events: events,
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
  if (!target || (target.type !== 'note' && target.type !== 'chord')) return null;
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
  if (a < 0 || b < 0) return [targetId];
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  const ids = [];
  for (let i = start; i <= end; i += 1) ids.push(events[i].id);
  return ids;
}
