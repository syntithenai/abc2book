import { isBandcampLinkUri, repairBandcampLinkUri } from './bandcampLinkUtils';

describe('bandcampLinkUtils', function() {
  test('isBandcampLinkUri accepts artist track URLs', function() {
    expect(isBandcampLinkUri('https://altan.bandcamp.com/track/the-sally-gardens')).toBe(true);
    expect(isBandcampLinkUri('https://www.bandcamp.com/track/foo')).toBe(true);
  });

  test('isBandcampLinkUri rejects non-bandcamp URLs', function() {
    expect(isBandcampLinkUri('https://youtube.com/watch?v=abc')).toBe(false);
    expect(isBandcampLinkUri('http://altan.bandcamp.com/track/foo')).toBe(true);
    expect(isBandcampLinkUri('')).toBe(false);
  });

  test('repairBandcampLinkUri unwraps doubled origins from fuzzysearch', function() {
    expect(repairBandcampLinkUri(
      'https://simplegifts.bandcamp.comhttps://simplegifts.bandcamp.com/album/down-by-the-sally-gardens'
    )).toBe('https://simplegifts.bandcamp.com/album/down-by-the-sally-gardens');
    expect(isBandcampLinkUri(
      'https://simplegifts.bandcamp.comhttps://simplegifts.bandcamp.com/track/foo'
    )).toBe(true);
  });
});
