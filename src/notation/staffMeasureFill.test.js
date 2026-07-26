import { createInitialSession } from './notationSession';
import { materializeStaffVoice, stripFillerRests } from './staffMeasureFill';
import { serializeVoiceEvents } from './abcVoiceSerializer';

describe('staffMeasureFill', function() {
  const tuneMeta = { meter: '4/4', noteLength: '1/8', key: 'C', tempo: 120 };

  test('materializeStaffVoice fills gaps with filler rests', function() {
    const session = createInitialSession(tuneMeta, 'C D |');
    const mat = materializeStaffVoice(session.events, tuneMeta);
    expect(mat.some(function(ev) { return ev.fillerRest; })).toBe(true);
  });

  test('serialize strips filler rests from sparse tune', function() {
    const session = createInitialSession(tuneMeta, 'C D |');
    const exported = serializeVoiceEvents(session.events, tuneMeta);
    expect(exported).toMatch(/C/);
    expect(exported).toMatch(/D/);
    expect(exported).not.toMatch(/z2/);
  });

  test('stripFillerRests removes filler flagged rests', function() {
    const session = createInitialSession(tuneMeta, 'C D |');
    const mat = materializeStaffVoice(session.events, tuneMeta);
    const stripped = stripFillerRests(mat);
    expect(stripped.every(function(ev) { return !ev.fillerRest; })).toBe(true);
    expect(stripped.length).toBeLessThan(mat.length);
  });
});
