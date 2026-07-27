import { searchMusicCollection } from './musicCollectionSearchClient';
import { searchBandcamp } from './bandcampSearchClient';
import { searchInternetArchive } from './internetArchiveSearchClient';
import { searchEuropeana } from './europeanaSearchClient';
import { searchLocAudio } from './locAudioSearchClient';
import { searchYouTubeVideos } from './youtubeSearchClient';
import { searchMediaLinks } from './mediaLinkSearchClient';

jest.mock('./musicCollectionSearchClient', function() {
  return {
    searchMusicCollection: jest.fn(),
  };
});

jest.mock('./bandcampSearchClient', function() {
  return {
    searchBandcamp: jest.fn(),
  };
});

jest.mock('./internetArchiveSearchClient', function() {
  return {
    searchInternetArchive: jest.fn(),
  };
});

jest.mock('./europeanaSearchClient', function() {
  return {
    searchEuropeana: jest.fn(),
  };
});

jest.mock('./locAudioSearchClient', function() {
  return {
    searchLocAudio: jest.fn(),
  };
});

jest.mock('./youtubeSearchClient', function() {
  return {
    searchYouTubeVideos: jest.fn(),
  };
});

jest.mock('./mediaResolverHealthStore', function() {
  return {
    getMediaResolverHealthState: jest.fn(function() {
      return { checked: true, available: true, status: { available: true, features: {} } };
    }),
    probeMediaResolverHealth: jest.fn(function() {
      return Promise.resolve(true);
    }),
  };
});

jest.mock('./mediaProxyClient', function() {
  return {
    isMediaProxyConfigured: jest.fn(function() {
      return false;
    }),
  };
});

describe('mediaLinkSearchClient', function() {
  beforeEach(function() {
    searchMusicCollection.mockReset();
    searchBandcamp.mockReset();
    searchInternetArchive.mockReset();
    searchEuropeana.mockReset();
    searchLocAudio.mockReset();
    searchYouTubeVideos.mockReset();
  });

  test('lists archive sources before YouTube when collection is empty', async function() {
    searchMusicCollection.mockResolvedValue({ empty: true, candidates: [] });
    searchBandcamp.mockResolvedValue({ empty: true, candidates: [] });
    searchInternetArchive.mockResolvedValue({
      empty: false,
      multiple: true,
      candidates: [
        { title: 'Sally Gardens', source: 'internet-archive', link: 'https://archive.org/details/foo', matchScore: 80 },
      ],
    });
    searchEuropeana.mockResolvedValue({
      empty: false,
      multiple: true,
      candidates: [
        { title: 'Sally Gardens', source: 'europeana', link: 'https://example.com/audio.mp3', matchScore: 75 },
      ],
    });
    searchLocAudio.mockResolvedValue({
      empty: false,
      multiple: true,
      candidates: [
        { title: 'Sally Gardens', source: 'loc', link: 'https://www.loc.gov/item/123/', matchScore: 70 },
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
    expect(result.candidates[0].source).toBe('internet-archive');
    expect(result.candidates[1].source).toBe('europeana');
    expect(result.candidates[2].source).toBe('loc');
    expect(result.candidates[3].source).toBe('youtube');
  });

  test('prefers collection matches before YouTube even when YouTube scores higher', async function() {
    searchMusicCollection.mockResolvedValue({
      empty: false,
      multiple: true,
      candidates: [
        {
          title: 'Sally Gardens',
          artist: 'Altan',
          source: 'music-collection',
          link: 'https://resolver/music-collection/a.mp3',
          matchScore: 60,
        },
      ],
    });
    searchBandcamp.mockResolvedValue({ empty: true, candidates: [] });
    searchInternetArchive.mockResolvedValue({ empty: true, candidates: [] });
    searchEuropeana.mockResolvedValue({ empty: true, candidates: [] });
    searchLocAudio.mockResolvedValue({ empty: true, candidates: [] });
    searchYouTubeVideos.mockResolvedValue({
      empty: false,
      multiple: true,
      candidates: [
        {
          title: 'Sally Gardens',
          artist: 'Altan',
          source: 'youtube',
          link: 'https://youtube.com/watch?v=abc',
        },
      ],
    });

    const result = await searchMediaLinks({
      title: 'Sally Gardens',
      artist: 'Altan',
    });
    expect(result.candidates[0].source).toBe('music-collection');
    expect(result.candidates[1].source).toBe('youtube');
  });

  test('ranks higher-scoring collection results above weaker sources', async function() {
    searchMusicCollection.mockResolvedValue({
      empty: false,
      multiple: true,
      candidates: [
        { title: 'Sally Gardens', source: 'music-collection', link: 'https://resolver/music-collection/a.mp3', matchScore: 90 },
      ],
    });
    searchBandcamp.mockResolvedValue({
      empty: false,
      multiple: true,
      candidates: [
        { title: 'Sally Gardens', source: 'bandcamp', link: 'https://altan.bandcamp.com/track/sally', matchScore: 70 },
      ],
    });
    searchInternetArchive.mockResolvedValue({ empty: true, candidates: [] });
    searchEuropeana.mockResolvedValue({ empty: true, candidates: [] });
    searchLocAudio.mockResolvedValue({ empty: true, candidates: [] });
    searchYouTubeVideos.mockResolvedValue({
      empty: false,
      multiple: true,
      candidates: [
        { title: 'Sally Gardens', source: 'youtube', link: 'https://youtube.com/watch?v=abc' },
      ],
    });

    const result = await searchMediaLinks({ query: 'Sally Gardens' });
    expect(result.candidates[0].source).toBe('music-collection');
    expect(result.candidates[1].source).toBe('bandcamp');
    expect(result.candidates[2].source).toBe('youtube');
  });

  test('falls back to YouTube when collection is empty', async function() {
    searchMusicCollection.mockResolvedValue({ empty: true, candidates: [] });
    searchBandcamp.mockResolvedValue({ empty: true, candidates: [] });
    searchInternetArchive.mockResolvedValue({ empty: true, candidates: [] });
    searchEuropeana.mockResolvedValue({ empty: true, candidates: [] });
    searchLocAudio.mockResolvedValue({ empty: true, candidates: [] });
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

  test('infers artist and title for combined queries', async function() {
    searchMusicCollection.mockResolvedValue({ empty: true, candidates: [] });
    searchBandcamp.mockResolvedValue({ empty: true, candidates: [] });
    searchInternetArchive.mockResolvedValue({ empty: true, candidates: [] });
    searchEuropeana.mockResolvedValue({ empty: true, candidates: [] });
    searchLocAudio.mockResolvedValue({ empty: true, candidates: [] });
    searchYouTubeVideos.mockResolvedValue({ empty: true, candidates: [] });

    await searchMediaLinks({ query: 'elvis presley love me' });

    expect(searchMusicCollection).toHaveBeenCalledWith(expect.objectContaining({
      title: 'love me',
      artist: 'elvis presley',
      query: 'elvis presley love me',
    }));
  });

  test('caps merged results at fifty', async function() {
    const many = Array.from({ length: 60 }, function(_, index) {
      return {
        title: 'Track ' + index,
        source: 'youtube',
        link: 'https://youtube.com/watch?v=' + index,
      };
    });
    searchMusicCollection.mockResolvedValue({ empty: true, candidates: [] });
    searchBandcamp.mockResolvedValue({ empty: true, candidates: [] });
    searchInternetArchive.mockResolvedValue({ empty: true, candidates: [] });
    searchEuropeana.mockResolvedValue({ empty: true, candidates: [] });
    searchLocAudio.mockResolvedValue({ empty: true, candidates: [] });
    searchYouTubeVideos.mockResolvedValue({
      empty: false,
      multiple: true,
      candidates: many,
    });

    const result = await searchMediaLinks({ query: 'Zarochi', maxTotalResults: 50 });
    expect(result.candidates).toHaveLength(50);
  });

  test('searches all sources in parallel', async function() {
    let pending = 0;
    let maxPending = 0;
    function track(fn) {
      return function() {
        pending += 1;
        maxPending = Math.max(maxPending, pending);
        return Promise.resolve(fn.apply(this, arguments)).finally(function() {
          pending -= 1;
        });
      };
    }

    searchMusicCollection.mockImplementation(track(function() {
      return new Promise(function(resolve) {
        setTimeout(function() {
          resolve({ empty: true, candidates: [] });
        }, 20);
      });
    }));
    searchBandcamp.mockImplementation(track(function() {
      return new Promise(function(resolve) {
        setTimeout(function() {
          resolve({ empty: true, candidates: [] });
        }, 20);
      });
    }));
    searchInternetArchive.mockResolvedValue({ empty: true, candidates: [] });
    searchEuropeana.mockResolvedValue({ empty: true, candidates: [] });
    searchLocAudio.mockResolvedValue({ empty: true, candidates: [] });
    searchYouTubeVideos.mockResolvedValue({ empty: true, candidates: [] });

    await searchMediaLinks({ query: 'Sally Gardens' });
    expect(maxPending).toBeGreaterThan(1);
  });
});
