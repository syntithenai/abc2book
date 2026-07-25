import { beatToSeconds } from './recordingGrid';
import { sortSelectionEventIdsByBeat } from './notationActions';

/**
 * Optional playback context from the active notation view.
 * ABC view supplies getAbcCaretIndex() for live textarea cursor mapping.
 */
export function resolvePlaybackSession(session, playbackContext) {
  if (!session) return session;
  const ctx = playbackContext || null;
  if (ctx && ctx.view === 'abc' && typeof ctx.getAbcCaretIndex === 'function') {
    const resolved = ctx.getAbcCaretIndex();
    if (resolved && typeof resolved.caretIndex === 'number') {
      return Object.assign({}, session, {
        events: resolved.events || session.events,
        caretIndex: resolved.caretIndex,
      });
    }
  }
  return session;
}

/** Merge last committed note selection when React session state is briefly stale. */
export function resolvePlaybackSessionWithSelection(session, lastNoteSelection) {
  if (!session) return session;
  const sel = session.selection || {};
  const selIds = sel.eventIds;
  const hasIds = selIds && selIds.length;
  const lastIds = lastNoteSelection && lastNoteSelection.eventIds;
  if (!hasIds && lastIds && lastIds.length) {
    return Object.assign({}, session, {
      selection: {
        eventIds: lastIds.slice(),
        toneIndex: lastNoteSelection.toneIndex,
        anchorId: lastNoteSelection.anchorId || lastIds[0],
        startMs: lastNoteSelection.startMs,
        startBeat: lastNoteSelection.startBeat,
      },
    });
  }
  if (hasIds && sel.startMs == null && lastNoteSelection
    && typeof lastNoteSelection.startMs === 'number' && lastNoteSelection.startMs >= 0) {
    const sorted = sortSelectionEventIdsByBeat(session.events || [], selIds);
    const lastSorted = sortSelectionEventIdsByBeat(session.events || [], lastIds || []);
    if (sorted.length && lastSorted.length && sorted[0] === lastSorted[0]) {
      return Object.assign({}, session, {
        selection: Object.assign({}, sel, {
          startMs: lastNoteSelection.startMs,
          startBeat: lastNoteSelection.startBeat != null
            ? lastNoteSelection.startBeat : sel.startBeat,
        }),
      });
    }
  }
  return session;
}

/** abcjs element wall-clock offset in ms (same units staff click-to-seek uses). */
export function abcElemStartMs(abcelem) {
  if (!abcelem) return null;
  const raw = Array.isArray(abcelem.currentTrackMilliseconds) && abcelem.currentTrackMilliseconds.length
    ? abcelem.currentTrackMilliseconds[0]
    : abcelem.currentTrackMilliseconds;
  return typeof raw === 'number' && raw >= 0 ? raw : null;
}

/** Preferred playback offset from staff selection (abcjs ms), when available. */
export function playbackStartMs(session) {
  const sel = session && session.selection;
  if (sel && typeof sel.startMs === 'number' && sel.startMs >= 0) return sel.startMs;
  return null;
}

function noteStartBeat(events, eventId) {
  const ev = events.find(function(e) { return e.id === eventId; });
  if (ev && typeof ev.startBeat === 'number'
    && (ev.type === 'note' || ev.type === 'chord')) {
    return ev.startBeat;
  }
  return null;
}

/** Beat position to start MIDI playback from the current selection or caret. */
export function playbackStartBeat(session) {
  if (!session || !Array.isArray(session.events)) return 0;
  const events = session.events;
  const selIds = session.selection && session.selection.eventIds;
  if (selIds && selIds.length) {
    for (let i = 0; i < selIds.length; i += 1) {
      const beat = noteStartBeat(events, selIds[i]);
      if (beat != null) return beat;
    }
    const anchorId = session.selection.anchorId;
    if (anchorId) {
      const anchorBeat = noteStartBeat(events, anchorId);
      if (anchorBeat != null) return anchorBeat;
    }
  }
  const caret = typeof session.caretIndex === 'number' ? session.caretIndex : 0;
  if (caret >= 0 && caret < events.length) {
    const at = events[caret];
    if (at && (at.type === 'note' || at.type === 'chord') && typeof at.startBeat === 'number') {
      return at.startBeat;
    }
  }
  for (let i = Math.min(caret, events.length) - 1; i >= 0; i -= 1) {
    const ev = events[i];
    if (ev && (ev.type === 'note' || ev.type === 'chord') && typeof ev.startBeat === 'number') {
      return ev.startBeat;
    }
  }
  return 0;
}

/** Start beat/ms for notation playback from the current session selection. */
export function resolveNotationPlaybackStart(session) {
  const bounds = resolvePlaybackSelectionBounds(session);
  return {
    startBeat: bounds.startBeat,
    startMs: bounds.startMs,
    endBeat: bounds.endBeat,
    endMs: bounds.endMs,
  };
}

function collectSelectedNoteEvents(session) {
  if (!session || !Array.isArray(session.events)) return [];
  const selIds = session.selection && session.selection.eventIds;
  if (!selIds || !selIds.length) return [];
  const sorted = sortSelectionEventIdsByBeat(session.events, selIds);
  const out = [];
  sorted.forEach(function(id) {
    const ev = session.events.find(function(e) { return e.id === id; });
    if (ev && (ev.type === 'note' || ev.type === 'chord')) out.push(ev);
  });
  return out;
}

/**
 * Playback window from selection: earliest note start through end of latest selected note.
 * No note selection → start at 0, play through tune end (endBeat null).
 */
export function resolvePlaybackSelectionBounds(session) {
  const playSession = session || { events: [], selection: {} };
  const noteEvents = collectSelectedNoteEvents(playSession);
  if (!noteEvents.length) {
    return {
      startBeat: playbackStartBeat(playSession),
      endBeat: null,
      startMs: playbackStartMs(playSession),
      endMs: null,
    };
  }
  const startBeat = noteEvents[0].startBeat;
  let endBeat = startBeat;
  noteEvents.forEach(function(ev) {
    const end = ev.startBeat + (typeof ev.durationBeats === 'number' ? ev.durationBeats : 0);
    if (end > endBeat) endBeat = end;
  });
  let startMs = playbackStartMs(playSession);
  const sel = playSession.selection || {};
  if (typeof startMs === 'number' && typeof sel.startBeat === 'number'
    && Math.abs(sel.startBeat - startBeat) > 0.001) {
    startMs = null;
  }
  if (startMs == null && typeof startBeat === 'number') {
    startMs = null;
  }
  return {
    startBeat: typeof startBeat === 'number' ? startBeat : 0,
    endBeat: endBeat,
    startMs: startMs,
    endMs: null,
  };
}

export function ensureNotationMidiRoute(mediaController, tune, tunebook) {
  if (!mediaController || !tune) return;
  const controllerTune = mediaController.tune;
  if ((!controllerTune || controllerTune.id !== tune.id) && mediaController.setTune) {
    mediaController.setTune(tune);
  }
  const onMidi = mediaController.isMidiPlaybackRoute && mediaController.isMidiPlaybackRoute();
  if (!onMidi) {
    if (mediaController.setMediaLinkNumber) {
      mediaController.setMediaLinkNumber(null);
    } else if (mediaController.applyPlaybackRoute && tunebook) {
      mediaController.applyPlaybackRoute('playMidi', null, tune, tunebook);
    }
  }
  if (mediaController.setPlayCancelled) mediaController.setPlayCancelled(false);
}

export function seekNotationPlaybackToBeat(mediaController, beat, tempo, startMs) {
  if (!mediaController) return;
  let seconds = 0;
  if (typeof startMs === 'number' && startMs >= 0) {
    seconds = startMs / 1000;
  } else if (typeof beat === 'number') {
    seconds = beatToSeconds(beat, null, tempo);
  }
  if (mediaController.setCurrentTime) mediaController.setCurrentTime(seconds);
  const progress = mediaController.getPlaybackProgress ? mediaController.getPlaybackProgress() : null;
  const duration = progress && progress.duration ? progress.duration : 0;
  if (duration > 0) {
    const ratio = Math.max(0, Math.min(1, seconds / duration));
    if (mediaController.setClickSeek) mediaController.setClickSeek(ratio);
    if (mediaController.seekToSeconds) {
      mediaController.seekToSeconds(seconds, { wasPlaying: false, skipSeekOperation: true });
    } else if (mediaController.seek) {
      mediaController.seek(ratio);
    }
  }
}

/**
 * Start playback from the selected note (or bar 1 when nothing is selected).
 * Always restarts from that point — never resumes mid-note.
 */
export function startNotationPlayback(
  mediaController, tune, tunebook, session, tempo, playbackContext, playbackControlRef
) {
  if (!mediaController) return;
  const playSession = resolvePlaybackSession(session, playbackContext);
  const start = resolveNotationPlaybackStart(playSession);
  if (mediaController.stopNotationMidiPlayback) {
    mediaController.stopNotationMidiPlayback({ playbackControlRef: playbackControlRef });
  }
  if (mediaController.startNotationMidiPlayback) {
    mediaController.startNotationMidiPlayback({
      tune: tune,
      startBeat: start.startBeat,
      endBeat: start.endBeat,
      startMs: start.startMs,
      endMs: start.endMs,
      tempo: tempo,
      playbackControlRef: playbackControlRef,
      alwaysFromSelection: true,
    });
    return;
  }
  ensureNotationMidiRoute(mediaController, tune, tunebook);
  seekNotationPlaybackToBeat(mediaController, start.startBeat, tempo, start.startMs);
  const playOpts = { fresh: true, restart: true, skipNotationRefresh: true };
  if (mediaController.playFromUserGesture) {
    mediaController.playFromUserGesture(playOpts);
  } else if (mediaController.play) {
    mediaController.play(playOpts);
  }
}

/** Stop playback but keep the red cursor and editor selection. */
export function stopNotationPlayback(mediaController, playbackControlRef) {
  if (!mediaController) return;
  if (mediaController.stopNotationMidiPlayback) {
    mediaController.stopNotationMidiPlayback({ playbackControlRef: playbackControlRef });
    return;
  }
  if (mediaController.isPlaying && mediaController.pause) {
    mediaController.pause();
  }
}

/**
 * Seek to the selected note without playing.
 * Selection is unchanged; only the playback cursor moves.
 */
export function rewindNotationPlayback(
  mediaController, tune, tunebook, session, tempo, playbackContext, playbackControlRef
) {
  if (!mediaController) return;
  const playSession = resolvePlaybackSession(session, playbackContext);
  const start = resolveNotationPlaybackStart(playSession);
  if (mediaController.isPlaying && mediaController.stopNotationMidiPlayback) {
    mediaController.stopNotationMidiPlayback({ playbackControlRef: playbackControlRef });
  }
  ensureNotationMidiRoute(mediaController, tune, tunebook);
  seekNotationPlaybackToBeat(mediaController, start.startBeat, tempo, start.startMs);
  if (mediaController.notationStaffCursorRef && mediaController.notationStaffCursorRef.current) {
    mediaController.notationStaffCursorRef.current();
  }
}

/** @deprecated Use startNotationPlayback / stopNotationPlayback instead. */
export function toggleNotationPlayback(
  mediaController, tune, tunebook, session, tempo, playbackContext, playbackControlRef
) {
  if (mediaController && mediaController.isPlaying) {
    stopNotationPlayback(mediaController, playbackControlRef);
    return;
  }
  startNotationPlayback(
    mediaController, tune, tunebook, session, tempo, playbackContext, playbackControlRef
  );
}
