const localforageData = {};

jest.mock('localforage', function() {
  return {
    createInstance: function() {
      return {
        setItem: function(key, value) {
          localforageData[key] = value;
          return Promise.resolve(value);
        },
        getItem: function(key) {
          return Promise.resolve(localforageData[key] || null);
        },
        iterate: function(iterator) {
          const keys = Object.keys(localforageData);
          let chain = Promise.resolve();
          keys.forEach(function(key) {
            chain = chain.then(function() {
              return iterator(localforageData[key], key);
            });
          });
          return chain;
        },
        clear: function() {
          Object.keys(localforageData).forEach(function(key) {
            delete localforageData[key];
          });
          return Promise.resolve();
        },
      };
    },
  };
});

jest.mock('./mediaProxyConfig', function() {
  const actual = jest.requireActual('./mediaProxyConfig');
  return Object.assign({}, actual, {
    getMediaProxyBaseCandidates: jest.fn(),
    getBillingMediaProxyCandidates: jest.fn(function() {
      return ['https://cloud-hosted.example.com'];
    }),
  });
});

jest.mock('./analytics', function() {
  return { trackResolverRequest: jest.fn() };
});

jest.mock('./externalMediaAudioLoader', function() {
  return {
    fetchAndDecodeExternalMedia: jest.fn(),
  };
});

jest.mock('./audioCompressEncode', function() {
  return {
    encodeAudioBufferWithSetting: jest.fn(),
  };
});

    jest.mock('./mediaCacheStorage', function() {
  return {
    scheduleMediaCacheStorageCheck: jest.fn(),
    tuneIdFromExternalMediaCacheKey: jest.fn(),
    parseExternalMediaCacheKey: jest.fn(function(key) {
      if (!key || String(key).indexOf('extmedia:') !== 0) return null
      if (String(key).indexOf('extmedia:src:') === 0) {
        return { standalone: true, tuneId: null, linkIndex: null, src: String(key).slice('extmedia:src:'.length) }
      }
      const rest = String(key).slice('extmedia:'.length)
      const firstColon = rest.indexOf(':')
      if (firstColon < 0) return null
      const afterTune = rest.slice(firstColon + 1)
      const secondColon = afterTune.indexOf(':')
      if (secondColon < 0) {
        return { standalone: false, tuneId: rest.slice(0, firstColon), linkIndex: afterTune, src: '' }
      }
      return {
        standalone: false,
        tuneId: rest.slice(0, firstColon),
        linkIndex: afterTune.slice(0, secondColon),
        src: afterTune.slice(secondColon + 1),
      }
    }),
  };
});

import { downloadAndCacheExternalMedia, getCachedExternalMediaBlob, getExternalMediaCacheKey } from './externalMediaAudioCache';
import { fetchAndDecodeExternalMedia } from './externalMediaAudioLoader';
import { encodeAudioBufferWithSetting } from './audioCompressEncode';
import { getMediaProxyBaseCandidates } from './mediaProxyConfig';

const fetchMock = global.fetch;

describe('downloadAndCacheExternalMedia', function() {
  beforeEach(function() {
    Object.keys(localforageData).forEach(function(key) {
      delete localforageData[key];
    });
    jest.clearAllMocks();
    getMediaProxyBaseCandidates.mockReturnValue(['https://resolver.example']);
  });

  afterEach(function() {
    global.fetch = fetchMock;
  });

  test('stores Bandcamp audio without decode or re-encode', async function() {
    const bytes = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: function() { return 'audio/mpeg'; } },
      arrayBuffer: async function() {
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      },
    });

    const src = 'https://altan.bandcamp.com/track/the-sally-gardens';
    const result = await downloadAndCacheExternalMedia({
      tuneId: 't1',
      linkIndex: 0,
      src: src,
      srcType: 'audio',
      accessToken: 'token',
    });

    expect(fetchAndDecodeExternalMedia).not.toHaveBeenCalled();
    expect(encodeAudioBufferWithSetting).not.toHaveBeenCalled();
    expect(result.cached).toBe(false);
    expect(result.audioFormat).toBe('audio/mpeg');
    const cached = await getCachedExternalMediaBlob(getExternalMediaCacheKey('t1', 0, src));
    expect(cached.blob.size).toBe(bytes.length);
    expect(cached.blob.type).toBe('audio/mpeg');
  });
});
