jest.mock('./linkRecording', function() {
  return {
    resolveRecordingLinkAudio: jest.fn(),
    isOwnedMediaLinkUri: function(uri) {
      return !!(uri && String(uri).trim().startsWith('abcbook-recording:'));
    },
    isMidiOwnedMediaLink: function(link) {
      return !!(link && link.mediaKind === 'midi');
    },
  };
});

jest.mock('./externalMediaAudioCache', function() {
  return {
    getExternalMediaMp3Blob: jest.fn(),
    getCachedExternalMediaBlob: jest.fn(function() {
      return Promise.resolve(null);
    }),
    getExternalMediaCacheKey: jest.fn(function(tuneId, linkIndex, src) {
      return 'extmedia:' + tuneId + ':' + linkIndex + ':' + src;
    }),
  };
});

import { resolveRecordingLinkAudio } from './linkRecording';
import { getCachedExternalMediaBlob } from './externalMediaAudioCache';
import { prepareMediaAnalysisSource } from './prepareMediaAnalysisSource';

describe('prepareMediaAnalysisSource', function() {
  beforeEach(function() {
    resolveRecordingLinkAudio.mockReset();
    getCachedExternalMediaBlob.mockReset();
    getCachedExternalMediaBlob.mockResolvedValue(null);
  });

  test('returns non-recording sources unchanged', async function() {
    const source = { id: 'link-0', kind: 'link', srcType: 'audio', src: 'https://example.com/a.mp3' };
    const prepared = await prepareMediaAnalysisSource(source, { id: 't1', links: [] }, {});
    expect(prepared).toBe(source);
  });

  test('attaches play-range bounds for remote youtube instead of browser trim', async function() {
    const source = {
      id: 'link-0',
      kind: 'link',
      srcType: 'youtube',
      src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      label: 'Copper Kettle',
      linkIndex: 0,
    };
    const tune = {
      id: 't1',
      links: [{ link: source.src, title: 'Copper Kettle', startAt: '12.5', endAt: '200' }],
    };
    const prepared = await prepareMediaAnalysisSource(source, tune, {});
    expect(prepared.src).toBe(source.src);
    expect(prepared.srcType).toBe('youtube');
    expect(prepared.startAt).toBe(12.5);
    expect(prepared.endAt).toBe(200);
    expect(prepared.blob).toBeUndefined();
  });

  test('does not attach play-range bounds for MIDI files', async function() {
    const source = {
      id: 'link-0',
      kind: 'link',
      srcType: 'midifile',
      src: 'https://example.com/tune.mid',
      label: 'MIDI',
      linkIndex: 0,
    };
    const tune = {
      id: 't1',
      links: [{ link: source.src, title: 'MIDI', startAt: '12.5', endAt: '200' }],
    };
    const prepared = await prepareMediaAnalysisSource(source, tune, {});
    expect(prepared).toBe(source);
    expect(prepared.startAt).toBeUndefined();
    expect(prepared.endAt).toBeUndefined();
  });

  test('resolves recording sources to blob uploads', async function() {
    const blob = { type: 'audio/mpeg' };
    resolveRecordingLinkAudio.mockResolvedValue({ blob: blob, duration: 10, source: 'cache' });

    const tune = {
      id: 't1',
      links: [{ link: 'abcbook-recording:rec1', title: 'My Song' }],
    };
    const source = {
      id: 'link-0',
      kind: 'link',
      srcType: 'recording',
      src: 'abcbook-recording:rec1',
      label: 'My Song',
      linkIndex: 0,
    };

    const prepared = await prepareMediaAnalysisSource(source, tune, { accessToken: 'token' });
    expect(resolveRecordingLinkAudio).toHaveBeenCalledWith(tune.links[0], 't1', 0, {
      accessToken: 'token',
      driveApi: undefined,
      forPlayback: false,
    });
    expect(prepared).toEqual({
      id: 'link-0',
      kind: 'recording',
      blob: blob,
      fileName: 'My Song.mp3',
      label: 'My Song',
      linkIndex: 0,
    });
  });

  test('uploads cached youtube audio instead of sending the URL to yt-dlp', async function() {
    const blob = { type: 'audio/mpeg' };
    getCachedExternalMediaBlob.mockResolvedValue({ blob: blob, duration: 180 });
    const source = {
      id: 'link-0',
      kind: 'link',
      srcType: 'youtube',
      src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      label: 'Copper Kettle',
      linkIndex: 0,
    };
    const tune = {
      id: 't1',
      links: [{ link: source.src, title: 'Copper Kettle' }],
    };
    const prepared = await prepareMediaAnalysisSource(source, tune, {});
    expect(prepared).toEqual({
      id: 'link-0',
      kind: 'recording',
      blob: blob,
      fileName: 'Copper Kettle.mp3',
      label: 'Copper Kettle',
      linkIndex: 0,
    });
  });
});
