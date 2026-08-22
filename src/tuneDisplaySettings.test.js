import {
  applyTuneDisplaySettings,
  extractAndStoreTuneDisplaySettings,
  getTuneDisplaySettings,
  migrateTuneDisplaySettingsFromTune,
  persistableTuneWithoutDisplaySettings,
  setTuneDisplaySettings,
  stripTuneDisplaySettings,
} from './tuneDisplaySettings';

describe('tuneDisplaySettings', function() {
  beforeEach(function() {
    localStorage.clear();
  });

  test('persists and reads per-tune display settings', function() {
    setTuneDisplaySettings('t1', {
      viewMode: 'notation,lyrics',
      zoom: 1.4,
      notationFit: 'vertical',
      activeVoices: ['1'],
    });
    expect(getTuneDisplaySettings('t1')).toEqual({
      viewMode: 'notation,lyrics',
      zoom: 1.4,
      notationFit: 'vertical',
      activeVoices: ['1'],
    });
  });

  test('migrate copies from tune only when local is empty', function() {
    const tune = {
      id: 't2',
      viewMode: 'chords',
      zoom: 1.1,
      tablature: 'guitar',
    };
    migrateTuneDisplaySettingsFromTune(tune);
    expect(getTuneDisplaySettings('t2').viewMode).toBe('chords');
    expect(getTuneDisplaySettings('t2').tablature).toBe('guitar');

    tune.viewMode = 'notation';
    migrateTuneDisplaySettingsFromTune(tune);
    expect(getTuneDisplaySettings('t2').viewMode).toBe('chords');
  });

  test('extractAndStore overwrites local when saving from tune', function() {
    setTuneDisplaySettings('t3', { viewMode: 'lyrics' });
    extractAndStoreTuneDisplaySettings({
      id: 't3',
      viewMode: 'notation',
      zoom: 1.2,
    });
    expect(getTuneDisplaySettings('t3')).toEqual({
      viewMode: 'notation',
      zoom: 1.2,
    });
  });

  test('persistableTuneWithoutDisplaySettings strips keys and migrates once', function() {
    const tune = {
      id: 't4',
      name: 'Song',
      viewMode: 'structure',
      zoom: 1.5,
      notationFit: 'horizontal',
      tablature: 'banjo',
      activeVoices: ['1', '2'],
      key: 'G',
    };
    const persisted = persistableTuneWithoutDisplaySettings(tune);
    expect(persisted.viewMode).toBeUndefined();
    expect(persisted.zoom).toBeUndefined();
    expect(persisted.tablature).toBeUndefined();
    expect(persisted.activeVoices).toBeUndefined();
    expect(persisted.name).toBe('Song');
    expect(persisted.key).toBe('G');
    // Original left intact for UI
    expect(tune.viewMode).toBe('structure');
    expect(getTuneDisplaySettings('t4').viewMode).toBe('structure');
  });

  test('apply overlays local settings onto tune', function() {
    setTuneDisplaySettings('t5', {
      viewMode: 'chords,lyrics',
      tablature: 'guitar',
      tabDisplay: 'tab',
    });
    const tune = { id: 't5', name: 'X', key: 'C' };
    applyTuneDisplaySettings(tune);
    expect(tune.viewMode).toBe('chords,lyrics');
    expect(tune.tablature).toBe('guitar');
    expect(tune.tabDisplay).toBe('tab');
  });

  test('strip removes display keys in place', function() {
    const tune = { id: 't6', viewMode: 'info', zoom: 1.2, name: 'Y' };
    stripTuneDisplaySettings(tune);
    expect(tune.viewMode).toBeUndefined();
    expect(tune.zoom).toBeUndefined();
    expect(tune.name).toBe('Y');
  });
});
