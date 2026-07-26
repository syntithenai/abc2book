import {
  copyToClipboard,
  cutToClipboard,
  pasteFromClipboard,
  swapWithClipboard,
  repeatSelectionAtCaret,
  getNotationClipboard,
} from './notationClipboard';
import { assignTimingToEvents, parseNoteLengthDecimal } from './beatGrid';

function pitchFields(ev) {
  const p = ev.pitch || (ev.pitches && ev.pitches[0]);
  return {
    step: p && p.step,
    octave: p && p.octave,
    accidental: p && p.accidental,
    duration: ev.duration,
  };
}

describe('notationClipboard', function() {
  const meta = { meter: '4/4', noteLength: '1/8' };
  const unit = parseNoteLengthDecimal(meta.noteLength, meta.meter);

  function timedEvents(list) {
    return assignTimingToEvents(list, meta.meter, unit);
  }

  test('copy and paste preserves pitch content with new ids', function() {
    const events = [
      { id: 'a', type: 'note', duration: { num: 1, den: 1, dotted: false }, pitch: { step: 'C', octave: 4, accidental: 0 }, pitches: [{ step: 'C', octave: 4, accidental: 0 }] },
    ];
    copyToClipboard(events, meta, 0);
    expect(getNotationClipboard().events.length).toBe(1);
    const pasted = pasteFromClipboard([], 0, meta);
    expect(pasted.events.length).toBe(1);
    expect(pasted.events[0].id).not.toBe('a');
    expect(pitchFields(pasted.events[0])).toEqual(pitchFields(events[0]));
  });

  test('cutToClipboard removes events and stores them', function() {
    const events = [
      { id: 'a', type: 'note', duration: { num: 1, den: 1, dotted: false }, pitch: { step: 'C', octave: 4, accidental: 0 }, pitches: [{ step: 'C', octave: 4, accidental: 0 }] },
      { id: 'b', type: 'note', duration: { num: 1, den: 1, dotted: false }, pitch: { step: 'D', octave: 4, accidental: 0 }, pitches: [{ step: 'D', octave: 4, accidental: 0 }] },
    ];
    const remaining = cutToClipboard(events, ['a'], meta, 0);
    expect(remaining.length).toBe(1);
    expect(remaining[0].id).toBe('b');
    expect(getNotationClipboard().events[0].pitch.step).toBe('C');
  });

  test('swapWithClipboard exchanges selection with clipboard', function() {
    const events = [
      { id: 'a', type: 'note', duration: { num: 1, den: 1, dotted: false }, pitch: { step: 'C', octave: 4, accidental: 0 }, pitches: [{ step: 'C', octave: 4, accidental: 0 }] },
      { id: 'b', type: 'note', duration: { num: 1, den: 1, dotted: false }, pitch: { step: 'D', octave: 4, accidental: 0 }, pitches: [{ step: 'D', octave: 4, accidental: 0 }] },
    ];
    copyToClipboard([events[1]], meta, 0);
    const swapped = swapWithClipboard(events, ['a'], 1, meta, 0);
    expect(swapped.events.length).toBe(2);
    expect(swapped.events[0].pitch.step).toBe('D');
    expect(swapped.events[1].pitch.step).toBe('C');
  });

  test('pasteFromClipboard replaces selected events by beat span', function() {
    const events = timedEvents([
      { id: 'a', type: 'note', duration: { num: 1, den: 1, dotted: false }, pitch: { step: 'C', octave: 4, accidental: 0 }, pitches: [{ step: 'C', octave: 4, accidental: 0 }] },
      { id: 'b', type: 'note', duration: { num: 1, den: 1, dotted: false }, pitch: { step: 'D', octave: 4, accidental: 0 }, pitches: [{ step: 'D', octave: 4, accidental: 0 }] },
      { id: 'c', type: 'note', duration: { num: 1, den: 1, dotted: false }, pitch: { step: 'E', octave: 4, accidental: 0 }, pitches: [{ step: 'E', octave: 4, accidental: 0 }] },
    ]);
    copyToClipboard(timedEvents([
      { id: 'x', type: 'note', duration: { num: 1, den: 1, dotted: false }, pitch: { step: 'G', octave: 4, accidental: 0 }, pitches: [{ step: 'G', octave: 4, accidental: 0 }] },
    ]), meta, 0);
    const pasted = pasteFromClipboard(events, 2, meta, ['b', 'c']);
    const notes = pasted.events.filter(function(ev) { return ev.type === 'note'; });
    expect(notes.map(function(n) { return n.pitch.step; })).toEqual(['C', 'E', 'G']);
  });

  test('repeatSelectionAtCaret duplicates exact pitches at caret', function() {
    const events = [
      { id: 'a', type: 'note', duration: { num: 1, den: 1, dotted: false }, pitch: { step: 'C', octave: 4, accidental: 0 }, pitches: [{ step: 'C', octave: 4, accidental: 0 }] },
      { id: 'b', type: 'note', duration: { num: 1, den: 1, dotted: false }, pitch: { step: 'D', octave: 4, accidental: 0 }, pitches: [{ step: 'D', octave: 4, accidental: 0 }] },
    ];
    const patch = repeatSelectionAtCaret(events, ['a'], 2);
    expect(patch.events.length).toBe(3);
    expect(patch.events[2].pitch.step).toBe('C');
    expect(patch.caretIndex).toBe(3);
  });
});
