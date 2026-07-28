import { assignTimingToEvents, parseNoteLengthDecimal } from './beatGrid';
import { parseVoiceEvents } from './voiceEventModel';
import { serializeVoiceEvents } from './abcVoiceSerializer';
import { applyBarOperationToVoice } from '../scratchpadNotationBarUtils';
import { countVoiceBars } from '../scratchpadNotationMerge';

export function eventBarIndex(events, eventIndex, tuneMeta) {
  if (!Array.isArray(events) || eventIndex < 0) return 1;
  const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
  const timed = assignTimingToEvents(events, tuneMeta.meter, unit);
  const ev = timed[eventIndex];
  if (!ev || typeof ev.measureIndex !== 'number') {
    let bar = 1;
    for (let i = 0; i <= eventIndex && i < timed.length; i += 1) {
      if (timed[i] && timed[i].type === 'barline') bar += 1;
    }
    return Math.max(1, bar);
  }
  return Math.max(1, ev.measureIndex + 1);
}

export function selectionBarRange(events, selectedIds, tuneMeta) {
  const ids = Array.isArray(selectedIds) ? selectedIds : [];
  if (!ids.length) return { fromBar: 1, toBar: null };
  const unit = parseNoteLengthDecimal(tuneMeta.noteLength, tuneMeta.meter);
  const timed = assignTimingToEvents(events, tuneMeta.meter, unit);
  let minBar = Infinity;
  let maxBar = 0;
  timed.forEach(function(ev) {
    if (!ev || ids.indexOf(ev.id) < 0) return;
    const bar = typeof ev.measureIndex === 'number' ? ev.measureIndex + 1 : 1;
    minBar = Math.min(minBar, bar);
    maxBar = Math.max(maxBar, bar);
  });
  if (!Number.isFinite(minBar)) return { fromBar: 1, toBar: null };
  return { fromBar: minBar, toBar: maxBar === minBar ? null : maxBar };
}

export function eventsToNoteLines(events, tuneMeta) {
  const body = serializeVoiceEvents(events, tuneMeta);
  return body.split('\n').filter(function(line, index, arr) {
    return index < arr.length - 1 || String(line).length > 0;
  });
}

export function applyBarPasteToEvents(targetEvents, sourceEvents, tune, mode, fromBar, toBar) {
  const tuneMeta = {
    meter: tune.meter || '4/4',
    noteLength: tune.noteLength || '1/8',
    key: tune.key || 'C',
  };
  const targetNotes = eventsToNoteLines(targetEvents, tuneMeta);
  const sourceNotes = eventsToNoteLines(sourceEvents, tuneMeta);
  const nextNotes = applyBarOperationToVoice(targetNotes, sourceNotes, tune, fromBar, mode, {
    toBar: toBar,
  });
  const body = serializeVoiceEvents(
    parseVoiceEvents(nextNotes.join('\n'), tuneMeta),
    tuneMeta
  );
  return parseVoiceEvents(body, tuneMeta);
}

export function shouldOfferBarPaste(events, selectedIds, tuneMeta) {
  const range = selectionBarRange(events, selectedIds, tuneMeta);
  return range.fromBar >= 1;
}

export function defaultPasteFromBar(events, caretIndex, selectedIds, tuneMeta) {
  const range = selectionBarRange(events, selectedIds, tuneMeta);
  if (selectedIds && selectedIds.length) return range;
  return { fromBar: eventBarIndex(events, caretIndex, tuneMeta), toBar: null };
}

export function countBarsInEvents(events, tuneMeta) {
  const notes = eventsToNoteLines(events, tuneMeta);
  return countVoiceBars(notes, {
    meter: tuneMeta.meter,
    noteLength: tuneMeta.noteLength,
    key: tuneMeta.key,
  });
}
