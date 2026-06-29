import { handleAnalysisStreamEvent } from './mediaAnalysisClient';

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
