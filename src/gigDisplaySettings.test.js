import {
  clampGigZoom,
  getTuneGigZoom,
  getGigNightMode,
  setGigNightMode,
  toggleGigNightMode,
} from './gigDisplaySettings';

describe('gigDisplaySettings tune fields', function() {
  beforeEach(function() {
    localStorage.clear();
  });

  test('clampGigZoom enforces bounds', function() {
    expect(clampGigZoom(0.5)).toBe(0.8);
    expect(clampGigZoom(3)).toBe(2.5);
    expect(clampGigZoom(1.4)).toBe(1.4);
  });

  test('getTuneGigZoom prefers tune zoom over global default', function() {
    expect(getTuneGigZoom({ zoom: 1.5 })).toBe(1.5);
    expect(getTuneGigZoom({})).toBe(1.2);
  });

  test('gig night mode persists in localStorage', function() {
    expect(getGigNightMode()).toBe(false);
    expect(setGigNightMode(true)).toBe(true);
    expect(getGigNightMode()).toBe(true);
    expect(toggleGigNightMode()).toBe(false);
    expect(getGigNightMode()).toBe(false);
  });
});

describe('gig tune settings abc persistence', function() {
  test('round-trips zoom and lyrics scroll speed', function() {
    const useAbcTools = require('./useAbcTools').default;
    const abcTools = useAbcTools();
    const tune = {
      id: 'gig-settings-tune',
      name: 'Gig Settings Tune',
      key: 'C',
      zoom: 1.3,
      transpose: -2,
      lyricsScrollSpeed: 1.44,
      voices: { V: { notes: ['C2'] } },
    };
    const abc = abcTools.json2abc(tune);
    expect(abc).toContain('% abcbook-zoom 1.3');
    expect(abc).toContain('% abcbook-transpose -2');
    expect(abc).toContain('% abcbook-lyrics-scroll-speed 1.44');
    const parsed = abcTools.abc2json(abc);
    expect(parsed.zoom).toBeCloseTo(1.3);
    expect(parsed.transpose).toBe('-2');
    expect(parsed.lyricsScrollSpeed).toBeCloseTo(1.44);
  });

  test('round-trips view mode for cloud sync', function() {
    const useAbcTools = require('./useAbcTools').default;
    const abcTools = useAbcTools();
    const tune = {
      id: 'view-mode-tune',
      name: 'View Mode Tune',
      key: 'C',
      viewMode: 'notation,lyrics,chordsBlock',
      voices: { V: { notes: ['C2'] } },
    };
    const abc = abcTools.json2abc(tune);
    expect(abc).toContain('% abcbook-view-mode notation,lyrics,chordsBlock');
    const parsed = abcTools.abc2json(abc);
    expect(parsed.viewMode).toBe('notation,lyrics,chordsBlock');
  });
});
