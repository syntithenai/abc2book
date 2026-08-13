import {
  isMusicCollectionByEntryUri,
  isMusicCollectionLinkUri,
  isShareableCollectionLink,
  getCollectionLinkSyncStatus,
  musicCollectionPlaybackProxyPathFromLink,
  musicCollectionPlaybackUriForLink,
  musicCollectionProxyPathFromUri,
  musicCollectionPlaybackProxyPathFromUri,
  musicCollectionNeedsBrowserTranscode,
  musicCollectionArtProxyPathFromUrl,
} from './musicCollectionLinkUtils';

describe('musicCollectionLinkUtils', function() {
  test('detects resolver collection links', function() {
    expect(isMusicCollectionLinkUri('https://peppertrees.syntithenai.com/music-collection/Altan/track.mp3')).toBe(true);
    expect(isMusicCollectionLinkUri('https://youtube.com/watch?v=abc')).toBe(false);
  });

  test('detects resolver collection entry links', function() {
    expect(isMusicCollectionByEntryUri('https://peppertrees.syntithenai.com/music-collection-by-entry/42')).toBe(true);
    expect(isMusicCollectionByEntryUri('/music-collection/Altan/track.mp3')).toBe(false);
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
    expect(musicCollectionProxyPathFromUri('https://example.com/music-collection-by-entry/42'))
      .toBe('/music-collection-by-entry/42');
  });

  test('detects browser-incompatible collection formats', function() {
    expect(musicCollectionNeedsBrowserTranscode(
      'http://localhost:8787/music-collection/Altan/track.wma'
    )).toBe(true);
    expect(musicCollectionNeedsBrowserTranscode(
      'http://localhost:8787/music-collection/Altan/track.mp3'
    )).toBe(false);
  });

  test('adds playable query for wma playback paths', function() {
    expect(musicCollectionPlaybackProxyPathFromUri(
      'http://localhost:8787/music-collection/Altan/track.wma'
    )).toBe('/music-collection/Altan/track.wma?playable=1');
    expect(musicCollectionPlaybackProxyPathFromUri(
      'http://localhost:8787/music-collection/Altan/track.mp3'
    )).toBe('/music-collection/Altan/track.mp3');
  });

  test('prefers entry id for playback when available', function() {
    expect(musicCollectionPlaybackUriForLink({
      link: 'http://localhost:8787/music-collection/Altan/track.wma',
      collectionEntryId: '42',
    })).toBe('/music-collection-by-entry/42');
    expect(musicCollectionPlaybackProxyPathFromLink({
      link: 'http://localhost:8787/music-collection/Altan/track.wma',
      collectionEntryId: '42',
    })).toBe('/music-collection-by-entry/42?playable=1');
  });

  test('extracts art proxy path from absolute url', function() {
    expect(musicCollectionArtProxyPathFromUrl('https://example.com/music-collection-art/42'))
      .toBe('/music-collection-art/42');
    expect(musicCollectionArtProxyPathFromUrl('/music-collection-art/7'))
      .toBe('/music-collection-art/7');
  });
});
