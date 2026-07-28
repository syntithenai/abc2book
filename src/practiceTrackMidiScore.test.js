import {
  buildPracticeTrackExportAbc,
  buildPracticeTrackMidiScore,
  injectVoiceMidiPrograms,
} from './practiceTrackMidiScore';
import { isMidiHeader } from './midiFileUtils';

describe('practiceTrackMidiScore', function() {
  const sampleTune = {
    name: 'Test reel',
    tempo: 120,
    meter: '4/4',
    key: 'D',
    noteLength: '1/8',
    voices: {
      '1': {
        meta: 'Fiddle clef=treble',
        notes: ['%%MIDI program 40', 'D2 E2 F2 G2 |'],
      },
    },
  };

  const tunebook = {
    getExportAbc: function(tune) {
      return [
        'X:1',
        'M:4/4',
        'L:1/8',
        'Q:1/4=120',
        'K:D',
        'V:1',
        tune.voices['1'].notes.join('\n'),
      ].join('\n');
    },
  };

  test('injectVoiceMidiPrograms keeps MIDI program lines', function() {
    const enriched = injectVoiceMidiPrograms(sampleTune);
    expect(enriched.voices['1'].notes[0]).toMatch(/%%MIDI program 40/);
  });

  test('buildPracticeTrackMidiScore returns valid MIDI bytes', function() {
    const plan = {
      timing: {
        tempoBpm: 120,
        totalDurationSec: 4,
        barBoundariesSec: [0, 2, 4],
      },
      structure: [{
        strainLabel: 'A',
        startBar: 0,
        endBar: 1,
        startTimeSec: 0,
        endTimeSec: 4,
      }],
    };
    const score = buildPracticeTrackMidiScore(sampleTune, tunebook, plan);
    expect(score.midiBytes).toBeTruthy();
    expect(isMidiHeader(score.midiBytes)).toBe(true);
    expect(score.meta.tempoBpm).toBe(120);
    expect(score.meta.strains.length).toBe(1);
  });

  test('buildPracticeTrackExportAbc uses tunebook export path', function() {
    const abc = buildPracticeTrackExportAbc(sampleTune, tunebook);
    expect(abc).toMatch(/K:D/);
    expect(abc).toMatch(/%%MIDI program 40/);
  });
});
