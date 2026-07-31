import { buildLinkedMediaSource } from './mediaTranscriptionSources';
import { RECORDING_LINK_PREFIX } from './linkRecording';

describe('mediaTranscriptionSources', function() {
  const tunebook = {
    utils: {
      isYoutubeLink: function(url) {
        return /youtu\.?be/.test(url);
      },
    },
  };

  test('buildLinkedMediaSource classifies youtube, audio, and recording links', function() {
    expect(buildLinkedMediaSource({ link: 'https://youtu.be/abc', title: 'Y' }, 0, tunebook)).toEqual({
      id: 'link-0',
      kind: 'link',
      src: 'https://youtu.be/abc',
      srcType: 'youtube',
      label: 'Y',
      detail: 'https://youtu.be/abc',
      linkIndex: 0,
    });

    expect(buildLinkedMediaSource({ link: 'https://example.com/a.mp3', title: 'A' }, 1, tunebook)).toMatchObject({
      srcType: 'audio',
      linkIndex: 1,
    });

    expect(buildLinkedMediaSource({
      link: RECORDING_LINK_PREFIX + 'rec1',
      title: 'Rec',
    }, 2, tunebook)).toMatchObject({
      srcType: 'recording',
      linkIndex: 2,
    });

    expect(buildLinkedMediaSource({
      link: { link: RECORDING_LINK_PREFIX + 'rec2', recordingId: 'rec2' },
      title: 'Nested rec',
    }, 3, tunebook)).toMatchObject({
      src: RECORDING_LINK_PREFIX + 'rec2',
      srcType: 'recording',
      linkIndex: 3,
    });
  });
});
