import { isLocGovLinkUri } from './locGovLinkUtils';

describe('locGovLinkUtils', function() {
  test('isLocGovLinkUri accepts loc.gov item URLs', function() {
    expect(isLocGovLinkUri('https://www.loc.gov/item/2016652010/')).toBe(true);
    expect(isLocGovLinkUri('https://loc.gov/audio/?q=folk')).toBe(true);
  });

  test('isLocGovLinkUri rejects non-loc URLs', function() {
    expect(isLocGovLinkUri('https://archive.org/details/foo')).toBe(false);
    expect(isLocGovLinkUri('http://www.loc.gov/item/foo')).toBe(true);
  });
});
