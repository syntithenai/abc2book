/**
 * @jest-environment jsdom
 */
import abcjs from 'abcjs';
import { buildCleanupScorePreviewAbc } from './midiCleanupNotationPreview';

function countBars(abc) {
  const host = document.createElement('div');
  abcjs.renderAbc(host, abc, {
    add_classes: true,
    wrap: {
      minSpacing: 1.6,
      maxSpacing: 2.8,
      preferredMeasuresPerLine: 4,
      lastLineLimit: 2,
    },
  });
  return host.querySelectorAll('g.abcjs-bar').length;
}

describe('midiCleanupNotationPreview abcjs barlines', function() {
  test('import preview ABC renders measure barlines in abcjs', function() {
    const notes = [];
    for (let bar = 0; bar < 4; bar += 1) {
      for (let beat = 0; beat < 4; beat += 1) {
        notes.push({
          start: bar * 2 + beat * 0.5,
          end: bar * 2 + beat * 0.5 + 0.45,
          midi: 60 + beat,
        });
      }
    }
    const abc = buildCleanupScorePreviewAbc([
      { id: 1, notes: notes, isDrum: false, program: 0 },
    ], { tempoBpm: 120, meter: '4/4', key: 'C', slotsPerBeat: 2 });

    expect(abc.trim()).toMatch(/\|\s*$/m);
    expect(countBars(abc)).toBeGreaterThanOrEqual(4);
  });
});
