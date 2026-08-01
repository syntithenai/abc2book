import {
  isYoutubePlaybackUri,
  normalizeRemotePlaybackPayload,
  normalizeYoutubePlaybackUri,
  unwrapResolverProxyAudioUri,
} from './youtubePlaybackUri';

function youtubeGetId(url) {
  const match = String(url || '').match(/(?:v=|youtu\.be\/|\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

describe('youtubePlaybackUri', function() {
  test('detects music.youtube and m.youtube links', function() {
    expect(isYoutubePlaybackUri('https://music.youtube.com/watch?v=dQw4w9WgXcQ', youtubeGetId)).toBe(true);
    expect(isYoutubePlaybackUri('https://m.youtube.com/watch?v=dQw4w9WgXcQ', youtubeGetId)).toBe(true);
  });

  test('normalizes to canonical https youtube watch URL', function() {
    expect(normalizeYoutubePlaybackUri('https://m.youtube.com/watch?v=dQw4w9WgXcQ', youtubeGetId))
      .toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  test('unwraps resolver proxy-audio URLs', function() {
    const inner = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const wrapped = 'http://127.0.0.1:8787/proxy-audio?url=' + encodeURIComponent(inner);
    expect(unwrapResolverProxyAudioUri(wrapped)).toBe(inner);
  });

  test('normalizeRemotePlaybackPayload fixes proxy-wrapped youtube source', function() {
    const inner = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const wrapped = 'http://localhost:8787/proxy-audio?url=' + encodeURIComponent(inner);
    const payload = normalizeRemotePlaybackPayload({
      source: wrapped,
      sourceType: 'audio',
    }, youtubeGetId);
    expect(payload.sourceType).toBe('youtube');
    expect(payload.source).toBe(inner);
  });

  test('normalizeRemotePlaybackPayload normalizes queue entries', function() {
    const payload = normalizeRemotePlaybackPayload({
      source: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      sourceType: 'youtube',
      queue: [{
        source: 'http://localhost:8787/proxy-audio?url=' + encodeURIComponent('https://m.youtube.com/watch?v=jNQXAC9IVRw'),
        sourceType: 'audio',
      }],
    }, youtubeGetId);
    expect(payload.queue[0].sourceType).toBe('youtube');
    expect(payload.queue[0].source).toBe('https://www.youtube.com/watch?v=jNQXAC9IVRw');
  });
});
