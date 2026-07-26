import { createInitialSession } from './notationSession';
import { changeSelectedDuration, deleteSelectionToRest, removeSelection } from './notationActions';
import {
  longestRestChain,
  splitRestToDuration,
  removeBeatRangeAndRefillLongestRests,
} from './staffRestEdit';
import { durationToBeats, beatsToDuration } from './beatGrid';
import { DURATION_KEY_MULTIPLIERS } from './notationConstants';

describe('staffRestEdit', function() {
  const tuneMeta = { meter: '4/4', noteLength: '1/8', key: 'C', tempo: 120 };

  test('longestRestChain decomposes four beats into largest rests', function() {
    const session = createInitialSession(tuneMeta, 'C |');
    const unit = session.unitLengthDecimal;
    const chain = longestRestChain(4, unit);
    expect(chain.length).toBe(1);
    expect(chain[0].durationBeats).toBeCloseTo(4, 3);
  });

  test('splitRestToDuration splits long rest into shorter chunks', function() {
    const session = createInitialSession(tuneMeta, 'C |');
    const unit = session.unitLengthDecimal;
    const rest = {
      id: 'r1',
      type: 'rest',
      duration: { mult: 4, div: 1 },
      durationBeats: 4,
    };
    const parts = splitRestToDuration(rest, 2, unit);
    expect(parts.length).toBe(2);
    expect(parts[0].durationBeats).toBeCloseTo(2, 3);
    expect(parts[1].durationBeats).toBeCloseTo(2, 3);
  });

  test('removeBeatRangeAndRefillLongestRests preserves span duration', function() {
    let session = createInitialSession(tuneMeta, 'C z4 |');
    const unit = session.unitLengthDecimal;
    const rest = session.events.find(function(ev) { return ev.type === 'rest'; });
    expect(rest).toBeTruthy();
    const next = removeBeatRangeAndRefillLongestRests(session.events, 2, 4, tuneMeta);
    const rests = next.filter(function(ev) { return ev.type === 'rest'; });
    const total = rests.reduce(function(sum, ev) {
      return sum + (ev.durationBeats != null ? ev.durationBeats : durationToBeats(ev.duration, unit));
    }, 0);
    expect(total).toBeCloseTo(4, 3);
  });
});

describe('notationActions rest polish', function() {
  const tuneMeta = { meter: '4/4', noteLength: '1/8', key: 'C', tempo: 120 };

  test('changeSelectedDuration splits selected rest', function() {
    let session = createInitialSession(tuneMeta, 'C |');
    const unit = session.unitLengthDecimal;
    const wholeRest = {
      id: 'rest-whole',
      type: 'rest',
      pitch: null,
      pitches: null,
      duration: beatsToDuration(4, unit),
      durationBeats: 4,
      tieStart: false,
      tieEnd: false,
    };
    const events = session.events.slice();
    events.splice(1, 0, wholeRest);
    session = Object.assign({}, session, { events: events });
    session = Object.assign({}, session, {
      selection: { eventIds: [wholeRest.id], toneIndex: null, anchorId: wholeRest.id },
      durationKey: 5,
    });
    const targetBeats = DURATION_KEY_MULTIPLIERS[5] * unit * 4;
    session = changeSelectedDuration(session, 5, false);
    const rests = session.events.filter(function(ev) { return ev.type === 'rest'; });
    expect(rests.length).toBeGreaterThan(1);
    rests.forEach(function(ev) {
      const beats = durationToBeats(ev.duration, unit);
      expect(beats).toBeCloseTo(targetBeats, 3);
    });
  });

  test('deleteSelectionToRest on rest refills with longest rests', function() {
    let session = createInitialSession(tuneMeta, 'z2 z2 |');
    const unit = session.unitLengthDecimal;
    const rests = session.events.filter(function(ev) { return ev.type === 'rest'; });
    session = Object.assign({}, session, {
      selection: { eventIds: [rests[0].id], toneIndex: null, anchorId: rests[0].id },
    });
    session = deleteSelectionToRest(session, { backward: false });
    const afterRests = session.events.filter(function(ev) { return ev.type === 'rest'; });
    const total = afterRests.reduce(function(sum, ev) {
      return sum + (ev.durationBeats != null ? ev.durationBeats : durationToBeats(ev.duration, unit));
    }, 0);
    expect(total).toBeGreaterThan(0);
  });

  test('removeSelection collapses adjacent rests', function() {
    let session = createInitialSession(tuneMeta, 'z2 z2 |');
    const rests = session.events.filter(function(ev) { return ev.type === 'rest'; });
    session = Object.assign({}, session, {
      selection: { eventIds: [rests[0].id], toneIndex: null, anchorId: rests[0].id },
    });
    session = removeSelection(session);
    const afterRests = session.events.filter(function(ev) { return ev.type === 'rest'; });
    expect(afterRests.length).toBe(1);
  });
});
