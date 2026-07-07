import {
  applyPlaylistTuneId,
  buildGigRoute,
  findPlaylistIndexByTuneId,
  getPlaylistTuneIdAtIndex,
  isGigPlaylistActive,
} from './gigRouteUtils';

describe('gigRouteUtils', function() {
  const playlist = {
    setId: 'set-1',
    tunes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    currentIndex: 0,
  };

  test('buildGigRoute encodes set and tune ids', function() {
    expect(buildGigRoute('set 1', 'tune/2')).toBe('/gig/set%201/tune%2F2');
    expect(buildGigRoute('set-1')).toBe('/gig/set-1');
  });

  test('findPlaylistIndexByTuneId resolves tune position', function() {
    expect(findPlaylistIndexByTuneId(playlist, 'b')).toBe(1);
    expect(findPlaylistIndexByTuneId(playlist, 'missing')).toBe(0);
  });

  test('getPlaylistTuneIdAtIndex returns tune id', function() {
    expect(getPlaylistTuneIdAtIndex(playlist, 2)).toBe('c');
    expect(getPlaylistTuneIdAtIndex(playlist, 99)).toBeNull();
  });

  test('applyPlaylistTuneId updates currentIndex', function() {
    const next = applyPlaylistTuneId(playlist, 'c');
    expect(next.currentIndex).toBe(2);
  });

  test('isGigPlaylistActive requires tunes', function() {
    expect(isGigPlaylistActive(playlist)).toBe(true);
    expect(isGigPlaylistActive({ tunes: [] })).toBe(false);
    expect(isGigPlaylistActive(null)).toBe(false);
  });
});
