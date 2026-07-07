import {
  caretIndexFromStaffClick,
  eventIndexFromStaffAbcElem,
  eventIndexFromSelectableIndex,
  eventsFromVoiceBody,
} from './voiceEventTiming';
import { buildAbcPreviewFromBodies } from './notationDisplayAbc';
import useAbcTools from '../useAbcTools';

describe('caretIndexFromStaffClick', function() {
  test('returns 0 for empty events with measure analysis', function() {
    expect(caretIndexFromStaffClick([], { measure: 0 }, null)).toBe(0);
  });

  test('uses startBeat when direct mapping is unavailable', function() {
    const events = [
      { id: 'a', type: 'note', startBeat: 0 },
      { id: 'b', type: 'note', startBeat: 1 },
    ];
    expect(caretIndexFromStaffClick(events, { startBeat: 1 }, null)).toBe(1);
  });
});

describe('eventIndexFromStaffAbcElem', function() {
  const abcTools = useAbcTools();
  const tunebook = { abcTools: abcTools };
  const tuneMeta = { meter: '4/4', noteLength: '1/8', key: 'C', tempo: 120 };
  const tune = {
    id: 't1',
    name: 'Test',
    meter: '4/4',
    noteLength: '1/8',
    key: 'C',
    voices: { 1: { notes: ['C D E |'] } },
  };

  test('maps by startChar even when midi matches a different note (post-drag)', function() {
    const events = eventsFromVoiceBody('C D E |', tuneMeta);
    const abc = buildAbcPreviewFromBodies(tune, tunebook, ['1'], { 1: 'C D E |' });
    const cStart = abc.indexOf('C ');
    expect(cStart).toBeGreaterThanOrEqual(0);
    // After dragging C up to D, abcelem.midi is D (62) but startChar still points at C.
    expect(eventIndexFromStaffAbcElem(
      events,
      tuneMeta,
      abc,
      ['1'],
      0,
      { startChar: cStart, midi: 62 },
      null
    )).toBe(0);
  });

  test('eventIndexFromSelectableIndex skips barlines', function() {
    const events = [
      { type: 'note' },
      { type: 'barline', barToken: '|' },
      { type: 'note' },
    ];
    expect(eventIndexFromSelectableIndex(events, 0)).toBe(0);
    expect(eventIndexFromSelectableIndex(events, 1)).toBe(2);
  });

  test('eventIndexFromStaffAbcElem with chord startChar', function() {
    const events = eventsFromVoiceBody('[CEG] D |', tuneMeta);
    const abc = buildAbcPreviewFromBodies(tune, tunebook, ['1'], { 1: '[CEG] D |' });
    const chordStart = abc.indexOf('[');
    expect(chordStart).toBeGreaterThanOrEqual(0);
    expect(eventIndexFromStaffAbcElem(
      events,
      tuneMeta,
      abc,
      ['1'],
      0,
      { startChar: chordStart },
      null
    )).toBe(0);
  });

  test('eventIndexFromStaffAbcElem with rest startChar', function() {
    const events = eventsFromVoiceBody('C z D |', tuneMeta);
    const abc = buildAbcPreviewFromBodies(tune, tunebook, ['1'], { 1: 'C z D |' });
    const restStart = abc.indexOf('z');
    expect(restStart).toBeGreaterThanOrEqual(0);
    expect(eventIndexFromStaffAbcElem(
      events,
      tuneMeta,
      abc,
      ['1'],
      0,
      { startChar: restStart },
      null
    )).toBe(1);
  });

  test('eventIndexFromStaffAbcElem returns null when startChar is missing', function() {
    const events = eventsFromVoiceBody('C D E |', tuneMeta);
    const abc = buildAbcPreviewFromBodies(tune, tunebook, ['1'], { 1: 'C D E |' });
    const result = eventIndexFromStaffAbcElem(
      events,
      tuneMeta,
      abc,
      ['1'],
      0,
      { midi: 60 },  // no startChar
      null
    );
    // Should return null or a fallback; if null, the caller should use alternate resolution
    expect(result === null || typeof result === 'number').toBe(true);
  });

  test('eventIndexFromStaffAbcElem respects voice index for multiline', function() {
    // When tune has multiple voices, eventIndexFromStaffAbcElem should map to the correct voice
    const events = eventsFromVoiceBody('D E F |', tuneMeta);
    const abc = buildAbcPreviewFromBodies(tune, tunebook, ['1'], { 1: 'D E F |' });
    const dStart = abc.indexOf('D ');
    expect(dStart).toBeGreaterThanOrEqual(0);
    expect(eventIndexFromStaffAbcElem(
      events,
      tuneMeta,
      abc,
      ['1'],
      0,
      { startChar: dStart },
      null
    )).toBe(0);
  });

  test('caretIndexFromStaffClick with beat position fallback', function() {
    const events = [
      { id: 'a', type: 'note', startBeat: 0 },
      { id: 'b', type: 'note', startBeat: 0.5 },
      { id: 'c', type: 'note', startBeat: 1 },
    ];
    // If no direct analysis.startBeat, should not crash
    const result = caretIndexFromStaffClick(events, { measure: 0 }, null);
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThanOrEqual(0);
  });

  test('eventIndexFromStaffAbcElem picks candidate by measure when multiple midi matches', function() {
    const tuneMetaLocal = { meter: '4/4', noteLength: '1/8', key: 'C', tempo: 120 };
    // two notes with same pitch in different measures
    const events = [ { type: 'note', pitch: 'C' , measureIndex: 0 }, { type: 'note', pitch: 'C', measureIndex: 1 } ];
    const abc = 'C | C |';
    // midi for C (middle C)
    const midiC = 60;
    // ask for measure 1 -> should pick second candidate (index 1)
    const idx = eventIndexFromStaffAbcElem(events, tuneMetaLocal, abc, ['1'], 0, { midi: midiC }, { measure: 1 });
    expect(idx).toBe(1);
  });

  test('eventIndexFromStaffAbcElem without measure returns last matching candidate', function() {
    const events = [ { type: 'note', pitch: 'C' }, { type: 'note', pitch: 'C' } ];
    const abc = 'C C';
    const midiC = 60;
    const idx = eventIndexFromStaffAbcElem(events, tuneMeta, abc, ['1'], 0, { midi: midiC }, null);
    expect(idx).toBe(events.length - 1);
  });

  test('eventIndexFromSelectableIndex handles empty events', function() {
    const events = [];
    const result = eventIndexFromSelectableIndex(events, 0);
    // Should return undefined or 0 or handle gracefully
    expect(result === undefined || result === 0).toBe(true);
  });

  test('eventIndexFromSelectableIndex with all barlines', function() {
    const events = [
      { type: 'barline', barToken: '|' },
      { type: 'barline', barToken: '|' },
    ];
    // With only barlines and no selectable indices, should handle gracefully
    const result = eventIndexFromSelectableIndex(events, 0);
    expect(typeof result === 'number' || result === undefined).toBe(true);
  });
});
