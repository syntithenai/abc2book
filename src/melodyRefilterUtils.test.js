import {
  applyMelodyNoteSettingsToDraft,
  quantizeMelodyTime,
  refilterMelodyNotes,
} from './melodyRefilterUtils';

describe('melodyRefilterUtils', function() {
  const sourceNotes = [
    { start: 0, end: 0.2, midi: 60, confidence: 0.8 },
    { start: 0.25, end: 0.35, midi: 62, confidence: 0.4 },
    { start: 0.5, end: 0.9, midi: 64, confidence: 0.7 },
  ];
  const beatTimes = [0, 0.5, 1];

  test('filters notes by confidence and minimum length', function() {
    const filtered = refilterMelodyNotes(sourceNotes, {
      noiseMode: 'balanced',
      confidenceThreshold: 0.55,
      minNoteSeconds: 0.12,
      quantizeStrength: 0,
    }, beatTimes);
    expect(filtered).toHaveLength(2);
    expect(filtered[0].midi).toBe(60);
    expect(filtered[1].midi).toBe(64);
  });

  test('quantizes note times toward beat grid', function() {
    const filtered = refilterMelodyNotes([{
      start: 0.12,
      end: 0.88,
      midi: 60,
      confidence: 0.9,
    }], {
      noiseMode: 'balanced',
      confidenceThreshold: 0.55,
      minNoteSeconds: 0.1,
      quantizeStrength: 1,
    }, beatTimes);
    expect(filtered[0].start).toBeCloseTo(0.125, 3);
    expect(filtered[0].end).toBeCloseTo(0.875, 3);
  });

  test('quantizeMelodyTime blends between detected time and nearest subdivision', function() {
    expect(quantizeMelodyTime(0.12, beatTimes, 1, 4)).toBeCloseTo(0.125, 3);
  });

  test('applyMelodyNoteSettingsToDraft rebuilds melody text', function() {
    const draft = {
      melodySourceNotes: sourceNotes,
      timedMelody: { beatTimes: beatTimes, beatsPerBar: 4 },
      metadata: { noteLength: '1/8' },
    };
    const tunebook = {
      abcTools: {
        justNotes: function(text) { return text.split('\n').slice(4).join('\n'); },
      },
    };
    const patch = applyMelodyNoteSettingsToDraft(draft, {
      noiseMode: 'sparse',
      confidenceThreshold: 0.7,
      minNoteSeconds: 0.12,
      quantizeStrength: 0,
    }, tunebook);
    expect(patch.melodyNotesEdited).toBe(false);
    expect(patch.melodyNoteSettings.confidenceThreshold).toBe(0.7);
    expect(patch.melodyNotesText).toBeTruthy();
  });
});
