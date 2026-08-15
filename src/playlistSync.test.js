import {
  parsePlaylistsFromAbc,
  renderPlaylistsToAbc,
  comparePlaylists,
  buildMergedPlaylists,
  createPlaylistTombstone,
  stripPlaylistLines,
} from './playlistSync';

describe('playlistSync', function() {
  test('render and parse playlists round trip', function() {
    const playlists = {
      'pl-1': {
        name: 'Friday queue',
        items: [{ tuneId: 'tune-a', linkIndex: 0, prefer: 'media' }],
        followTune: true,
        loop: false,
        autoAdvance: true,
        updatedAt: 5000,
      },
    };
    const deleted = {
      'pl-old': createPlaylistTombstone('pl-old', 'Old playlist', 4000),
    };
    const abc = renderPlaylistsToAbc(playlists, deleted);
    const parsed = parsePlaylistsFromAbc(abc);

    expect(parsed.playlists['pl-1'].name).toBe('Friday queue');
    expect(parsed.playlists['pl-1'].updatedAt).toBe(5000);
    expect(parsed.playlists['pl-1'].items).toEqual([{ tuneId: 'tune-a', linkIndex: 0, prefer: 'media' }]);
    expect(parsed.deleted['pl-old'].deletedAt).toBe(4000);
  });

  test('stripPlaylistLines removes playlist section from tune book text', function() {
    const abc = 'X:1\nT: Tune\nK:C\n|\n' + renderPlaylistsToAbc({
      'pl-1': { name: 'Queue', items: [], followTune: false, loop: false, autoAdvance: true, updatedAt: 1 },
    }, {});
    const stripped = stripPlaylistLines(abc);
    expect(stripped).toContain('X:1');
    expect(stripped).not.toContain('% abcbook-playlists-begin');
  });

  test('buildMergedPlaylists applies newer remote update', function() {
    const merged = buildMergedPlaylists({
      localPlaylists: {
        'pl-1': { id: 'pl-1', name: 'Old', updatedAt: 100, items: [] },
      },
      localDeleted: {},
      remotePlaylists: {
        'pl-1': { id: 'pl-1', name: 'New', updatedAt: 500, items: [{ tuneId: 't1' }] },
      },
      remoteDeleted: {},
    });

    expect(merged.changed).toBe(true);
    expect(merged.storagePlaylists['pl-1'].name).toBe('New');
    expect(merged.changedNames).toEqual(['New']);
  });

  test('remote delete removes local playlist on compare', function() {
    const localPlaylists = {
      'pl-1': { id: 'pl-1', name: 'Local playlist', updatedAt: 100, items: [] },
    };
    const remoteDeleted = {
      'pl-1': createPlaylistTombstone('pl-1', 'Local playlist', 500),
    };
    const result = comparePlaylists({
      localPlaylists: localPlaylists,
      localDeleted: {},
      remotePlaylists: {},
      remoteDeleted: remoteDeleted,
    });
    expect(Object.keys(result.deletes)).toEqual(['pl-1']);
  });

  test('own-upload echo with stale local updatedAt is not an incoming update', function() {
    const result = comparePlaylists({
      localPlaylists: {
        'pl-1': { id: 'pl-1', name: 'Old', updatedAt: 100, items: [] },
      },
      localDeleted: {},
      remotePlaylists: {
        'pl-1': { id: 'pl-1', name: 'New', updatedAt: 500, items: [] },
      },
      remoteDeleted: {},
      lastUpdatedById: { 'pl-1': 500 },
    });
    expect(Object.keys(result.updates)).toEqual([]);
    expect(Object.keys(result.inserts)).toEqual([]);
  });

  test('newer other-device playlist update still flags as incoming', function() {
    const result = comparePlaylists({
      localPlaylists: {
        'pl-1': { id: 'pl-1', name: 'Mine', updatedAt: 500, items: [] },
      },
      localDeleted: {},
      remotePlaylists: {
        'pl-1': { id: 'pl-1', name: 'Theirs', updatedAt: 900, items: [] },
      },
      remoteDeleted: {},
      lastUpdatedById: { 'pl-1': 500 },
    });
    expect(Object.keys(result.updates)).toEqual(['pl-1']);
  });
});
