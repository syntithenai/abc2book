import {
  enqueueAutoCacheMediaLink,
  scheduleSelectedMediaLinkCache,
  shouldAutoCacheMediaLink,
  shouldCacheSelectedMediaLink,
  shouldScheduleMediaLinkCache,
} from './mediaLinkAutoCache';
import * as mediaCacheQueue from './mediaCacheQueue';
import { resolveUriPlaybackSrcType } from './mediaLinkSrcType';

jest.mock('./externalMediaAudioCache', function() {
  return {
    getCachedExternalMediaBlob: jest.fn(function() { return Promise.resolve(null); }),
    getStandaloneProxiedMediaCacheKey: jest.fn(function(src) { return 'extmedia:src:' + src; }),
    cacheExternalMediaFromSrc: jest.fn(function() { return Promise.resolve({}); }),
    isExternalMediaCached: jest.fn(function() { return Promise.resolve(false); }),
  };
});

function isYoutubeLink(url) {
  return /youtu\.?be/.test(url);
}

describe('mediaLinkAutoCache', function() {
  beforeEach(function() {
    jest.spyOn(mediaCacheQueue, 'enqueueCacheJob').mockReturnValue('job-1');
    jest.spyOn(mediaCacheQueue, 'getState').mockReturnValue({ running: false });
    jest.spyOn(mediaCacheQueue, 'start').mockImplementation(function() {});
  });

  afterEach(function() {
    jest.restoreAllMocks();
  });
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
    expect(shouldScheduleMediaLinkCache(
      'https://www.youtube.com/watch?v=abcdefghijk',
      'youtube',
      isYoutubeLink,
      true
    )).toBe(false);
  });

  test('shouldCacheSelectedMediaLink includes any non-YouTube audio', function() {
    expect(shouldCacheSelectedMediaLink(
      'https://example.com/a.mp3',
      'audio',
      isYoutubeLink
    )).toBe(true);
    expect(shouldCacheSelectedMediaLink(
      'https://www.europeana.eu/item/123',
      'audio',
      isYoutubeLink
    )).toBe(true);
    expect(shouldCacheSelectedMediaLink(
      'https://artist.bandcamp.com/track/foo',
      'audio',
      isYoutubeLink
    )).toBe(true);
    expect(shouldCacheSelectedMediaLink(
      'https://www.youtube.com/watch?v=abcdefghijk',
      'youtube',
      isYoutubeLink
    )).toBe(false);
    expect(shouldCacheSelectedMediaLink(
      'https://www.youtube.com/watch?v=abcdefghijk',
      'audio',
      isYoutubeLink
    )).toBe(false);
  });

  test('scheduleSelectedMediaLinkCache enqueues tune-linked cache jobs', function() {
    mediaCacheQueue.enqueueCacheJob.mockClear();
    const tune = {
      id: 't1',
      name: 'Song',
      links: [{ link: 'https://artist.bandcamp.com/track/foo', title: 'Foo', source: 'bandcamp' }],
    };
    const link = tune.links[0];
    expect(shouldScheduleMediaLinkCache(
      link.link,
      resolveUriPlaybackSrcType(link.link, isYoutubeLink),
      isYoutubeLink,
      false
    )).toBe(true);
    const jobId = enqueueAutoCacheMediaLink(tune, 0, link, { isYoutubeLink: isYoutubeLink });
    expect(jobId).toBe('job-1');
    const scheduled = scheduleSelectedMediaLinkCache(link, tune, {
      isYoutubeLink: isYoutubeLink,
    });
    expect(scheduled).toBe(true);
    expect(mediaCacheQueue.enqueueCacheJob).toHaveBeenCalled();
  });

  test('scheduleSelectedMediaLinkCache enqueues generic audio links', function() {
    mediaCacheQueue.enqueueCacheJob.mockClear();
    const tune = {
      id: 't1',
      name: 'Song',
      links: [{ link: 'https://example.com/a.mp3', title: 'Direct', source: 'europeana' }],
    };
    const scheduled = scheduleSelectedMediaLinkCache(tune.links[0], tune, {
      isYoutubeLink: isYoutubeLink,
    });
    expect(scheduled).toBe(true);
    expect(mediaCacheQueue.enqueueCacheJob).toHaveBeenCalled();
  });

  test('scheduleSelectedMediaLinkCache skips YouTube links', function() {
    mediaCacheQueue.enqueueCacheJob.mockClear();
    const scheduled = scheduleSelectedMediaLinkCache({
      link: 'https://www.youtube.com/watch?v=abcdefghijk',
      source: 'youtube',
    }, { id: 't1', links: [] }, {
      isYoutubeLink: isYoutubeLink,
    });
    expect(scheduled).toBe(false);
    expect(mediaCacheQueue.enqueueCacheJob).not.toHaveBeenCalled();
  });
});
