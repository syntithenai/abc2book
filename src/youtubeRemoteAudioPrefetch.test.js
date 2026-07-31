import { __arrayBufferToBase64ForTests } from './youtubeRemoteAudioPrefetch';

describe('youtubeRemoteAudioPrefetch', function() {
  test('arrayBufferToBase64 round-trips small payload', function() {
    const bytes = new Uint8Array([1, 2, 3, 250]);
    const encoded = __arrayBufferToBase64ForTests(bytes.buffer);
    expect(encoded).toBe('AQID+g==');
  });
});
