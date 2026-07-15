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

const FINGER_KEYS = ['finger0', 'finger1', 'finger2', 'finger3', 'finger4', 'finger5'];

export function isFingerDecorationKey(key) {
  return FINGER_KEYS.indexOf(key) >= 0;
}

export function fingerKeyFromDigit(digit) {
  const n = parseInt(digit, 10);
  if (!Number.isFinite(n) || n < 0 || n > 5) return null;
  return 'finger' + n;
}

/** Set or clear a chord symbol on the target note/rest (one symbol per event). */
export function setChordSymbolOnSelection(session, chordText) {
  const ids = targetEventIds(session);
  if (!ids.length) return null;
  const text = String(chordText == null ? '' : chordText).trim().replace(/"/g, '');
  const events = session.events.map(cloneVoiceEvent);
  let changed = false;
  ids.forEach(function(id) {
    const ev = events.find(function(e) { return e.id === id; });
    if (!ev || !isNoteLike(ev)) return;
    applyNoteExtensions(ev);
    ev.chordSymbols = text ? [text] : [];
    changed = true;
  });
  if (!changed) return null;
  return patchSession(session, { events: events });
}

/** Stamp a single piano fingering decoration (replaces any existing finger0–5). */
export function setFingerOnSelection(session, fingerKey) {
  const ids = targetEventIds(session);
  if (!ids.length) return null;
  const key = fingerKey ? String(fingerKey) : null;
  if (key && !isFingerDecorationKey(key)) return null;
  const events = session.events.map(cloneVoiceEvent);
  let changed = false;
  ids.forEach(function(id) {
    const ev = events.find(function(e) { return e.id === id; });
    if (!ev || !isNoteLike(ev) || ev.type === 'rest') return;
    applyNoteExtensions(ev);
    ev.decorations = (ev.decorations || []).filter(function(d) { return !isFingerDecorationKey(d); });
    if (key) ev.decorations.push(key);
    changed = true;
  });
  if (!changed) return null;
  return patchSession(session, { events: events });
}

/** Advance caret/selection to the next note-like event after the current target. */
export function advanceSelectionToNextNote(session) {
  const ids = targetEventIds(session);
  const events = session.events;
  let fromIdx = -1;
  if (ids.length) {
    fromIdx = events.findIndex(function(ev) { return ev.id === ids[ids.length - 1]; });
  } else {
    fromIdx = Math.max(0, session.caretIndex - 1);
  }
  for (let i = fromIdx + 1; i < events.length; i++) {
    if (isNoteLike(events[i])) {
      return Object.assign({}, session, {
        caretIndex: i + 1,
        selection: { eventIds: [events[i].id], toneIndex: null, anchorId: events[i].id },
      });
    }
  }
  return Object.assign({}, session, {
    caretIndex: events.length,
    selection: { eventIds: [], toneIndex: null, anchorId: null },
  });
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

  let seed = null;
  for (let i = 0; i < ids.length; i += 1) {
    const ev = session.events.find(function(e) { return e.id === ids[i]; });
    if (!ev || (ev.type !== 'note' && ev.type !== 'chord')) continue;
    if (ev.slurGroupId || ev.slurStart || ev.slurEnd) {
      seed = ev;
      break;
    }
  }
  if (!seed) return null;

  let groupId = seed.slurGroupId;
  let startId = null;
  let endId = null;

  if (groupId) {
    session.events.forEach(function(ev) {
      if (ev.slurGroupId !== groupId) return;
      if (ev.slurStart) startId = ev.id;
      if (ev.slurEnd) endId = ev.id;
    });
  }

  // Fallback for partially stamped / start-end-only groups.
  if (!startId || !endId) {
    const seedIdx = session.events.findIndex(function(e) { return e.id === seed.id; });
    if (seedIdx < 0) return null;
    if (!startId) {
      for (let i = seedIdx; i >= 0; i -= 1) {
        const ev = session.events[i];
        if (ev && ev.slurStart && (ev.type === 'note' || ev.type === 'chord')) {
          startId = ev.id;
          if (!groupId && ev.slurGroupId) groupId = ev.slurGroupId;
          break;
        }
      }
    }
    if (!endId) {
      for (let i = seedIdx; i < session.events.length; i += 1) {
        const ev = session.events[i];
        if (ev && ev.slurEnd && (ev.type === 'note' || ev.type === 'chord')) {
          endId = ev.id;
          if (!groupId && ev.slurGroupId) groupId = ev.slurGroupId;
          break;
        }
      }
    }
  }

  if (!startId || !endId) return null;
  return { groupId: groupId || ('slur-' + startId + '-' + endId), startId: startId, endId: endId };
}

/** Event ids belonging to a slur group (endpoints + members). */
export function slurGroupMemberIds(session, group) {
  if (!session || !group) return [];
  if (group.groupId) {
    const byId = session.events.filter(function(ev) {
      return ev.slurGroupId === group.groupId && (ev.type === 'note' || ev.type === 'chord');
    }).map(function(ev) { return ev.id; });
    if (byId.length) return byId;
  }
  const startIdx = session.events.findIndex(function(ev) { return ev.id === group.startId; });
  const endIdx = session.events.findIndex(function(ev) { return ev.id === group.endId; });
  if (startIdx < 0 || endIdx < 0) return [group.startId, group.endId].filter(Boolean);
  const lo = Math.min(startIdx, endIdx);
  const hi = Math.max(startIdx, endIdx);
  const ids = [];
  for (let i = lo; i <= hi; i += 1) {
    const ev = session.events[i];
    if (ev && (ev.type === 'note' || ev.type === 'chord')) ids.push(ev.id);
  }
  return ids;
}

/**
 * Clear tuplet insert mode and remove tuplet metadata from the active group /
 * selection (End tuplet).
 */
export function clearTupletModeAndSelection(session) {
  const events = session.events.map(cloneVoiceEvent);
  const groupIds = {};
  if (session.tupletMode && session.tupletMode.groupId) {
    groupIds[session.tupletMode.groupId] = true;
  }
  const ids = targetEventIds(session);
  ids.forEach(function(id) {
    const ev = events.find(function(e) { return e.id === id; });
    if (ev && ev.tuplet && ev.tuplet.groupId) groupIds[ev.tuplet.groupId] = true;
  });
  // If nothing selected but caret sits on/after a tupleted note, clear that group.
  if (!Object.keys(groupIds).length) {
    const caret = Math.min(session.caretIndex, events.length);
    const near = events[caret] || (caret > 0 ? events[caret - 1] : null);
    if (near && near.tuplet && near.tuplet.groupId) groupIds[near.tuplet.groupId] = true;
  }
  let changed = false;
  events.forEach(function(ev) {
    if (!ev.tuplet) return;
    if (Object.keys(groupIds).length && !groupIds[ev.tuplet.groupId]) return;
    // With empty groupIds we still only clear when tupletMode was active — do not wipe all.
    if (!Object.keys(groupIds).length) return;
    ev.tuplet = null;
    changed = true;
  });
  if (!changed && !session.tupletMode) return null;
  return patchSession(session, { events: events, tupletMode: null });
}
