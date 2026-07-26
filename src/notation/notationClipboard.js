import { cloneVoiceEvent, createEventId } from './voiceEventModel';
import {
  insertTimedEventsAtBeat,
  totalTimedBeats,
  stripFillerRests,
} from './staffMeasureFill';
import { assignTimingToEvents, parseNoteLengthDecimal } from './beatGrid';

let clipboard = null;

export function getNotationClipboard() {
  return clipboard;
}

export function hasClipboardContent() {
  return !!(clipboard && Array.isArray(clipboard.events) && clipboard.events.length > 0);
}

export function copyToClipboard(events, tuneMeta, voiceIndex) {
  clipboard = {
    events: events.map(cloneVoiceEvent),
    sourceMeter: tuneMeta.meter,
    sourceNoteLength: tuneMeta.noteLength,
    voiceIndex: voiceIndex,
  };
  return clipboard;
}

export function cutToClipboard(events, selectedIds, tuneMeta, voiceIndex) {
  const selected = events.filter(function(ev) { return selectedIds.indexOf(ev.id) >= 0; });
  copyToClipboard(selected, tuneMeta, voiceIndex);
  return events.filter(function(ev) { return selectedIds.indexOf(ev.id) < 0; });
}

export function pasteFromClipboard(events, caretIndex, tuneMeta, replaceIds) {
  if (!clipboard || !clipboard.events.length) return null;
  const clone = clipboard.events.map(function(ev) {
    const c = cloneVoiceEvent(ev);
    c.id = createEventId('paste');
    return c;
  });
  const ids = Array.isArray(replaceIds) ? replaceIds.filter(Boolean) : [];
  if (ids.length && tuneMeta) {
    const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
    const timed = assignTimingToEvents(events.map(cloneVoiceEvent), tuneMeta.meter, unit);
    let anchorBeat = 0;
    let minIdx = timed.length;
    ids.forEach(function(id) {
      timed.forEach(function(ev, i) {
        if (ev.id === id && i < minIdx) {
          minIdx = i;
          if (typeof ev.startBeat === 'number') anchorBeat = ev.startBeat;
        }
      });
    });
    const clipBeats = totalTimedBeats(clone, tuneMeta);
    const next = stripFillerRests(
      insertTimedEventsAtBeat(events, anchorBeat, clone, tuneMeta)
    );
    let caret = next.length;
    next.forEach(function(ev, i) {
      if (typeof ev.startBeat === 'number' && ev.startBeat >= anchorBeat + clipBeats - 0.001) {
        caret = Math.min(caret, i);
      }
    });
    return {
      events: next,
      caretIndex: caret,
      meterWarning: clipboard.sourceMeter !== tuneMeta.meter,
    };
  }
  let next = events.slice();
  let idx = Math.min(caretIndex, next.length);
  if (ids.length) {
    const idSet = {};
    ids.forEach(function(id) { idSet[id] = true; });
    let minIdx = next.length;
    next.forEach(function(ev, i) {
      if (idSet[ev.id] && i < minIdx) minIdx = i;
    });
    if (minIdx < next.length) idx = minIdx;
    next = next.filter(function(ev) { return !idSet[ev.id]; });
    if (idx > next.length) idx = next.length;
  }
  next.splice(idx, 0, ...clone);
  return {
    events: next,
    caretIndex: idx + clone.length,
    meterWarning: clipboard.sourceMeter !== tuneMeta.meter,
  };
}

export function swapWithClipboard(events, selectedIds, caretIndex, tuneMeta, voiceIndex) {
  const selected = events.filter(function(ev) { return selectedIds.indexOf(ev.id) >= 0; });
  const oldClip = clipboard;
  copyToClipboard(selected, tuneMeta, voiceIndex);
  const without = events.filter(function(ev) { return selectedIds.indexOf(ev.id) < 0; });
  if (!oldClip || !oldClip.events.length) {
    return { events: without, caretIndex: caretIndex };
  }
  return pasteFromClipboard(without, caretIndex, tuneMeta);
}

export function repeatSelectionAtCaret(events, selectedIds, caretIndex) {
  const selected = events.filter(function(ev) { return selectedIds.indexOf(ev.id) >= 0; });
  if (!selected.length) return null;
  const clone = selected.map(function(ev) {
    const c = cloneVoiceEvent(ev);
    c.id = createEventId('repeat');
    return c;
  });
  const next = events.slice();
  const idx = Math.min(caretIndex, next.length);
  next.splice(idx, 0, ...clone);
  return { events: next, caretIndex: idx + clone.length };
}
