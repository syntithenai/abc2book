import {
  isMusicCollectionResult,
  mediaSearchResultArtist,
  mediaSearchResultRelativePath,
} from './mediaLinkSearchDisplay';

describe('mediaLinkSearchDisplay', function() {
  test('reads artist and relative path from collection candidates', function() {
    const item = {
      source: 'music-collection',
      title: 'Sally Gardens',
      artist: 'Altan',
      path: 'Altan/The Gap/01 Sally Gardens.mp3',
    };
    expect(isMusicCollectionResult(item)).toBe(true);
    expect(mediaSearchResultArtist(item)).toBe('Altan');
    expect(mediaSearchResultRelativePath(item)).toBe('Altan/The Gap/01 Sally Gardens.mp3');
  });

  test('treats non-collection items as not collection', function() {
    const item = {
      source: 'youtube',
      title: 'Clip',
      description: 'A video',
    };
    expect(isMusicCollectionResult(item)).toBe(false);
    expect(mediaSearchResultArtist(item)).toBe('');
    expect(mediaSearchResultRelativePath(item)).toBe('');
  });
});
