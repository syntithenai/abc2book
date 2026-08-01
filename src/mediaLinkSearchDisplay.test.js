import {
  isDeviceFileResult,
  isMusicCollectionResult,
  mediaSearchResultDisplayArtist,
  mediaSearchResultDisplayTitle,
  mediaSearchSourceLabel,
} from './mediaLinkSearchDisplay';

describe('mediaLinkSearchDisplay device source', function() {
  test('isDeviceFileResult identifies device-file candidates', function() {
    expect(isDeviceFileResult({ source: 'device-file' })).toBe(true);
    expect(isDeviceFileResult({ source: 'music-collection' })).toBe(false);
  });

  test('mediaSearchSourceLabel returns Device label', function() {
    expect(mediaSearchSourceLabel('device-file')).toBe('Device');
    expect(mediaSearchSourceLabel('music-collection')).toBe('My library');
  });

  test('isMusicCollectionResult still works', function() {
    expect(isMusicCollectionResult({ source: 'music-collection' })).toBe(true);
  });

  test('mediaSearchResultDisplayTitle and artist prefer tags then filename', function() {
    expect(mediaSearchResultDisplayTitle({
      title: 'Tagged Title',
      artist: 'Tagged Artist',
      path: '/music/Artist - File Title.mp3',
    })).toBe('Tagged Title');
    expect(mediaSearchResultDisplayArtist({
      title: 'Tagged Title',
      artist: 'Tagged Artist',
      path: '/music/Artist - File Title.mp3',
    })).toBe('Tagged Artist');
    expect(mediaSearchResultDisplayTitle({
      title: '<unknown>',
      path: '/storage/Stephen Hawking - Brief History.mp3',
    })).toBe('Brief History');
    expect(mediaSearchResultDisplayArtist({
      artist: '<unknown>',
      path: '/storage/Stephen Hawking - Brief History.mp3',
    })).toBe('Stephen Hawking');
  });
});
