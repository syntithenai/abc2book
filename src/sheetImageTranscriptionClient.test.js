import {
  handleSheetImageStreamEvent,
  normalizeSheetImageTranscription,
} from './sheetImageTranscriptionClient';

describe('sheetImageTranscriptionClient', function() {
  test('normalizeSheetImageTranscription accepts chord sheet text', function() {
    const body = normalizeSheetImageTranscription({
      title: 'Grace',
      chordSheet: { text: 'C G\nHello' },
      melody: null,
      warnings: [],
    });
    expect(body.chordSheet.text).toBe('C G\nHello');
    expect(body.title).toBe('Grace');
  });

  test('normalizeSheetImageTranscription rejects empty detection with staff hint', function() {
    expect(function() {
      normalizeSheetImageTranscription({
        chordSheet: { text: '' },
        melody: null,
        staffDetection: { hasStaff: true },
        warnings: ['omr_failed', 'No noteheads found'],
      });
    }).toThrow(/melody recognition failed/i);
  });

  test('handleSheetImageStreamEvent maps error events', function() {
    expect(function() {
      handleSheetImageStreamEvent({ type: 'error', message: 'boom' });
    }).toThrow('boom');
  });

  test('handleSheetImageStreamEvent returns normalized result', function() {
    const parsed = handleSheetImageStreamEvent({
      type: 'result',
      body: {
        title: 'Song',
        chordSheet: { text: 'Am F' },
        melody: null,
      },
    });
    expect(parsed.chordSheet.text).toBe('Am F');
  });
});
