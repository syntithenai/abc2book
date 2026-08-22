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
  test('does not export zoom (device-local); still parses legacy ABC for migration', function() {
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
    expect(abc).not.toContain('% abcbook-zoom');
    expect(abc).toContain('% abcbook-transpose -2');
    expect(abc).toContain('% abcbook-lyrics-scroll-speed 1.44');
    const legacyAbc = abc + '% abcbook-zoom 1.3\n';
    const parsed = abcTools.abc2json(legacyAbc);
    expect(parsed.zoom).toBeCloseTo(1.3);
    expect(parsed.transpose).toBe('-2');
    expect(parsed.lyricsScrollSpeed).toBeCloseTo(1.44);
  });

  test('does not export view mode / notation fit; still parses legacy ABC for migration', function() {
    const useAbcTools = require('./useAbcTools').default;
    const abcTools = useAbcTools();
    const tune = {
      id: 'view-mode-tune',
      name: 'View Mode Tune',
      key: 'C',
      viewMode: 'notation,lyrics,structure',
      notationFit: 'vertical',
      voices: { V: { notes: ['C2'] } },
    };
    const abc = abcTools.json2abc(tune);
    expect(abc).not.toContain('% abcbook-view-mode');
    expect(abc).not.toContain('% abcbook-notation-fit');
    const legacyAbc = [
      abc.trim(),
      '% abcbook-view-mode notation,lyrics,structure',
      '% abcbook-notation-fit vertical',
    ].join('\n');
    const parsed = abcTools.abc2json(legacyAbc);
    expect(parsed.viewMode).toBe('notation,lyrics,structure');
    expect(parsed.notationFit).toBe('vertical');
  });
});
