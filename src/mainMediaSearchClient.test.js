import { mergeMainMediaCandidates } from './mainMediaSearchClient';

describe('mainMediaSearchClient', function() {
  test('mergeMainMediaCandidates orders collection before device', function() {
    const merged = mergeMainMediaCandidates({
      collection: [{
        id: 'c1',
        title: 'Collection Track',
        source: 'music-collection',
        matchScore: 80,
      }],
      device: [{
        id: 'd1',
        title: 'Device Track',
        source: 'device-file',
        matchScore: 90,
      }],
    }, 20);
    expect(merged).toHaveLength(2);
    expect(merged[0].source).toBe('music-collection');
    expect(merged[1].source).toBe('device-file');
  });
});
