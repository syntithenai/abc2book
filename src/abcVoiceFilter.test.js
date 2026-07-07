import { buildPlayableTuneAbc, filterTuneVoices } from './abcVoiceFilter';
import { setVoiceViewSettings } from './abcVoiceViewSettings';

describe('abcVoiceFilter', function() {
  beforeEach(function() {
    localStorage.clear();
  });

  const tunebook = {
    abcTools: {
      json2abc: function(tune) {
        const voices = tune.voices || {};
        const keys = Object.keys(voices).sort();
        return keys.map(function(key) {
          return 'V:' + key + '\n' + (voices[key].notes || []).join('\n');
        }).join('\n');
      },
    },
  };

  const tune = {
    id: 't1',
    voices: {
      '1': { notes: ['C D E'] },
      '2': { notes: ['F G A'] },
    },
  };

  test('buildPlayableTuneAbc omits voices disabled for playback', function() {
    setVoiceViewSettings('t1', {
      visible: { '1': true, '2': true },
      playable: { '1': true, '2': false },
    }, ['1', '2']);

    const abc = buildPlayableTuneAbc(tune, tunebook);
    expect(abc).toContain('V:1');
    expect(abc).not.toContain('V:2');
    expect(abc).not.toContain('F G A');
  });

  test('filterTuneVoices renumbers kept voices for abcjs', function() {
    const filtered = filterTuneVoices(tune, ['2']);
    expect(Object.keys(filtered.voices)).toEqual(['1']);
    expect(filtered.voices['1'].notes).toEqual(['F G A']);
  });
});
