import {
  triadPitchMidis,
  buildArpeggioMidis,
  resolveChordPitchTarget,
  playChordPitchCue,
} from './chordPitchCue';

describe('chordPitchCue', function() {
  test('triadPitchMidis returns root-position triad MIDIs', function() {
    expect(triadPitchMidis('C')).toEqual([60, 64, 67]);
    expect(triadPitchMidis('Am')).toEqual([69, 72, 76]);
  });

  test('buildArpeggioMidis returns 1-3-5-1 with octave upper root', function() {
    expect(buildArpeggioMidis('C')).toEqual([60, 64, 67, 72]);
    expect(buildArpeggioMidis('')).toEqual([]);
    expect(buildArpeggioMidis('not-a-chord')).toEqual([]);
  });

  test('resolveChordPitchTarget prefers structure selection', function() {
    const root = document.createElement('div');
    root.className = 'structure-chord-block';
    const line = document.createElement('div');
    line.textContent = 'Am G C';
    root.appendChild(line);
    document.body.appendChild(root);

    const textNode = line.firstChild;
    const range = document.createRange();
    range.setStart(textNode, 3);
    range.setEnd(textNode, 5);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    expect(resolveChordPitchTarget({
      chordChart: 'C G Am |',
      structureSelector: '.structure-chord-block',
      lastNotationChord: 'Dm',
    })).toBe('G');

    sel.removeAllRanges();
    document.body.removeChild(root);
  });

  test('resolveChordPitchTarget uses notation click before first chord', function() {
    expect(resolveChordPitchTarget({
      chordChart: 'C G Am |',
      lastNotationChord: 'Am',
    })).toBe('Am');
  });

  test('resolveChordPitchTarget falls back to first chord', function() {
    expect(resolveChordPitchTarget({
      chordChart: 'C G Am |',
      lastNotationChord: '',
    })).toBe('C');
  });

  test('playChordPitchCue schedules arpeggio then block chord', function(done) {
    jest.useFakeTimers();
    const played = [];
    playChordPitchCue('C', {
      playNote: function(midi, dur) {
        played.push({ type: 'note', midi: midi, dur: dur });
      },
      playChord: function(midis, dur) {
        played.push({ type: 'chord', midis: midis.slice(), dur: dur });
      },
    }).then(function(ok) {
      expect(ok).toBe(true);
      expect(played.filter(function(p) { return p.type === 'note'; }).map(function(p) { return p.midi; }))
        .toEqual([60, 64, 67, 72]);
      expect(played.filter(function(p) { return p.type === 'chord'; })[0].midis).toEqual([60, 64, 67, 72]);
      jest.useRealTimers();
      done();
    });

    jest.runAllTimers();
  });
});
