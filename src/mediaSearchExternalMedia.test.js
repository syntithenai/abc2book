import {
  externalMediaFromCandidate,
  isMusicCollectionSearchCandidate,
  isResolverProxiedSearchCandidate,
  isStandaloneExternalMedia,
} from './mediaSearchExternalMedia';

describe('mediaSearchExternalMedia', function() {
  test('isResolverProxiedSearchCandidate detects Internet Archive links', function() {
    const candidate = {
      source: 'internet-archive',
      link: 'https://archive.org/details/foo',
    };
    expect(isResolverProxiedSearchCandidate(candidate)).toBe(true);
    expect(isMusicCollectionSearchCandidate(candidate)).toBe(false);
  });

  test('externalMediaFromCandidate maps Internet Archive to mediaLink', function() {
    const external = externalMediaFromCandidate({
      source: 'internet-archive',
      title: 'Sally Gardens',
      artist: 'Altan',
      link: 'https://archive.org/details/foo',
    });
    expect(external).toEqual({
      source: 'internet-archive',
      title: 'Sally Gardens',
      artist: 'Altan',
      mediaLink: 'https://archive.org/details/foo',
      image: '',
    });
    expect(isStandaloneExternalMedia(external)).toBe(true);
  });

  test('externalMediaFromCandidate keeps music collection separate', function() {
    const external = externalMediaFromCandidate({
      source: 'music-collection',
      title: 'Library Song',
      link: 'http://localhost:8787/music-collection/track.mp3',
      path: 'track.mp3',
    });
    expect(external.collectionLink).toBe('http://localhost:8787/music-collection/track.mp3');
    expect(external.mediaLink).toBeUndefined();
  });

  test('externalMediaFromCandidate maps youtube search id to youtubeId', function() {
    const external = externalMediaFromCandidate({
      source: 'youtube',
      id: 'abc123XYZ12',
      title: 'Video',
      link: 'https://www.youtube.com/watch?v=abc123XYZ12',
    });
    expect(external.youtubeId).toBe('abc123XYZ12');
  });
});
