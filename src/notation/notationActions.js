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
  assignTimingToEvents,
} from './beatGrid';
import { DURATION_KEY_MULTIPLIERS } from './notationConstants';
import { midiToAbcPitch, enharmonicAbcName } from '../melodyPitchSpelling';
import { reassignEventTiming } from './abcVoiceSerializer';
import {
  eventAtBeat,
  insertTimedEventsAtBeat,
  totalTimedBeats,
} from './staffMeasureFill';
import {
  applyRestDurationChange,
  finalizeRestOps,
} from './staffRestEdit';
import { collapseAdjacentRests } from './timingEdit';
import { EDITOR_MODES } from './notationConstants';
import { defaultNoteExtensions, attachTupletToNewEvent, advanceTupletMode } from './notationMarks';
import { isLayoutEventType, zeroDurationFields } from './inlineSignatureTokens';

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
export function layoutInsertIndex(session, lastSelection) {
  if (!session || !Array.isArray(session.events)) return 0;
  const events = session.events;

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

/** Paste index: after the selection block, or at the caret when nothing is selected. */
export function pasteInsertIndex(session, lastSelection) {
  if (!session || !Array.isArray(session.events)) return 0;
  const events = session.events;
  const caret = typeof session.caretIndex === 'number' ? session.caretIndex : 0;
  if (caret >= events.length) return events.length;

  const resolved = resolveEditTargetIds(session, lastSelection);
  if (resolved && resolved.eventIds.length) {
    let maxIdx = -1;
    resolved.eventIds.forEach(function(id) {
      const i = events.findIndex(function(ev) { return ev.id === id; });
      if (i > maxIdx) maxIdx = i;
    });
    if (maxIdx >= 0) return maxIdx + 1;
  }
  return Math.min(Math.max(0, caret), events.length);
}

export function insertBarlineAtCaret(session, barToken, insertIndex) {
  const events = session.events.map(cloneVoiceEvent);
  const idx = typeof insertIndex === 'number'
    ? Math.min(Math.max(0, insertIndex), events.length)
    : layoutInsertIndex(session);
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

export function insertSystemBreakAtCaret(session, insertIndex) {
  const events = session.events.map(cloneVoiceEvent);
  const idx = typeof insertIndex === 'number'
    ? Math.min(Math.max(0, insertIndex), events.length)
    : layoutInsertIndex(session);
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

/** Snap meter-change insertion to the start of the current bar (after preceding barline). */
export function barStartInsertIndex(session, insertIndex) {
  const events = session.events || [];
  let idx = typeof insertIndex === 'number'
    ? Math.min(Math.max(0, insertIndex), events.length)
    : layoutInsertIndex(session);
  if (idx < events.length && events[idx].type === 'barline') return idx + 1;
  for (let i = idx - 1; i >= 0; i -= 1) {
    if (events[i].type === 'barline') return i + 1;
  }
  return 0;
}

export function insertKeyChangeAtCaret(session, key, insertIndex) {
  const events = session.events.map(cloneVoiceEvent);
  const idx = typeof insertIndex === 'number'
    ? Math.min(Math.max(0, insertIndex), events.length)
    : layoutInsertIndex(session);
  const ev = Object.assign({
    id: createEventId('key'),
    type: 'keyChange',
    key: String(key == null ? '' : key).trim() || 'C',
  }, zeroDurationFields());
  events.splice(idx, 0, ev);
  return patchSession(session, { events: events, caretIndex: idx + 1, lastEvent: null });
}

export function insertMeterChangeAtCaret(session, meter, insertIndex) {
  const events = session.events.map(cloneVoiceEvent);
  const idx = barStartInsertIndex(session, insertIndex);
  const ev = Object.assign({
    id: createEventId('meter'),
    type: 'meterChange',
    meter: String(meter == null ? '' : meter).trim() || '4/4',
  }, zeroDurationFields());
  events.splice(idx, 0, ev);
  return patchSession(session, { events: events, caretIndex: idx + 1, lastEvent: null });
}

export function updateKeyChangeEvent(session, eventId, key) {
  const events = session.events.map(cloneVoiceEvent);
  const idx = events.findIndex(function(ev) { return ev.id === eventId; });
  if (idx < 0 || events[idx].type !== 'keyChange') return null;
  events[idx] = Object.assign({}, events[idx], {
    key: String(key == null ? '' : key).trim() || 'C',
  });
  return patchSession(session, { events: events });
}

export function updateMeterChangeEvent(session, eventId, meter) {
  const events = session.events.map(cloneVoiceEvent);
  const idx = events.findIndex(function(ev) { return ev.id === eventId; });
  if (idx < 0 || events[idx].type !== 'meterChange') return null;
  events[idx] = Object.assign({}, events[idx], {
    meter: String(meter == null ? '' : meter).trim() || '4/4',
  });
  return patchSession(session, { events: events });
}

export function writeNoteAtBeat(session, beat, pitch, options) {
  const opts = options || {};
  if (!pitch) return null;
  const hit = eventAtBeat(session.events, beat, session.tuneMeta);
  if (opts.addChordTone && hit && (hit.event.type === 'note' || hit.event.type === 'chord')) {
    return addToneToEvent(session, hit.index, pitch);
  }
  const noteEv = attachTupletToNewEvent(newNoteEvent('note', {
    session: session,
    extra: { pitch: pitch, pitches: [pitch] },
  }), session.tupletMode);
  const unit = session.unitLengthDecimal;
  const clipBeats = noteEv.durationBeats != null
    ? noteEv.durationBeats
    : durationToBeats(noteEv.duration, unit);
  const events = insertTimedEventsAtBeat(session.events, beat, [noteEv], session.tuneMeta);
  const timed = assignTimingToEvents(events, session.tuneMeta.meter, session.unitLengthDecimal);
  const targetBeat = beat + clipBeats;
  let caretIndex = timed.length;
  timed.forEach(function(ev, i) {
    if (typeof ev.startBeat === 'number' && ev.startBeat >= targetBeat - 0.001) {
      caretIndex = Math.min(caretIndex, i);
    }
  });
  return patchSession(session, {
    events: events,
    caretIndex: caretIndex,
    lastEvent: noteEv,
    selection: { eventIds: [], toneIndex: null, anchorId: null },
    tupletMode: advanceTupletMode(session.tupletMode),
    accidentalCarry: null,
    pitchCarry: pitch,
  });
}

export function replaceOrInsertAtCaret(session, pitch, options) {
  const opts = options || {};
  const idx = Math.min(session.caretIndex, session.events.length);
  const ev = idx < session.events.length ? session.events[idx] : null;
  if (ev && typeof ev.startBeat === 'number'
    && (ev.type === 'note' || ev.type === 'chord' || ev.type === 'rest')) {
    return writeNoteAtBeat(session, ev.startBeat, pitch, {
      addChordTone: opts.addChordTone || session.chordBuild,
    });
  }
  return insertPitchAtCaret(session, pitch, Object.assign({}, opts, { forceNew: true }));
}

export function insertPitchAtCaret(session, pitch, options) {
  const opts = options || {};
  const spliceInsert = !!(opts.forceNew || session.spliceAtCaret);
  if (session.fillMeasures && session.mode === EDITOR_MODES.NOTE_INPUT && !spliceInsert) {
    return replaceOrInsertAtCaret(session, pitch, opts);
  }
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
    spliceAtCaret: false,
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
  const tuneMeta = session.tuneMeta;
  const unit = session.unitLengthDecimal;
  let events = session.events.map(cloneVoiceEvent);

  if (ids.length > 0) {
    const timed = assignTimingToEvents(events, tuneMeta.meter, unit);
    const noteIds = [];
    const restIds = [];
    let changed = false;

    ids.forEach(function(id) {
      const ev = timed.find(function(e) { return e.id === id; });
      if (!ev) return;
      if (ev.type === 'barline' || ev.type === 'lineBreak' || ev.type === 'keyChange' || ev.type === 'meterChange') return;
      if (ev.type === 'rest') restIds.push(id);
      else noteIds.push(id);
    });

    let next = events;
    if (noteIds.length) {
      next = next.map(function(ev) {
        if (noteIds.indexOf(ev.id) < 0) return ev;
        changed = true;
        return convertEventToRest(ev);
      });
    }

    if (restIds.length) {
      next = next.filter(function(ev) {
        if (restIds.indexOf(ev.id) < 0) return true;
        changed = true;
        return false;
      });
    }

  // Bar lines and system breaks are layout — remove rather than turn into rests.
    const layoutIds = ids.filter(function(id) {
      const ev = events.find(function(e) { return e.id === id; });
      return ev && isLayoutEventType(ev.type);
    });
    if (layoutIds.length) {
      next = next.filter(function(ev) {
        if (layoutIds.indexOf(ev.id) < 0) return true;
        changed = true;
        return false;
      });
    }

    if (!changed) return null;
    next = finalizeRestOps(next, session);
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
  if (isLayoutEventType(target.type)) {
    events.splice(idx, 1);
    return patchSession(session, {
      events: events,
      caretIndex: Math.min(session.caretIndex, events.length),
    });
  }

  if (target.type === 'rest') {
    let next = events.filter(function(ev) { return ev.id !== target.id; });
    next = finalizeRestOps(next, session);
    return patchSession(session, { events: next });
  }

  if (target.type !== 'note' && target.type !== 'chord') return null;
  events[idx] = convertEventToRest(target);
  let next = finalizeRestOps(events, session);
  return patchSession(session, { events: next });
}

export function removeSelection(session) {
  const ids = session.selection.eventIds || [];
  if (ids.length === 0) return null;
  let events = session.events.filter(function(ev) { return ids.indexOf(ev.id) < 0; });
  events = finalizeRestOps(events, session);
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
    if (ev.type === 'rest' || isLayoutEventType(ev.type)) return;
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
    if (ev.type === 'rest' || isLayoutEventType(ev.type)) return;
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

/** Apply accidental to selected note/chord pitches. value: -2..2 (0 = natural), null = clear to key. */
export function applyAccidentalToSelection(session, value) {
  const resolved = resolveEditTargetIds(session);
  if (!resolved || !resolved.eventIds.length) return null;
  const ids = resolved.eventIds;
  const clearing = value == null;
  const acc = clearing ? null : (typeof value === 'number' ? value : 0);
  const events = session.events.map(cloneVoiceEvent);
  let changed = false;
  events.forEach(function(ev) {
    if (ids.indexOf(ev.id) < 0) return;
    if (ev.type !== 'note' && ev.type !== 'chord') return;
    const toneIndex = resolved.toneIndex;
    function patchPitch(p) {
      const step = p.step || 'C';
      const octave = typeof p.octave === 'number' ? p.octave : 4;
      let name = step;
      if (octave >= 5) name = String(step).toLowerCase() + "'".repeat(octave - 5);
      else if (octave < 4) name = step + ','.repeat(4 - octave);
      if (clearing) {
        return Object.assign({}, p, {
          step: String(step).charAt(0).toUpperCase(),
          octave: octave,
          accidental: null,
          forceNatural: false,
          abcName: name,
        });
      }
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
      toneIndex: resolved.toneIndex,
      anchorId: resolved.anchorId || ids[0],
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
 * Sort selection event ids by timeline position (notes/chords first, then other types).
 */
export function sortSelectionEventIdsByBeat(events, eventIds) {
  if (!Array.isArray(events) || !eventIds || !eventIds.length) return [];
  const idSet = {};
  eventIds.forEach(function(id) { idSet[id] = true; });
  const notes = events
    .filter(function(ev) {
      return ev && ev.id && idSet[ev.id]
        && (ev.type === 'note' || ev.type === 'chord');
    })
    .sort(function(a, b) {
      return (a.startBeat || 0) - (b.startBeat || 0);
    })
    .map(function(ev) { return ev.id; });
  const other = eventIds.filter(function(id) {
    if (notes.indexOf(id) >= 0) return false;
    const ev = events.find(function(e) { return e.id === id; });
    return ev && ev.type !== 'note' && ev.type !== 'chord';
  });
  return notes.concat(other);
}

function eventEndBeat(ev) {
  if (!ev || typeof ev.startBeat !== 'number') return null;
  const dur = typeof ev.durationBeats === 'number' ? ev.durationBeats : 0;
  return ev.startBeat + dur;
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
  let toneIndex;
  let anchorId;
  let startMs;
  let startBeat;
  // Prefer lastSelection: syncSessionAction updates it immediately; React session can lag one frame.
  let ids = liveIds(lastSelection && lastSelection.eventIds);
  if (ids.length) {
    toneIndex = lastSelection.toneIndex;
    anchorId = lastSelection.anchorId;
    startMs = lastSelection.startMs;
    startBeat = lastSelection.startBeat;
  } else {
    ids = liveIds(session.selection && session.selection.eventIds);
    toneIndex = session.selection && session.selection.toneIndex;
    anchorId = session.selection && session.selection.anchorId;
    startMs = session.selection && session.selection.startMs;
    startBeat = session.selection && session.selection.startBeat;
  }
  if (!ids.length) {
    const caret = typeof session.caretIndex === 'number' ? session.caretIndex : 0;
    const atCaret = session.events[caret];
    if (atCaret && (atCaret.type === 'note' || atCaret.type === 'chord' || atCaret.type === 'rest')) {
      ids = [atCaret.id];
    } else if (caret > 0) {
      const prev = session.events[caret - 1];
      if (prev && (prev.type === 'note' || prev.type === 'chord' || prev.type === 'rest')) {
        ids = [prev.id];
      }
    }
  }
  if (!ids.length) return null;
  const sortedIds = sortSelectionEventIdsByBeat(session.events, ids);
  const earliest = session.events.find(function(ev) { return ev.id === sortedIds[0]; });
  if (earliest && typeof earliest.startBeat === 'number') {
    startBeat = earliest.startBeat;
  }
  if (startMs != null && earliest && typeof startBeat === 'number'
    && lastSelection && lastSelection.startBeat != null
    && Math.abs(lastSelection.startBeat - startBeat) > 0.001) {
    startMs = session.selection && session.selection.startMs != null
      ? session.selection.startMs : null;
  }
  return {
    eventIds: sortedIds,
    toneIndex: toneIndex != null ? toneIndex : null,
    anchorId: (anchorId && idSet[anchorId]) ? anchorId : sortedIds[0],
    startMs: typeof startMs === 'number' && startMs >= 0 ? startMs : undefined,
    startBeat: typeof startBeat === 'number' ? startBeat : undefined,
  };
}

export function changeSelectedDuration(session, durationKey, dotted) {
  const ids = session.selection.eventIds || [];
  const events = session.events.map(cloneVoiceEvent);
  const mult = DURATION_KEY_MULTIPLIERS[durationKey] || 2;
  const unit = session.unitLengthDecimal;
  const beats = mult * unit * 4 * (dotted ? 1.5 : 1);
  const duration = beatsToDuration(beats, unit);
  let next = events;
  let touchedRest = false;

  function applyNoteDurations(list) {
    return list.map(function(ev) {
      if (ids.length) {
        if (ids.indexOf(ev.id) < 0 || ev.type === 'rest') return ev;
      } else {
        const idx = Math.max(0, session.caretIndex - 1);
        const target = events[idx];
        if (!target || ev.id !== target.id) return ev;
      }
      if (isLayoutEventType(ev.type)) return ev;
      const copy = cloneVoiceEvent(ev);
      copy.duration = duration;
      return copy;
    });
  }

  if (ids.length) {
    ids.forEach(function(id) {
      const ev = events.find(function(e) { return e.id === id; });
      if (ev && ev.type === 'rest') {
        next = applyRestDurationChange(next, id, beats, session);
        touchedRest = true;
      }
    });
    next = applyNoteDurations(next);
  } else {
    const idx = Math.max(0, session.caretIndex - 1);
    const ev = events[idx];
    if (!ev) return patchSession(session, { events: events, durationKey: durationKey, dotted: !!dotted });
    if (ev.type === 'rest') {
      next = applyRestDurationChange(events, ev.id, beats, session);
      touchedRest = true;
    } else if (!isLayoutEventType(ev.type)) {
      next = applyNoteDurations(events);
    }
  }

  if (!touchedRest) {
    next = collapseAdjacentRests(next, session.tuneMeta);
  }
  return patchSession(session, { events: next, durationKey: durationKey, dotted: !!dotted });
}

export function deleteToRestUndoLabel(session, options) {
  const backward = !options || options.backward !== false;
  const ids = session.selection.eventIds || [];
  function isRestId(id) {
    const ev = session.events.find(function(e) { return e.id === id; });
    return ev && ev.type === 'rest';
  }
  function isNoteId(id) {
    const ev = session.events.find(function(e) { return e.id === id; });
    return ev && (ev.type === 'note' || ev.type === 'chord');
  }
  if (ids.length) {
    const hasRest = ids.some(isRestId);
    const hasNote = ids.some(isNoteId);
    if (hasRest && !hasNote) return 'Delete rest';
    return 'Delete to rest';
  }
  let idx = backward ? session.caretIndex - 1 : session.caretIndex;
  const target = session.events[idx];
  if (target && target.type === 'rest') return 'Delete rest';
  return 'Delete to rest';
}

export function restDurationChangeLabel(session, durationKey, dotted) {
  const mult = DURATION_KEY_MULTIPLIERS[durationKey] || 2;
  const unit = session.unitLengthDecimal;
  const beats = mult * unit * 4 * (dotted ? 1.5 : 1);
  const ids = session.selection.eventIds || [];
  const targetIds = ids.length
    ? ids
    : (function() {
      const idx = Math.max(0, session.caretIndex - 1);
      const ev = session.events[idx];
      return ev && ev.id ? [ev.id] : [];
    }());
  const willSplit = targetIds.some(function(id) {
    const ev = session.events.find(function(e) { return e.id === id; });
    if (!ev || ev.type !== 'rest') return false;
    return durationToBeats(ev.duration, unit) > beats + 0.001;
  });
  return willSplit ? 'Split rest' : 'Change duration';
}

export function toggleDotOnSelection(session) {
  const resolved = resolveEditTargetIds(session);
  if (!resolved || !resolved.eventIds.length) return null;
  const ids = resolved.eventIds;
  const events = session.events.map(cloneVoiceEvent);
  let changed = false;
  events.forEach(function(ev) {
    if (ids.indexOf(ev.id) < 0) return;
    if (isLayoutEventType(ev.type)) return;
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
    if (isLayoutEventType(ev.type)) return;
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
/** Select all notes, chords, and rests in the voice (excludes barlines / line breaks). */
export function selectAllPitchedEvents(session) {
  const events = session.events || [];
  const ids = events
    .filter(function(ev) {
      return ev.type === 'note' || ev.type === 'chord' || ev.type === 'rest';
    })
    .map(function(ev) { return ev.id; });
  if (!ids.length) {
    return Object.assign({}, session, {
      selection: { eventIds: [], toneIndex: null, anchorId: null },
    });
  }
  return Object.assign({}, session, {
    selection: { eventIds: ids, toneIndex: null, anchorId: ids[0] },
    caretIndex: 0,
  });
}

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
