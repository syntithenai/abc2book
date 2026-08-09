import {
  applyPersonalFieldPolicy,
  applyPerformanceSetPersonalFieldPolicy,
  applyPlaylistPersonalFieldPolicy,
  defaultPersonalTuneFieldValues,
  preserveLocalPersonalFields,
  preserveLocalPlaylistPersonalFields,
  preserveLocalSetItemsPersonalFields,
  stripIncomingPersonalFields,
  stripIncomingPlaylistPersonalFields,
} from './shareImportPersonalFields';

describe('shareImportPersonalFields', function() {
  test('stripIncomingPersonalFields resets personal fields but keeps shared metadata', function() {
    const incoming = {
      name: 'Shared Tune',
      difficulty: 8,
      transpose: 2,
      tuning: 'DADGAD',
      tags: ['jig'],
      boost: 12,
      starred: true,
      viewMode: 'notation,lyrics',
      playbackTempo: 0.75,
      playbackPitch: -3,
      capo: 2,
      tablature: 'guitar',
    };
    stripIncomingPersonalFields(incoming);
    expect(incoming.name).toBe('Shared Tune');
    expect(incoming.difficulty).toBe(8);
    expect(incoming.transpose).toBe(2);
    expect(incoming.tuning).toBe('DADGAD');
    expect(incoming.tags).toEqual(['jig']);
    expect(incoming.boost).toBe(0);
    expect(incoming.starred).toBe(false);
    expect(incoming.viewMode).toBeUndefined();
    expect(incoming.playbackTempo).toBe(1);
    expect(incoming.playbackPitch).toBe(0);
    expect(incoming.capo).toBe(0);
    expect(incoming.tablature).toBeUndefined();
  });

  test('preserveLocalPersonalFields keeps local personal values on update', function() {
    const incoming = {
      name: 'Updated title',
      boost: 10,
      viewMode: 'music',
      playbackTempo: 0.5,
      difficulty: 4,
    };
    const local = {
      boost: 5,
      viewMode: 'notation',
      playbackTempo: 1.25,
      starred: true,
    };
    preserveLocalPersonalFields(incoming, local);
    expect(incoming.name).toBe('Updated title');
    expect(incoming.difficulty).toBe(4);
    expect(incoming.boost).toBe(5);
    expect(incoming.viewMode).toBe('notation');
    expect(incoming.playbackTempo).toBe(1.25);
    expect(incoming.starred).toBe(true);
  });

  test('applyPersonalFieldPolicy full leaves incoming unchanged', function() {
    const incoming = { boost: 9, viewMode: 'music' };
    const local = { boost: 2 };
    applyPersonalFieldPolicy(incoming, local, 'full');
    expect(incoming.boost).toBe(9);
    expect(incoming.viewMode).toBe('music');
  });

  test('applyPersonalFieldPolicy preserveLocal strips inserts', function() {
    const incoming = { boost: 9, viewMode: 'music', name: 'New' };
    applyPersonalFieldPolicy(incoming, null, 'preserveLocal');
    expect(incoming.boost).toBe(0);
    expect(incoming.viewMode).toBeUndefined();
    expect(incoming.name).toBe('New');
  });

  test('stripIncomingPlaylistPersonalFields resets playback flags', function() {
    const playlist = {
      name: 'Gig',
      items: [{ tuneId: 't1' }],
      followTune: true,
      loop: true,
      shuffle: true,
      autoAdvance: false,
    };
    stripIncomingPlaylistPersonalFields(playlist);
    expect(playlist.name).toBe('Gig');
    expect(playlist.followTune).toBe(false);
    expect(playlist.loop).toBe(false);
    expect(playlist.shuffle).toBe(false);
    expect(playlist.autoAdvance).toBe(true);
  });

  test('preserveLocalPlaylistPersonalFields keeps local playback flags', function() {
    const incoming = {
      name: 'Updated',
      followTune: true,
      shuffle: true,
    };
    const local = {
      followTune: false,
      loop: true,
      shuffle: false,
      autoAdvance: false,
    };
    preserveLocalPlaylistPersonalFields(incoming, local);
    expect(incoming.name).toBe('Updated');
    expect(incoming.followTune).toBe(false);
    expect(incoming.loop).toBe(true);
    expect(incoming.shuffle).toBe(false);
    expect(incoming.autoAdvance).toBe(false);
  });

  test('preserveLocalSetItemsPersonalFields keeps local viewMode per tune', function() {
    const merged = [
      { type: 'tune', tuneId: 't1', viewMode: 'music' },
      { type: 'tune', tuneId: 't2', viewMode: 'notation' },
    ];
    const local = [
      { type: 'tune', tuneId: 't1', viewMode: 'notation,lyrics' },
      { type: 'tune', tuneId: 't2' },
    ];
    const next = preserveLocalSetItemsPersonalFields(merged, local);
    expect(next[0].viewMode).toBe('notation,lyrics');
    expect(next[1].viewMode).toBeUndefined();
  });

  test('applyPerformanceSetPersonalFieldPolicy strips viewMode on insert', function() {
    const incoming = {
      name: 'Set',
      items: [{ type: 'tune', tuneId: 't1', viewMode: 'music' }],
    };
    const next = applyPerformanceSetPersonalFieldPolicy(incoming, null, 'preserveLocal');
    expect(next.items[0].viewMode).toBeUndefined();
  });

  test('defaultPersonalTuneFieldValues matches expected insert defaults', function() {
    expect(defaultPersonalTuneFieldValues()).toMatchObject({
      boost: 0,
      playbackTempo: 1,
      playbackPitch: 0,
      capo: 0,
      repeats: 1,
      activeFile: '',
    });
  });
});
