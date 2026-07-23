import StemLiveMixer from './stemLiveMixer';

function makeFakeContext() {
  const destination = { connect: jest.fn() };
  return {
    sampleRate: 44100,
    currentTime: 10,
    state: 'running',
    destination: destination,
    createGain: jest.fn(function() {
      return { gain: { value: 1 }, connect: jest.fn(), disconnect: jest.fn() };
    }),
    createBufferSource: jest.fn(function() {
      return {
        buffer: null,
        playbackRate: { value: 1 },
        connect: jest.fn(),
        disconnect: jest.fn(),
        onended: null,
        start: jest.fn(),
        stop: jest.fn(),
      };
    }),
  };
}

function makeBuffer(durationSec) {
  return {
    duration: durationSec,
    sampleRate: 44100,
    numberOfChannels: 2,
    length: Math.ceil(durationSec * 44100),
    getChannelData: function() { return new Float32Array(8); },
  };
}

describe('StemLiveMixer', function() {
  test('setFilters updates gain without restarting sources', function() {
    const ctx = makeFakeContext();
    const mixer = new StemLiveMixer(ctx);
    mixer.setStemBuffers({
      vocals: makeBuffer(10),
      drums: makeBuffer(10),
    });
    mixer.setFilters({ percussion: 1, vocals: 1, bass: 1, other: 1 });
    mixer.connect();

    const createCount = ctx.createBufferSource.mock.calls.length;
    mixer.setFilters({ percussion: 1, vocals: 0.5, bass: 1, other: 1 });
    expect(ctx.createBufferSource.mock.calls.length).toBe(createCount);
    expect(mixer.isConnected()).toBe(true);
  });

  test('maps vocal stem alias to vocals filter', function() {
    const ctx = makeFakeContext();
    const mixer = new StemLiveMixer(ctx);
    mixer.setStemBuffers({
      vocal: makeBuffer(10),
      drums: makeBuffer(10),
    });
    mixer.setFilters({ percussion: 1, vocals: 0, bass: 1, other: 1 });
    mixer.connect();

    expect(mixer._gainNodes.vocals.gain.value).toBe(0);
    expect(mixer._gainNodes.drums.gain.value).toBe(1);
  });
});
