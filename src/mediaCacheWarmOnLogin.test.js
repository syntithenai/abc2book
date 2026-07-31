jest.mock('./externalMediaAudioCache', function() {
  return {
    getExternalMediaCacheKey: jest.fn(function(tuneId, linkIndex, src) {
      return 'extmedia:' + tuneId + ':' + linkIndex + ':' + src;
    }),
    isExternalMediaCached: jest.fn(function() {
      return Promise.resolve(false);
    }),
  };
});

jest.mock('./linkRecording', function() {
  return {
    buildRecordingLinkUri: jest.fn(function(id) { return 'abcbook-recording:' + id; }),
    isOwnedMediaLink: jest.fn(function(link) {
      return !!(link && (String(link.link || '').indexOf('abcbook-recording:') === 0 || link.recordingId));
    }),
    resolveRecordingLinkAudio: jest.fn(function() {
      return Promise.resolve({ blob: { type: 'audio/mpeg' }, source: 'drive' });
    }),
    resolveRecordingLinkMidi: jest.fn(function() {
      return Promise.resolve({ arrayBuffer: new ArrayBuffer(4), source: 'drive' });
    }),
  };
});

jest.mock('./midiFileUtils', function() {
  return jest.requireActual('./midiFileUtils');
});

import { isExternalMediaCached } from './externalMediaAudioCache';
import {
  isOwnedMediaLink,
  resolveRecordingLinkAudio,
  resolveRecordingLinkMidi,
} from './linkRecording';
import { warmOwnedMediaCacheOnLogin } from './mediaCacheWarmOnLogin';

describe('mediaCacheWarmOnLogin', function() {
  beforeEach(function() {
    jest.clearAllMocks();
    isExternalMediaCached.mockResolvedValue(false);
    isOwnedMediaLink.mockImplementation(function(link) {
      return !!(link && (String(link.link || '').indexOf('abcbook-recording:') === 0 || link.recordingId));
    });
  });

  test('returns early without drive credentials', async function() {
    const result = await warmOwnedMediaCacheOnLogin({ t1: { id: 't1', links: [] } }, {});
    expect(result.warmed).toBe(0);
    expect(resolveRecordingLinkAudio).not.toHaveBeenCalled();
  });

  test('warms owned audio and midi links with googleId', async function() {
    const tunes = {
      t1: {
        id: 't1',
        links: [
          { link: 'abcbook-recording:a', recordingId: 'a', googleId: 'g-audio' },
          { link: 'abcbook-recording:b', recordingId: 'b', googleId: 'g-midi', mediaKind: 'midi' },
          { link: 'abcbook-recording:c', recordingId: 'c' },
        ],
      },
    };
    const driveApi = { getDocumentBlob: jest.fn() };
    const result = await warmOwnedMediaCacheOnLogin(tunes, {
      accessToken: 'token',
      driveApi: driveApi,
    });
    expect(result.warmed).toBe(2);
    expect(resolveRecordingLinkAudio).toHaveBeenCalledTimes(1);
    expect(resolveRecordingLinkMidi).toHaveBeenCalledTimes(1);
  });

  test('skips links that are already cached', async function() {
    isExternalMediaCached.mockResolvedValue(true);
    const tunes = {
      t1: {
        id: 't1',
        links: [{ link: 'abcbook-recording:a', recordingId: 'a', googleId: 'g1' }],
      },
    };
    const result = await warmOwnedMediaCacheOnLogin(tunes, {
      accessToken: 'token',
      driveApi: {},
    });
    expect(result.warmed).toBe(0);
    expect(resolveRecordingLinkAudio).not.toHaveBeenCalled();
  });
});
