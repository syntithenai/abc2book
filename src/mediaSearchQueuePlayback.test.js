import {
  appendMediaCandidateToQueue,
  isQueueActive,
} from './nowPlayingQueue';
import {
  buildMediaSearchPlaybackQueue,
  isMediaCandidateCurrentQueueItem,
  mediaCandidateMatchesExternalMedia,
} from './mediaSearchQueuePlayback';

describe('mediaSearchQueuePlayback', function() {
  const deviceCandidate = {
    source: 'device-file',
    title: 'Track',
    uri: 'content://media/external/audio/media/1',
  };

  test('buildMediaSearchPlaybackQueue creates external media-search queue', function() {
    const queue = buildMediaSearchPlaybackQueue(deviceCandidate);
    expect(isQueueActive(queue)).toBe(true);
    expect(queue.source).toBe('media-search');
    expect(queue.items[0].externalMedia.uri).toBe(deviceCandidate.uri);
  });

  test('isMediaCandidateCurrentQueueItem matches current external queue item', function() {
    const queue = appendMediaCandidateToQueue(null, deviceCandidate);
    expect(isMediaCandidateCurrentQueueItem(deviceCandidate, queue)).toBe(true);
    expect(mediaCandidateMatchesExternalMedia(deviceCandidate, queue.items[0].externalMedia)).toBe(true);
  });
});
