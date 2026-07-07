import { createEventId, cloneVoiceEvent } from './voiceEventModel';
import { reassignEventTiming } from './abcVoiceSerializer';
import { isKnownDecorationKey } from './notationTokens';

export function defaultNoteExtensions() {
  return {
    slurStart: false,
    slurEnd: false,
    slurGroupId: null,
    decorations: [],
    graceNotes: [],
    chordSymbols: [],
    tuplet: null,
    abcLeading: '',
    abcTrailing: '',
  };
}

export function applyNoteExtensions(ev) {
  const ext = defaultNoteExtensions();
  Object.keys(ext).forEach(function(key) {
    if (ev[key] == null) ev[key] = ext[key];
  });
  if (!Array.isArray(ev.decorations)) ev.decorations = [];
  if (!Array.isArray(ev.graceNotes)) ev.graceNotes = [];
  if (!Array.isArray(ev.chordSymbols)) ev.chordSymbols = [];
  return ev;
}

function patchSession(session, patch) {
  return Object.assign({}, session, patch, {
    events: reassignEventTiming(patch.events || session.events, session.tuneMeta),
  });
}

function targetEventIds(session) {
  const ids = session.selection.eventIds || [];
  if (ids.length) return ids;
  if (session.caretIndex > 0) {
    const prev = session.events[session.caretIndex - 1];
    if (prev && prev.type !== 'barline' && prev.type !== 'lineBreak') return [prev.id];
  }
  return [];
}

function isNoteLike(ev) {
  return ev && (ev.type === 'note' || ev.type === 'chord' || ev.type === 'rest');
}

export function toggleTie(session) {
  const ids = targetEventIds(session);
  if (!ids.length) return null;
  const events = session.events.map(cloneVoiceEvent);
  const idSet = {};
  ids.forEach(function(id) { idSet[id] = true; });

  ids.forEach(function(id) {
    const idx = events.findIndex(function(ev) { return ev.id === id; });
    if (idx < 0) return;
    const ev = events[idx];
    if (!isNoteLike(ev) || ev.type === 'rest') return;
    applyNoteExtensions(ev);
    ev.tieEnd = !ev.tieEnd;
    if (ev.tieEnd && idx + 1 < events.length) {
      const next = events[idx + 1];
      if (isNoteLike(next) && next.type !== 'rest') {
        applyNoteExtensions(next);
        next.tieStart = true;
      }
    }
    if (!ev.tieEnd && idx + 1 < events.length) {
      const next = events[idx + 1];
      if (next && next.tieStart) next.tieStart = false;
    }
  });
  return patchSession(session, { events: events });
}

export function toggleDecoration(session, decorationKey) {
  const ids = targetEventIds(session);
  if (!ids.length || !isKnownDecorationKey(decorationKey)) return null;
  const events = session.events.map(cloneVoiceEvent);
  ids.forEach(function(id) {
    const ev = events.find(function(e) { return e.id === id; });
    if (!ev || !isNoteLike(ev) || ev.type === 'rest') return;
    applyNoteExtensions(ev);
    const i = ev.decorations.indexOf(decorationKey);
    if (i >= 0) ev.decorations.splice(i, 1);
    else ev.decorations.push(decorationKey);
  });
  return patchSession(session, { events: events });
}

export function clearSlurOnSelection(session) {
  const ids = targetEventIds(session);
  if (!ids.length) return null;
  const events = session.events.map(cloneVoiceEvent);
  ids.forEach(function(id) {
    const ev = events.find(function(e) { return e.id === id; });
    if (!ev || !isNoteLike(ev)) return;
    applyNoteExtensions(ev);
    ev.slurStart = false;
    ev.slurEnd = false;
    ev.slurGroupId = null;
  });
  return patchSession(session, { events: events, slurMode: false, slurPendingStartId: null });
}

export function applySlurToRange(session, startId, endId) {
  const events = session.events.map(cloneVoiceEvent);
  const startIdx = events.findIndex(function(ev) { return ev.id === startId; });
  const endIdx = events.findIndex(function(ev) { return ev.id === endId; });
  if (startIdx < 0 || endIdx < 0) return null;
  const lo = Math.min(startIdx, endIdx);
  const hi = Math.max(startIdx, endIdx);
  const groupId = createEventId('slur');
  for (let i = lo; i <= hi; i += 1) {
    const ev = events[i];
    if (!isNoteLike(ev) || ev.type === 'rest' || ev.type === 'barline') continue;
    applyNoteExtensions(ev);
    ev.slurGroupId = groupId;
    ev.slurStart = i === lo;
    ev.slurEnd = i === hi;
  }
  return patchSession(session, {
    events: events,
    slurMode: false,
    slurPendingStartId: null,
  });
}

export function handleSlurModeClick(session, eventId) {
  if (!session.slurMode) return null;
  const ev = session.events.find(function(e) { return e.id === eventId; });
  if (!ev || !isNoteLike(ev) || ev.type === 'rest') return null;
  if (!session.slurPendingStartId) {
    return Object.assign({}, session, { slurPendingStartId: eventId });
  }
  if (session.slurPendingStartId === eventId) {
    return Object.assign({}, session, { slurPendingStartId: null });
  }
  return applySlurToRange(session, session.slurPendingStartId, eventId);
}

export function insertGraceBeforeSelection(session, acciaccatura) {
  const ids = targetEventIds(session);
  if (!ids.length) return null;
  const events = session.events.map(cloneVoiceEvent);
  const id = ids[ids.length - 1];
  const ev = events.find(function(e) { return e.id === id; });
  if (!ev || ev.type === 'rest' || ev.type === 'barline') return null;
  applyNoteExtensions(ev);
  const refPitch = ev.pitch || (ev.pitches && ev.pitches[0]);
  if (!refPitch) return null;
  const gracePitch = Object.assign({}, refPitch);
  const unit = session.unitLengthDecimal;
  const graceDur = { num: 1, den: acciaccatura ? 16 : 8, dotted: false };
  ev.graceNotes = ev.graceNotes.concat([{
    pitch: gracePitch,
    duration: graceDur,
    acciaccatura: !!acciaccatura,
  }]);
  return patchSession(session, { events: events });
}

export function attachTupletToNewEvent(ev, tupletMode) {
  if (!tupletMode || !ev) return ev;
  applyNoteExtensions(ev);
  const index = tupletMode.notesEntered || 0;
  ev.tuplet = {
    num: tupletMode.num,
    den: tupletMode.den,
    groupId: tupletMode.groupId,
    indexInGroup: index,
    size: tupletMode.size || tupletMode.num,
  };
  return ev;
}

export function advanceTupletMode(tupletMode) {
  if (!tupletMode) return null;
  const next = Object.assign({}, tupletMode, {
    notesEntered: (tupletMode.notesEntered || 0) + 1,
  });
  if (next.notesEntered >= (next.size || next.num)) return null;
  return next;
}
