jest.mock('./youtubeSearchClient', function() {
  return {
    searchYouTubeVideos: jest.fn(function() {
      return Promise.resolve({
        empty: false,
        multiple: false,
        link: 'https://www.youtube.com/watch?v=abc',
        title: 'Amazing Grace',
        id: 'abc',
      });
    }),
    fetchYouTubeOembedMetadata: jest.fn(),
  };
});

jest.mock('./musicCollectionSearchClient', function() {
  return {
    searchMusicCollection: jest.fn(function() {
      return Promise.resolve({ empty: true, candidates: [] });
    }),
  };
});

import { youtubeAutoselectConfidence, collectionAutoselectConfidence, prepareBulkTextQueue } from './bulkTextPrepare';
import { searchMusicCollection } from './musicCollectionSearchClient';

describe('bulkTextPrepare', function() {
  test('youtubeAutoselectConfidence high for exact title match', function() {
    const conf = youtubeAutoselectConfidence('Amazing Grace', '', { title: 'Amazing Grace' });
    expect(conf.confidence).toBe('high');
  });

  test('youtubeAutoselectConfidence low for unrelated', function() {
    const conf = youtubeAutoselectConfidence('Foo', '', { title: 'Completely Different Song' });
    expect(conf.confidence).toBe('low');
  });

  test('collectionAutoselectConfidence high for exact tagged match', function() {
    const conf = collectionAutoselectConfidence('Sally Gardens', 'Altan', {
      title: 'Sally Gardens',
      artist: 'Altan',
    });
    expect(conf.confidence).toBe('high');
  });

  test('prepareBulkTextQueue prefers collection autoselect over YouTube', async function() {
    searchMusicCollection.mockResolvedValueOnce({
      empty: false,
      multiple: false,
      title: 'Sally Gardens',
      artist: 'Altan',
      link: 'https://resolver/music-collection/sally.mp3',
      source: 'music-collection',
    });

    const prepared = await prepareBulkTextQueue('Sally Gardens by Altan', {
      searchYouTube: true,
    });

    expect(prepared[0].collectionAutoselected).toBe(true);
    expect(prepared[0].tune.links[0].link).toContain('/music-collection/');
  });

  test('prepareBulkTextQueue builds candidates with skipEnrich', async function() {
    const prepared = await prepareBulkTextQueue('Song One by Artist\nSong Two', {
      searchYouTube: false,
    });
    expect(prepared).toHaveLength(2);
    expect(prepared[0].sourceKind).toBe('bulk-text');
    expect(prepared[0].skipEnrich).toBe(true);
    expect(prepared[0].tune.name).toBe('Song One');
  });

  test('prepareBulkTextQueue enriches missing artist from linked YouTube', async function() {
    const fetchMeta = jest.fn(function() {
      return Promise.resolve({
        ok: true,
        title: 'The Dubliners - Whiskey in the Jar',
        authorName: 'Folk Channel',
      });
    });
    const prepared = await prepareBulkTextQueue(
      'Whiskey in the Jar | https://www.youtube.com/watch?v=abc123',
      { searchYouTube: false, fetchYouTubeOembedMetadata: fetchMeta }
    );
    expect(fetchMeta).toHaveBeenCalled();
    expect(prepared).toHaveLength(1);
    expect(prepared[0].tune.name).toBe('Whiskey in the Jar');
    expect(prepared[0].tune.composer).toBe('The Dubliners');
    expect(prepared[0].youtubeMetaEnriched).toBe(true);
  });
});
