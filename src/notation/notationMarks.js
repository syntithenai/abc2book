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
    beamBreakBefore: false,
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
  const groupIds = {};
  ids.forEach(function(id) {
    const ev = events.find(function(e) { return e.id === id; });
    if (!ev || !isNoteLike(ev)) return;
    applyNoteExtensions(ev);
    if (ev.slurGroupId) groupIds[ev.slurGroupId] = true;
    else {
      ev.slurStart = false;
      ev.slurEnd = false;
      ev.slurGroupId = null;
    }
  });
  const hasGroups = Object.keys(groupIds).length > 0;
  if (hasGroups) {
    events.forEach(function(ev) {
      if (!ev.slurGroupId || !groupIds[ev.slurGroupId]) return;
      applyNoteExtensions(ev);
      ev.slurStart = false;
      ev.slurEnd = false;
      ev.slurGroupId = null;
    });
  }
  return patchSession(session, { events: events, slurMode: false, slurPendingStartId: null });
}

/** Clear all slur flags for a group, then apply a new range (endpoint drag). */
export function reassignSlurEndpoints(session, startId, endId, clearGroupId) {
  let next = session;
  if (clearGroupId) {
    const events = session.events.map(cloneVoiceEvent);
    events.forEach(function(ev) {
      if (ev.slurGroupId !== clearGroupId) return;
      applyNoteExtensions(ev);
      ev.slurStart = false;
      ev.slurEnd = false;
      ev.slurGroupId = null;
    });
    next = Object.assign({}, session, { events: events });
  }
  return applySlurToRange(next, startId, endId);
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

/**
 * MuseScore-aligned slur from selection:
 * - ≥2 note/chord events selected → slur first→last by event order
 * - exactly 1 note selected → slur to next note (if any)
 * - else → enter two-click slur mode ({ enterMode: true })
 */
export function applySlurFromSelection(session) {
  const ids = (session.selection && session.selection.eventIds) || [];
  const noteIds = [];
  ids.forEach(function(id) {
    const ev = session.events.find(function(e) { return e.id === id; });
    if (ev && isNoteLike(ev) && ev.type !== 'rest') noteIds.push(id);
  });

  if (noteIds.length >= 2) {
    // Preserve event order (not selection click order).
    const ordered = session.events
      .filter(function(ev) { return noteIds.indexOf(ev.id) >= 0; })
      .map(function(ev) { return ev.id; });
    return applySlurToRange(session, ordered[0], ordered[ordered.length - 1]);
  }

  if (noteIds.length === 1) {
    const startIdx = session.events.findIndex(function(ev) { return ev.id === noteIds[0]; });
    if (startIdx >= 0) {
      for (let i = startIdx + 1; i < session.events.length; i += 1) {
        const next = session.events[i];
        if (isNoteLike(next) && next.type !== 'rest') {
          return applySlurToRange(session, noteIds[0], next.id);
        }
      }
    }
    return { enterMode: true, pendingStartId: noteIds[0] };
  }

  return { enterMode: true, pendingStartId: null };
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

/**
 * Apply tuplet metadata to consecutive note-likes starting at selection/caret.
 * Uses preset { num, den, size? } — size defaults to num.
 */
export function applyTupletToSelection(session, preset) {
  if (!preset || !preset.num) return null;
  const num = preset.num;
  const den = preset.den != null ? preset.den : 2;
  const size = preset.size != null ? preset.size : num;
  const events = session.events.map(cloneVoiceEvent);
  const ids = (session.selection && session.selection.eventIds) || [];
  let startIdx = -1;
  if (ids.length) {
    const ordered = [];
    events.forEach(function(ev, i) {
      if (ids.indexOf(ev.id) >= 0 && isNoteLike(ev)) ordered.push(i);
    });
    if (ordered.length) startIdx = ordered[0];
  }
  if (startIdx < 0) {
    const caret = Math.min(session.caretIndex, events.length);
    for (let i = Math.max(0, caret - 1); i < events.length; i += 1) {
      if (isNoteLike(events[i])) { startIdx = i; break; }
    }
  }
  if (startIdx < 0) return null;

  const groupId = createEventId('tup');
  let assigned = 0;
  for (let i = startIdx; i < events.length && assigned < size; i += 1) {
    const ev = events[i];
    if (!isNoteLike(ev)) continue;
    applyNoteExtensions(ev);
    ev.tuplet = {
      num: num,
      den: den,
      groupId: groupId,
      indexInGroup: assigned,
      size: size,
    };
    assigned += 1;
  }
  if (!assigned) return null;
  return patchSession(session, { events: events, tupletMode: null });
}

/** Set beamBreakBefore on selected note-likes (except first in selection order). */
export function setBeamBreakBeforeSelection(session, value) {
  const ids = (session.selection && session.selection.eventIds) || [];
  if (ids.length < 2 && value !== false) {
    // Single selection: toggle break before that note (if not first event).
    const one = targetEventIds(session);
    if (!one.length) return null;
  }
  const events = session.events.map(cloneVoiceEvent);
  const ordered = [];
  events.forEach(function(ev) {
    if (ids.indexOf(ev.id) >= 0 && isNoteLike(ev)) ordered.push(ev);
  });
  if (ordered.length >= 2) {
    ordered.forEach(function(ev, i) {
      if (i === 0) return;
      applyNoteExtensions(ev);
      ev.beamBreakBefore = value !== false;
    });
  } else {
    const oneIds = ordered.length ? ordered.map(function(e) { return e.id; }) : targetEventIds(session);
    oneIds.forEach(function(id) {
      const ev = events.find(function(e) { return e.id === id; });
      if (!ev || !isNoteLike(ev)) return;
      applyNoteExtensions(ev);
      ev.beamBreakBefore = value === undefined ? !ev.beamBreakBefore : !!value;
    });
  }
  return patchSession(session, { events: events });
}

/** Discover slur group intersecting selection: { groupId, startId, endId }. */
export function findSlurGroupForSelection(session) {
  const ids = (session.selection && session.selection.eventIds) || [];
  if (!ids.length) return null;
  let groupId = null;
  for (let i = 0; i < ids.length; i += 1) {
    const ev = session.events.find(function(e) { return e.id === ids[i]; });
    if (ev && ev.slurGroupId) { groupId = ev.slurGroupId; break; }
  }
  if (!groupId) return null;
  let startId = null;
  let endId = null;
  session.events.forEach(function(ev) {
    if (ev.slurGroupId !== groupId) return;
    if (ev.slurStart) startId = ev.id;
    if (ev.slurEnd) endId = ev.id;
  });
  if (!startId || !endId) return null;
  return { groupId: groupId, startId: startId, endId: endId };
}
