import { pasteStrainBoundaryWarnings } from './notationStrainBoundary';
import {
  defaultPasteFromBar,
  eventBarIndex,
  selectionBarRange,
} from './notationBarPaste';
import { parseVoiceEvents } from './voiceEventModel';

describe('notationStrainBoundary', function() {
  test('warns when insert shifts strain boundary', function() {
    const notes = ['C D E F | G A B c || D E F G |'];
    const warnings = pasteStrainBoundaryWarnings(notes, 2, null, 'insert');
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].code).toBe('paste_shifts_strain_boundary');
  });

  test('warns when replace crosses strain marker', function() {
    const notes = ['C D E F | G A B c || D E F G |'];
    const warnings = pasteStrainBoundaryWarnings(notes, 2, 2, 'replace');
    expect(warnings.some(function(item) {
      return item.code === 'paste_removes_strain_boundary';
    })).toBe(true);
  });
});

describe('notationBarPaste', function() {
  const tuneMeta = { meter: '4/4', noteLength: '1/4', key: 'C' };

  test('eventBarIndex uses parsed voice events', function() {
    const events = parseVoiceEvents('C D E F | G A B c |', tuneMeta);
    expect(eventBarIndex(events, events.length - 1, tuneMeta)).toBeGreaterThanOrEqual(2);
  });

  test('defaultPasteFromBar uses selection range when present', function() {
    const events = parseVoiceEvents('C D E F | G A B c | A B c d |', tuneMeta);
    const lastId = events[events.length - 1].id;
    const range = defaultPasteFromBar(events, 0, [lastId], tuneMeta);
    expect(range.fromBar).toBeGreaterThanOrEqual(2);
  });

  test('selectionBarRange spans selected events', function() {
    const events = parseVoiceEvents('C D E F | G A B c | A B c d |', tuneMeta);
    const lastId = events[events.length - 1].id;
    const midId = events[Math.floor(events.length / 2)].id;
    const range = selectionBarRange(events, [midId, lastId], tuneMeta);
    expect(range.fromBar).toBeGreaterThanOrEqual(1);
    expect(range.toBar).toBeGreaterThanOrEqual(range.fromBar);
  });
});
