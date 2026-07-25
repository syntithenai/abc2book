import {
  playbackStartBeat,
  playbackStartMs,
  ensureNotationMidiRoute,
  seekNotationPlaybackToBeat,
  resolvePlaybackSession,
  resolvePlaybackSessionWithSelection,
  resolvePlaybackSelectionBounds,
  startNotationPlayback,
  stopNotationPlayback,
  rewindNotationPlayback,
} from './notationPlayback';

describe('playbackStartBeat', function() {
  test('uses selected note startBeat', function() {
    const session = {
      caretIndex: 0,
      selection: { eventIds: ['b'] },
      events: [
        { id: 'a', type: 'note', startBeat: 0 },
        { id: 'b', type: 'note', startBeat: 2 },
      ],
    };
    expect(playbackStartBeat(session)).toBe(2);
  });

  test('falls back to caret note', function() {
    const session = {
      caretIndex: 1,
      selection: { eventIds: [] },
      events: [
        { id: 'a', type: 'note', startBeat: 0 },
        { id: 'b', type: 'note', startBeat: 2 },
      ],
    };
    expect(playbackStartBeat(session)).toBe(2);
  });

  test('returns 0 when no pitched events', function() {
    expect(playbackStartBeat({ caretIndex: 0, selection: {}, events: [] })).toBe(0);
  });

  test('skips non-note selection entries to find first note', function() {
    const session = {
      caretIndex: 0,
      selection: { eventIds: ['bar', 'b'], anchorId: 'bar' },
      events: [
        { id: 'bar', type: 'barline', startBeat: 4 },
        { id: 'b', type: 'note', startBeat: 4 },
        { id: 'c', type: 'note', startBeat: 5 },
      ],
    };
    expect(playbackStartBeat(session)).toBe(4);
  });
});

describe('resolvePlaybackSession', function() {
  test('maps ABC textarea cursor to event caret index', function() {
    const session = {
      caretIndex: 0,
      selection: { eventIds: [] },
      events: [
        { id: 'a', type: 'note', startBeat: 0 },
        { id: 'b', type: 'note', startBeat: 2 },
      ],
    };
    const resolved = resolvePlaybackSession(session, {
      view: 'abc',
      getAbcCaretIndex: function() {
        return { caretIndex: 1, events: session.events };
      },
    });
    expect(playbackStartBeat(resolved)).toBe(2);
  });
});

describe('resolvePlaybackSessionWithSelection', function() {
  test('falls back to last note selection when session selection is empty', function() {
    const session = {
      caretIndex: 2,
      selection: { eventIds: [] },
      events: [
        { id: 'a', type: 'note', startBeat: 0 },
        { id: 'b', type: 'note', startBeat: 2 },
      ],
    };
    const resolved = resolvePlaybackSessionWithSelection(session, {
      eventIds: ['b'],
      anchorId: 'b',
    });
    expect(playbackStartBeat(resolved)).toBe(2);
  });

  test('merges startMs when session ids match last selection', function() {
    const session = {
      selection: { eventIds: ['b'], anchorId: 'b' },
      events: [{ id: 'b', type: 'note', startBeat: 2 }],
    };
    const resolved = resolvePlaybackSessionWithSelection(session, {
      eventIds: ['b'],
      anchorId: 'b',
      startMs: 1500,
      startBeat: 2,
    });
    expect(resolved.selection.startMs).toBe(1500);
  });
});

describe('resolvePlaybackSelectionBounds', function() {
  test('uses earliest and latest selected notes for span', function() {
    const session = {
      selection: { eventIds: ['c', 'a'], anchorId: 'a' },
      events: [
        { id: 'a', type: 'note', startBeat: 0, durationBeats: 1 },
        { id: 'b', type: 'note', startBeat: 1, durationBeats: 1 },
        { id: 'c', type: 'note', startBeat: 2, durationBeats: 2 },
      ],
    };
    const bounds = resolvePlaybackSelectionBounds(session);
    expect(bounds.startBeat).toBe(0);
    expect(bounds.endBeat).toBe(4);
  });

  test('single note end is start plus duration', function() {
    const session = {
      selection: { eventIds: ['a'] },
      events: [{ id: 'a', type: 'note', startBeat: 2, durationBeats: 1.5 }],
    };
    const bounds = resolvePlaybackSelectionBounds(session);
    expect(bounds.startBeat).toBe(2);
    expect(bounds.endBeat).toBe(3.5);
  });

  test('no selection plays from beginning through tune end', function() {
    const bounds = resolvePlaybackSelectionBounds({
      caretIndex: 0,
      selection: { eventIds: [] },
      events: [{ id: 'a', type: 'note', startBeat: 0, durationBeats: 1 }],
    });
    expect(bounds.startBeat).toBe(0);
    expect(bounds.endBeat).toBeNull();
  });
});

describe('playbackStartMs', function() {
  test('returns abcjs ms from selection when present', function() {
    const session = {
      selection: { eventIds: ['a'], startMs: 2500 },
      events: [],
    };
    expect(playbackStartMs(session)).toBe(2500);
  });
});

describe('startNotationPlayback', function() {
  test('stops then starts from selection via startNotationMidiPlayback', function() {
    const calls = [];
    const stops = [];
    const mc = {
      isPlaying: false,
      stopNotationMidiPlayback: function(opts) { stops.push(opts); },
      startNotationMidiPlayback: function(opts) { calls.push(opts); },
    };
    const session = {
      caretIndex: 1,
      selection: { eventIds: ['b'], startMs: 1500 },
      events: [
        { id: 'b', type: 'note', startBeat: 2, durationBeats: 1 },
      ],
    };
    startNotationPlayback(mc, { id: 't1' }, {}, session, 120, null);
    expect(stops.length).toBe(1);
    expect(calls.length).toBe(1);
    expect(calls[0].startBeat).toBe(2);
    expect(calls[0].endBeat).toBe(3);
    expect(calls[0].startMs).toBe(1500);
    expect(calls[0].alwaysFromSelection).toBe(true);
  });
});

describe('stopNotationPlayback', function() {
  test('delegates to stopNotationMidiPlayback', function() {
    const stops = [];
    const mc = {
      stopNotationMidiPlayback: function(opts) { stops.push(opts); },
    };
    stopNotationPlayback(mc, { current: {} });
    expect(stops.length).toBe(1);
  });
});

describe('rewindNotationPlayback', function() {
  test('seeks to selection without starting playback', function() {
    const seeks = [];
    const mc = {
      isPlaying: false,
      setCurrentTime: function(t) { seeks.push(['time', t]); },
      setClickSeek: function(r) { seeks.push(['clickSeek', r]); },
      getPlaybackProgress: function() { return { duration: 8, currentTime: 0 }; },
      seek: function(r) { seeks.push(['ratio', r]); },
      setMediaLinkNumber: function() {},
      isMidiPlaybackRoute: function() { return false; },
      setPlayCancelled: function() {},
    };
    const session = {
      selection: { eventIds: ['b'], startMs: 2000 },
      events: [{ id: 'b', type: 'note', startBeat: 4 }],
    };
    rewindNotationPlayback(mc, { id: 't1' }, {}, session, 120, null);
    expect(seeks[0]).toEqual(['time', 2]);
    expect(seeks[1]).toEqual(['clickSeek', 0.25]);
  });
});

describe('ensureNotationMidiRoute', function() {
  test('uses setMediaLinkNumber so scaffold tunes still get midi route', function() {
    const calls = [];
    const mc = {
      tune: { id: 't1' },
      isMidiPlaybackRoute: function() { return false; },
      setTune: function(t) { calls.push(['setTune', t.id]); },
      setMediaLinkNumber: function(n) { calls.push(['setMediaLinkNumber', n]); },
      applyPlaybackRoute: function(state, link, tune) {
        calls.push(['applyPlaybackRoute', state, link, tune.id]);
      },
    };
    ensureNotationMidiRoute(mc, { id: 't1' }, {});
    expect(calls).toEqual([['setMediaLinkNumber', null]]);
  });
});

describe('seekNotationPlaybackToBeat', function() {
  test('seeks via ratio when duration known', function() {
    const seeks = [];
    const mc = {
      setCurrentTime: function(t) { seeks.push(['time', t]); },
      setClickSeek: function(r) { seeks.push(['clickSeek', r]); },
      getPlaybackProgress: function() { return { duration: 8, currentTime: 0 }; },
      seek: function(r) { seeks.push(['ratio', r]); },
    };
    seekNotationPlaybackToBeat(mc, 4, 120);
    expect(seeks[0]).toEqual(['time', 2]);
    expect(seeks[1]).toEqual(['clickSeek', 0.25]);
    expect(seeks[2]).toEqual(['ratio', 0.25]);
  });

  test('prefers startMs over beat', function() {
    const seeks = [];
    const mc = {
      setCurrentTime: function(t) { seeks.push(t); },
      setClickSeek: function() {},
      getPlaybackProgress: function() { return { duration: 10 }; },
      seek: function() {},
    };
    seekNotationPlaybackToBeat(mc, 4, 120, 3000);
    expect(seeks[0]).toBe(3);
  });
});
