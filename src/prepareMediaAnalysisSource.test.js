jest.mock('./linkRecording', function() {
  return {
    resolveRecordingLinkAudio: jest.fn(),
  };
});

import { resolveRecordingLinkAudio } from './linkRecording';
import { prepareMediaAnalysisSource } from './prepareMediaAnalysisSource';

describe('prepareMediaAnalysisSource', function() {
  beforeEach(function() {
    resolveRecordingLinkAudio.mockReset();
  });

  test('returns non-recording sources unchanged', async function() {
    const source = { id: 'link-0', kind: 'link', srcType: 'audio', src: 'https://example.com/a.mp3' };
    const prepared = await prepareMediaAnalysisSource(source, { id: 't1', links: [] }, {});
    expect(prepared).toBe(source);
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
    });
  });
});
