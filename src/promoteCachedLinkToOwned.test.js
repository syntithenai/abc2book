import {
  canPromoteCachedLinkToOwned,
  tuneHasPromotableLinkCandidates,
} from './promoteCachedLinkToOwned';
import { isOwnedMediaLink } from './linkRecording';

describe('promoteCachedLinkToOwned', function() {
  test('cannot promote owned links', function() {
    const link = { link: 'abcbook-recording:x' };
    expect(isOwnedMediaLink(link)).toBe(true);
    expect(canPromoteCachedLinkToOwned(link, link.link)).toBe(false);
  });

  test('can promote archive.org links', function() {
    const link = { link: 'https://archive.org/details/foo' };
    expect(canPromoteCachedLinkToOwned(link, link.link)).toBe(true);
  });

  test('cannot promote youtube', function() {
    const link = { link: 'https://youtu.be/abc' };
    expect(canPromoteCachedLinkToOwned(link, link.link, function() { return true; })).toBe(false);
  });

  test('tuneHasPromotableLinkCandidates detects external library links', function() {
    const tune = {
      links: [
        { link: 'abcbook-recording:owned' },
        { link: 'https://archive.org/details/foo' },
      ],
    };
    expect(tuneHasPromotableLinkCandidates(tune)).toBe(true);
    expect(tuneHasPromotableLinkCandidates({ links: [{ link: 'abcbook-recording:x' }] })).toBe(false);
  });
});
