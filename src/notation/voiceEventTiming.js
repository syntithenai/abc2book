import { assignTimingToEvents, parseNoteLengthDecimal } from './beatGrid';
import { parseVoiceEvents, pitchToMidi } from './voiceEventModel';
import { serializeVoiceEventSpans } from './abcVoiceSerializer';
import { mapAbcClickToVoiceCursor } from './notationDisplayAbc';

/** Convert abcjs line-local measure to a disambiguation key (line + measure). */
export function globalMeasureFromAnalysis(analysis) {
  if (!analysis) return null;
  const el = analysis.selectableElement;
  if (el && el.classList) {
    const classes = Array.from(el.classList);
    for (let i = 0; i < classes.length; i += 1) {
      const mm = classes[i].match(/^abcjs-mm(\d+)$/);
      if (mm) return parseInt(mm[1], 10);
    }
  }
  if (typeof analysis.measure !== 'number') return null;
  let line = typeof analysis.line === 'number' ? analysis.line : 0;
  if (el && el.classList) {
    const classes = Array.from(el.classList);
    for (let i = 0; i < classes.length; i += 1) {
      const lm = classes[i].match(/^abcjs-l(\d+)$/);
      if (lm) {
        line = parseInt(lm[1], 10);
        break;
      }
    }
  }
  return line * 1000 + analysis.measure;
}

/** Match event measureIndex against global/line-local measure from analysis. */
function eventMatchesAnalysisMeasure(events, eventIndex, analysis) {
  if (!analysis || eventIndex < 0 || eventIndex >= events.length) return false;
  const ev = events[eventIndex];
  const gm = globalMeasureFromAnalysis(analysis);
  if (gm == null) return false;
  if (gm >= 1000) {
    const line = Math.floor(gm / 1000);
    const localMeasure = gm % 1000;
    const evMeasure = ev.measureIndex || 0;
    return evMeasure === localMeasure || evMeasure === gm;
  }
  return (ev.measureIndex || 0) === gm;
}

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
 * so identity stays tied to the glyph that was clicked. Midi fallback is for
 * clicks only — drag release must not use it (other notes may share the destination pitch).
 */
export function eventIndexFromStaffAbcElem(events, tuneMeta, fullAbc, displayedVoiceKeys, analysisVoiceIndex, abcelem, analysis, options) {
  const opts = options || {};
  if (abcelem && typeof abcelem.startChar === 'number' && fullAbc && displayedVoiceKeys && displayedVoiceKeys.length) {
    const mapped = mapAbcClickToVoiceCursor(fullAbc, displayedVoiceKeys, analysisVoiceIndex, abcelem.startChar);
    if (mapped) {
      let idx = eventIndexFromAbcCharPosition(events, tuneMeta, mapped.offset);
      const ev = events[idx];
      if (ev && ev.type === 'lineBreak') {
        for (let i = idx + 1; i < events.length; i += 1) {
          if (events[i].type === 'note' || events[i].type === 'chord') {
            idx = i;
            break;
          }
        }
      }
      return idx;
    }
  }
  if (opts.startCharOnly) return null;
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
    if (candidates.length > 1 && analysis) {
      const gm = globalMeasureFromAnalysis(analysis);
      if (gm != null) {
        for (let c = 0; c < candidates.length; c += 1) {
          if (eventMatchesAnalysisMeasure(events, candidates[c], analysis)) return candidates[c];
        }
      }
      if (typeof analysis.measure === 'number') {
        const measure = analysis.measure;
        for (let c = 0; c < candidates.length; c += 1) {
          if ((events[candidates[c]].measureIndex || 0) === measure) return candidates[c];
        }
      }
      return candidates[0];
    }
    if (candidates.length) return candidates[candidates.length - 1];
  }

  if (analysis && typeof analysis.startBeat === 'number') {
    return caretIndexForStartBeat(events, analysis.startBeat);
  }

  if (!analysis) return null;
  const gm = globalMeasureFromAnalysis(analysis);
  if (gm != null) {
    for (let i = 0; i < events.length; i += 1) {
      if (eventMatchesAnalysisMeasure(events, i, analysis)) return i;
      if ((events[i].measureIndex || 0) > gm) return i;
    }
    return events.length > 0 ? events.length - 1 : 0;
  }
  if (typeof analysis.measure !== 'number') return null;
  const measure = analysis.measure;
  for (let i = 0; i < events.length; i += 1) {
    if ((events[i].measureIndex || 0) === measure) return i;
    if ((events[i].measureIndex || 0) > measure) return i;
  }
  return events.length > 0 ? events.length - 1 : 0;
}

/** Map event caret index to character range in serialized voice body. */
export function abcCharRangeForEventIndex(events, index, tuneMeta) {
  const packed = serializeVoiceEventSpans(events, tuneMeta);
  const body = packed.body;
  if (!body || index <= 0) return { start: 0, end: 0 };
  if (index >= events.length) return { start: body.length, end: body.length };
  const span = packed.spans.find(function(s) { return s.eventIndex === index; });
  if (span) return { start: span.start, end: span.end };
  // Between events / after last printable: use next span start or end of body.
  for (let i = 0; i < packed.spans.length; i += 1) {
    if (packed.spans[i].eventIndex > index) {
      return { start: packed.spans[i].start, end: packed.spans[i].start };
    }
  }
  return { start: body.length, end: body.length };
}

/** Map ABC textarea cursor position to nearest event index. */
export function eventIndexFromAbcCharPosition(events, tuneMeta, charPos) {
  const packed = serializeVoiceEventSpans(events, tuneMeta);
  const body = packed.body;
  if (!body) return 0;
  const pos = Math.max(0, Math.min(charPos, body.length));
  if (!packed.spans.length) return events.length;

  // Prefer the token that contains pos with exclusive end so adjacent beamed notes
  // (shared boundary, no space) resolve to the later glyph's startChar.
  for (let i = 0; i < packed.spans.length; i += 1) {
    const span = packed.spans[i];
    if (pos >= span.start && pos < span.end) return span.eventIndex;
  }
  for (let i = packed.spans.length - 1; i >= 0; i -= 1) {
    if (pos >= packed.spans[i].end) return packed.spans[i].eventIndex;
  }
  return events.length;
}

/** Find inline [K:…] / [M:…] event at a voice-body character offset. */
export function inlineSignatureEventAtCharPosition(events, tuneMeta, charPos) {
  const packed = serializeVoiceEventSpans(events, tuneMeta);
  const pos = Math.max(0, charPos);
  for (let i = 0; i < (events || []).length; i += 1) {
    const ev = events[i];
    if (ev.type !== 'keyChange' && ev.type !== 'meterChange') continue;
    const span = packed.spans.find(function(s) { return s.eventIndex === i; });
    if (span && pos >= span.start && pos < span.end) return ev;
  }
  const idx = eventIndexFromAbcCharPosition(events, tuneMeta, pos);
  const hit = events[idx];
  if (hit && (hit.type === 'keyChange' || hit.type === 'meterChange')) return hit;
  if (idx > 0) {
    const prev = events[idx - 1];
    if (prev && (prev.type === 'keyChange' || prev.type === 'meterChange')) {
      const span = packed.spans.find(function(s) { return s.eventIndex === idx - 1; });
      if (span && pos >= span.start && pos <= span.end) return prev;
    }
  }
  return null;
}

/** Map a staff click on an inline signature glyph to its editor event. */
export function inlineSignatureEventAtStaffClick(events, tuneMeta, fullAbc, displayedVoiceKeys, analysisVoiceIndex, abcelem) {
  if (!abcelem || typeof abcelem.startChar !== 'number' || !fullAbc) return null;
  const mapped = mapAbcClickToVoiceCursor(fullAbc, displayedVoiceKeys, analysisVoiceIndex, abcelem.startChar);
  if (!mapped) return null;
  return inlineSignatureEventAtCharPosition(events, tuneMeta, mapped.offset);
}
