import { assignTimingToEvents, parseNoteLengthDecimal } from './beatGrid';
import { parseVoiceEvents, pitchToMidi } from './voiceEventModel';
import { serializeVoiceEvents } from './abcVoiceSerializer';
import { mapAbcClickToVoiceCursor } from './notationDisplayAbc';

export function sortEventsByStartBeat(events) {
  return events.slice().sort(function(a, b) {
    const sa = typeof a.startBeat === 'number' ? a.startBeat : 0;
    const sb = typeof b.startBeat === 'number' ? b.startBeat : 0;
    return sa - sb;
  });
}

export function eventsFromVoiceBody(voiceBody, tuneMeta) {
  const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
  return assignTimingToEvents(parseVoiceEvents(voiceBody, tuneMeta), tuneMeta.meter, unit);
}

export function caretIndexForStartBeat(events, startBeat) {
  for (let i = 0; i < events.length; i += 1) {
    const ev = events[i];
    if (Math.abs((ev.startBeat || 0) - startBeat) < 0.001) return i;
    if ((ev.startBeat || 0) > startBeat) return i;
  }
  return events.length;
}

/** Caret index for a staff click, including empty areas and placeholder rests. */
export function caretIndexFromStaffClick(events, analysis, abcelem) {
  const direct = eventIndexFromAbcClick(events, analysis, abcelem);
  if (direct != null) return direct;
  if (analysis && typeof analysis.startBeat === 'number') {
    return caretIndexForStartBeat(events, analysis.startBeat);
  }
  if (analysis && typeof analysis.measure === 'number') {
    const measure = analysis.measure;
    for (let i = 0; i < events.length; i += 1) {
      if ((events[i].measureIndex || 0) >= measure) return i;
    }
    return events.length;
  }
  return events.length > 0 ? events.length : 0;
}

/**
 * Map a staff click/drag to an event index. Prefer startChar in the rendered ABC
 * so drag-release (where abcelem.midi is the new pitch) still targets the note
 * that was dragged, not another note at the destination pitch.
 */
export function eventIndexFromStaffAbcElem(events, tuneMeta, fullAbc, displayedVoiceKeys, analysisVoiceIndex, abcelem, analysis) {
  if (abcelem && typeof abcelem.startChar === 'number' && fullAbc && displayedVoiceKeys && displayedVoiceKeys.length) {
    const mapped = mapAbcClickToVoiceCursor(fullAbc, displayedVoiceKeys, analysisVoiceIndex, abcelem.startChar);
    if (mapped) {
      return eventIndexFromAbcCharPosition(events, tuneMeta, mapped.offset);
    }
  }
  return caretIndexFromStaffClick(events, analysis, abcelem);
}

/** Map abcjs selectable index (notes/chords only) to editor event index. */
export function eventIndexFromSelectableIndex(events, selectableIndex) {
  if (typeof selectableIndex !== 'number' || selectableIndex < 0) return 0;
  let seen = -1;
  for (let i = 0; i < events.length; i += 1) {
    const ev = events[i];
    if (ev.type !== 'note' && ev.type !== 'chord') continue;
    seen += 1;
    if (seen === selectableIndex) return i;
  }
  return events.length > 0 ? events.length - 1 : 0;
}

export function eventIndexFromAbcClick(events, analysis, abcelem) {
  if (abcelem && abcelem.midi != null) {
    const targetMidi = abcelem.midi;
    const candidates = [];
    events.forEach(function(ev, i) {
      if (ev.type !== 'note' && ev.type !== 'chord') return;
      const pitches = ev.pitches || (ev.pitch ? [ev.pitch] : []);
      pitches.forEach(function(p) {
        if (pitchToMidi(p) === targetMidi) candidates.push(i);
      });
    });
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1 && analysis && typeof analysis.measure === 'number') {
      const measure = analysis.measure;
      for (let c = 0; c < candidates.length; c += 1) {
        if ((events[candidates[c]].measureIndex || 0) === measure) return candidates[c];
      }
      return candidates[0];
    }
    if (candidates.length) return candidates[candidates.length - 1];
  }

  if (analysis && typeof analysis.startBeat === 'number') {
    return caretIndexForStartBeat(events, analysis.startBeat);
  }

  if (!analysis || typeof analysis.measure !== 'number') return null;
  const measure = analysis.measure;
  for (let i = 0; i < events.length; i += 1) {
    if ((events[i].measureIndex || 0) === measure) return i;
    if ((events[i].measureIndex || 0) > measure) return i;
  }
  return events.length > 0 ? events.length - 1 : 0;
}

/** Map event caret index to character range in serialized voice body. */
export function abcCharRangeForEventIndex(events, index, tuneMeta) {
  const body = serializeVoiceEvents(events, tuneMeta);
  if (!body || index <= 0) return { start: 0, end: 0 };

  let eventCount = 0;
  let pos = 0;
  const lines = body.split('\n');

  for (let li = 0; li < lines.length; li += 1) {
    if (li > 0) {
      if (eventCount === index) return { start: pos, end: pos };
      pos += 1;
      eventCount += 1;
    }
    const tokens = lines[li].trim() ? lines[li].trim().split(/\s+/) : [];
    for (let ti = 0; ti < tokens.length; ti += 1) {
      if (eventCount === index) {
        const tokenStart = body.indexOf(tokens[ti], pos);
        return { start: tokenStart >= 0 ? tokenStart : pos, end: tokenStart >= 0 ? tokenStart + tokens[ti].length : pos };
      }
      eventCount += 1;
      const tokenStart = body.indexOf(tokens[ti], pos);
      pos = tokenStart >= 0 ? tokenStart + tokens[ti].length : pos + tokens[ti].length + 1;
    }
    if (li < lines.length - 1 && lines[li].length) pos = body.indexOf('\n', pos) + 1;
  }
  return { start: body.length, end: body.length };
}

/** Map ABC textarea cursor position to nearest event index. */
export function eventIndexFromAbcCharPosition(events, tuneMeta, charPos) {
  const body = serializeVoiceEvents(events, tuneMeta);
  if (!body) return 0;
  const pos = Math.max(0, Math.min(charPos, body.length));

  let eventCount = 0;
  let cursor = 0;
  const lines = body.split('\n');

  for (let li = 0; li < lines.length; li += 1) {
    if (li > 0) {
      if (pos <= cursor) return eventCount;
      cursor += 1;
      eventCount += 1;
    }
    const line = lines[li];
    const tokens = line.trim() ? line.trim().split(/\s+/) : [];
    let linePos = body.indexOf(line, cursor);
    if (linePos < 0) linePos = cursor;

    for (let ti = 0; ti < tokens.length; ti += 1) {
      const tokenStart = body.indexOf(tokens[ti], linePos);
      const tokenEnd = tokenStart + tokens[ti].length;
      if (pos <= tokenEnd) return eventCount;
      eventCount += 1;
      linePos = tokenEnd;
    }
    cursor = body.indexOf('\n', cursor);
    if (cursor < 0) cursor = body.length;
    else cursor += 1;
  }
  return events.length;
}
