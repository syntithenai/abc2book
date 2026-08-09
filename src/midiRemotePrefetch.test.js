import { enrichPayloadWithMidiPrefetch } from './midiRemotePrefetch';

jest.mock('./midiLinkResolve', function() {
  return {
    resolveMidiLinkPlaybackData: jest.fn(),
  };
});

import { resolveMidiLinkPlaybackData } from './midiLinkResolve';

describe('midiRemotePrefetch', function() {
  beforeEach(function() {
    resolveMidiLinkPlaybackData.mockReset();
  });

  test('skips when midiBase64 already present', async function() {
    const payload = { sourceType: 'midifile', midiBase64: 'abc' };
    const result = await enrichPayloadWithMidiPrefetch(payload, {});
    expect(result).toBe(payload);
    expect(resolveMidiLinkPlaybackData).not.toHaveBeenCalled();
  });

  test('attaches midiBase64 for midifile links', async function() {
    const midiBytes = new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06]);
    resolveMidiLinkPlaybackData.mockResolvedValue({
      arrayBuffer: midiBytes.buffer,
      duration: 10,
      source: 'local',
    });
    const tune = { id: 't1', links: [{ link: 'abcbook-recording:rec1', mediaKind: 'midi' }] };
    const mediaController = {
      tune: tune,
      mediaLinkNumber: 0,
      getLinkedMediaResolveOptions: function() { return { accessToken: 'tok' }; },
    };
    const result = await enrichPayloadWithMidiPrefetch({
      source: 'abcbook-recording:rec1',
      sourceType: 'midifile',
    }, mediaController);
    expect(result.midiBase64).toBeTruthy();
    expect(resolveMidiLinkPlaybackData).toHaveBeenCalled();
  });
});
