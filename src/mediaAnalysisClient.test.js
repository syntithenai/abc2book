import {
  getDetectedTempoFromAnalysis,
  handleAnalysisStreamEvent,
  tuneHasTempo,
} from './mediaAnalysisClient';

describe('handleAnalysisStreamEvent', function() {
  test('forwards progress updates', function() {
    const updates = [];
    handleAnalysisStreamEvent({
      type: 'progress',
      message: 'Detecting timing...',
      progress: 15,
    }, function(message, progress) {
      updates.push({ message: message, progress: progress });
    });
    expect(updates).toEqual([{ message: 'Detecting timing...', progress: 15 }]);
  });

  test('returns normalized result events', function() {
    const result = handleAnalysisStreamEvent({
      type: 'result',
      body: {
        lyrics: { text: 'hello', segments: [] },
        chords: { segments: [], beatTimes: [] },
        melody: { notes: [] },
        timing: { beatTimes: [], meter: '4/4' },
      },
    });
    expect(result.lyrics.text).toBe('hello');
    expect(result.timing.meter).toBe('4/4');
  });

  test('throws on error events', function() {
    expect(function() {
      handleAnalysisStreamEvent({ type: 'error', message: 'failed' });
    }).toThrow('failed');
  });
});

describe('getDetectedTempoFromAnalysis', function() {
  test('prefers timing tempo and rounds to nearest BPM', function() {
    expect(getDetectedTempoFromAnalysis({
      timing: { tempo: 119.6 },
      chords: { tempo: 90 },
    })).toBe(120);
  });

  test('falls back to chord tempo when timing is missing', function() {
    expect(getDetectedTempoFromAnalysis({
      chords: { tempo: 88.2 },
    })).toBe(88);
  });

  test('returns zero when no tempo is available', function() {
    expect(getDetectedTempoFromAnalysis({ timing: {}, chords: {} })).toBe(0);
  });
});

describe('tuneHasTempo', function() {
  test('accepts numeric and Q-field tempo values', function() {
    expect(tuneHasTempo({ tempo: 120 })).toBe(true);
    expect(tuneHasTempo({ tempo: '1/4=96' })).toBe(true);
  });

  test('rejects missing or invalid tempo', function() {
    expect(tuneHasTempo({})).toBe(false);
    expect(tuneHasTempo({ tempo: 0 })).toBe(false);
    expect(tuneHasTempo({ tempo: '' })).toBe(false);
  });
});
