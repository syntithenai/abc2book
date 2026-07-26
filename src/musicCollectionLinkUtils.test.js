import {
  isMusicCollectionLinkUri,
  isShareableCollectionLink,
  getCollectionLinkSyncStatus,
  musicCollectionProxyPathFromUri,
  musicCollectionArtProxyPathFromUrl,
} from './musicCollectionLinkUtils';

describe('musicCollectionLinkUtils', function() {
  test('detects resolver collection links', function() {
    expect(isMusicCollectionLinkUri('https://peppertrees.syntithenai.com/music-collection/Altan/track.mp3')).toBe(true);
    expect(isMusicCollectionLinkUri('https://youtube.com/watch?v=abc')).toBe(false);
  });

  test('shareable only when no googleId', function() {
    expect(isShareableCollectionLink({
      link: 'https://example.com/music-collection/a.mp3',
    })).toBe(true);
    expect(isShareableCollectionLink({
      link: 'https://example.com/music-collection/a.mp3',
      googleId: 'gid',
    })).toBe(false);
  });

  test('sync status mirrors owned media', function() {
    expect(getCollectionLinkSyncStatus({
      link: 'https://example.com/music-collection/a.mp3',
    })).toBe('local');
    expect(getCollectionLinkSyncStatus({
      link: 'https://example.com/music-collection/a.mp3',
      googleId: 'gid',
    })).toBe('synced');
  });

  test('extracts proxy path from absolute url', function() {
    expect(musicCollectionProxyPathFromUri('https://example.com/music-collection/Altan/a.mp3'))
      .toBe('/music-collection/Altan/a.mp3');
  });

  test('extracts art proxy path from absolute url', function() {
    expect(musicCollectionArtProxyPathFromUrl('https://example.com/music-collection-art/42'))
      .toBe('/music-collection-art/42');
    expect(musicCollectionArtProxyPathFromUrl('/music-collection-art/7'))
      .toBe('/music-collection-art/7');
  });
});
