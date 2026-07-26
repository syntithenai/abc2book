import { searchMusicCollection } from './musicCollectionSearchClient';
import { searchYouTubeVideos } from './youtubeSearchClient';
import { searchMediaLinks } from './mediaLinkSearchClient';

jest.mock('./musicCollectionSearchClient', function() {
  return {
    searchMusicCollection: jest.fn(),
  };
});

jest.mock('./youtubeSearchClient', function() {
  return {
    searchYouTubeVideos: jest.fn(),
  };
});

describe('mediaLinkSearchClient', function() {
  beforeEach(function() {
    searchMusicCollection.mockReset();
    searchYouTubeVideos.mockReset();
  });

  test('prefers collection results before YouTube', async function() {
    searchMusicCollection.mockResolvedValue({
      empty: false,
      multiple: true,
      candidates: [
        { title: 'Sally Gardens', source: 'music-collection', link: 'https://resolver/music-collection/a.mp3', matchScore: 90 },
      ],
    });
    searchYouTubeVideos.mockResolvedValue({
      empty: false,
      multiple: true,
      candidates: [
        { title: 'Sally Gardens', source: 'youtube', link: 'https://youtube.com/watch?v=abc' },
      ],
    });

    const result = await searchMediaLinks({ query: 'Sally Gardens' });
    expect(result.candidates[0].source).toBe('music-collection');
    expect(result.candidates[1].source).toBe('youtube');
  });

  test('falls back to YouTube when collection is empty', async function() {
    searchMusicCollection.mockResolvedValue({ empty: true, candidates: [] });
    searchYouTubeVideos.mockResolvedValue({
      empty: false,
      multiple: false,
      title: 'Foo',
      link: 'https://youtube.com/watch?v=foo',
      source: 'youtube',
    });

    const result = await searchMediaLinks({ query: 'Foo' });
    expect(result.link).toContain('youtube.com');
  });
});
