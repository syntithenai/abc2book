import { shouldAutoCacheMediaLink, shouldScheduleMediaLinkCache } from './mediaLinkAutoCache';

function isYoutubeLink(url) {
  return /youtu\.?be/.test(url);
}

describe('mediaLinkAutoCache', function() {
  test('shouldAutoCacheMediaLink includes archive and library sources', function() {
    expect(shouldAutoCacheMediaLink('https://archive.org/details/foo', isYoutubeLink)).toBe(true);
    expect(shouldAutoCacheMediaLink('https://www.loc.gov/item/123/', isYoutubeLink)).toBe(true);
    expect(shouldAutoCacheMediaLink('https://artist.bandcamp.com/track/foo', isYoutubeLink)).toBe(true);
    expect(shouldAutoCacheMediaLink('http://localhost:8787/music-collection/track.mp3', isYoutubeLink)).toBe(true);
  });

  test('shouldAutoCacheMediaLink excludes YouTube', function() {
    expect(shouldAutoCacheMediaLink('https://www.youtube.com/watch?v=abcdefghijk', isYoutubeLink)).toBe(false);
  });

  test('shouldScheduleMediaLinkCache honors autocache or archive sources', function() {
    expect(shouldScheduleMediaLinkCache(
      'https://archive.org/details/foo',
      'audio',
      isYoutubeLink,
      false
    )).toBe(true);
    expect(shouldScheduleMediaLinkCache(
      'https://example.com/a.mp3',
      'audio',
      isYoutubeLink,
      false
    )).toBe(false);
    expect(shouldScheduleMediaLinkCache(
      'https://example.com/a.mp3',
      'audio',
      isYoutubeLink,
      true
    )).toBe(true);
  });
});
