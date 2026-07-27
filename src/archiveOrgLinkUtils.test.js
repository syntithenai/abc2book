import { isArchiveOrgLinkUri, isArchiveOrgDirectDownloadUri } from './archiveOrgLinkUtils';

describe('archiveOrgLinkUtils', function() {
  test('isArchiveOrgLinkUri accepts archive.org details URLs', function() {
    expect(isArchiveOrgLinkUri('https://archive.org/details/78_the-sally-gardens_pears-peter-britten-benjamin')).toBe(true);
    expect(isArchiveOrgLinkUri('https://www.archive.org/download/foo/bar.mp3')).toBe(true);
  });

  test('isArchiveOrgDirectDownloadUri detects download paths', function() {
    expect(isArchiveOrgDirectDownloadUri('https://archive.org/download/foo/bar.mp3')).toBe(true);
    expect(isArchiveOrgDirectDownloadUri('https://archive.org/details/foo')).toBe(false);
  });

  test('isArchiveOrgLinkUri rejects non-archive URLs', function() {
    expect(isArchiveOrgLinkUri('https://youtube.com/watch?v=abc')).toBe(false);
    expect(isArchiveOrgLinkUri('http://archive.org/details/foo')).toBe(false);
  });
});
