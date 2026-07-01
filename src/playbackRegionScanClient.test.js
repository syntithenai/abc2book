import { handlePlaybackRegionScanStreamEvent, normalizePlaybackRegionScan } from './playbackRegionScanClient';

describe('playbackRegionScanClient', function() {
  test('normalizePlaybackRegionScan parses boundaries', function() {
    const result = normalizePlaybackRegionScan({
      startAt: 12.3,
      endAt: 289.7,
      duration: 320,
      confidence: 0.75,
      method: 'start:gap+end:gap',
      backend: 'gpu',
    });

    expect(result.startAt).toBe(12.3);
    expect(result.endAt).toBe(289.7);
    expect(result.confidence).toBe(0.75);
    expect(result.method).toContain('gap');
  });

  test('handlePlaybackRegionScanStreamEvent forwards progress', function() {
    const updates = [];
    handlePlaybackRegionScanStreamEvent({
      type: 'progress',
      message: 'Transcribing intro...',
      progress: 0.2,
      stage: 'transcribe_intro',
    }, function(message, progress, stage) {
      updates.push({ message: message, progress: progress, stage: stage });
    });
    expect(updates).toEqual([{
      message: 'Transcribing intro...',
      progress: 0.2,
      stage: 'transcribe_intro',
    }]);
  });

  test('handlePlaybackRegionScanStreamEvent returns result', function() {
    const result = handlePlaybackRegionScanStreamEvent({
      type: 'result',
      body: {
        startAt: 10,
        endAt: 0,
        duration: 200,
        confidence: 0.6,
        method: 'start:gap',
      },
    });
    expect(result.startAt).toBe(10);
    expect(result.endAt).toBe(0);
  });
});
