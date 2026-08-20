jest.mock('soundtouchjs', function() {
  function MockPitchShifter() {
    this.tempo = 1;
    this.pitchSemitones = 0;
    this.percentagePlayed = 0;
    this.timePlayed = 0;
    this.connect = jest.fn();
    this.disconnect = jest.fn();
    this.off = jest.fn();
    this.on = jest.fn();
  }
  return { PitchShifter: MockPitchShifter };
});

import PitchTempoShifter from './pitchTempoShifter';

function makeAudioContext() {
  let sourceCount = 0;
  return {
    currentTime: 10,
    destination: {},
    createGain: function() {
      return {
        gain: { value: 1 },
        connect: jest.fn(),
        disconnect: jest.fn(),
      };
    },
    createBufferSource: function() {
      sourceCount += 1;
      const source = {
        buffer: null,
        playbackRate: { value: 1 },
        connect: jest.fn(),
        disconnect: jest.fn(),
        stop: jest.fn(),
        onended: null,
        start: jest.fn(),
      };
      source._id = sourceCount;
      return source;
    },
  };
}

function makeBuffer(duration) {
  return { duration: duration || 10 };
}

describe('PitchTempoShifter seek', function() {
  test('seek while connected in direct mode clears connected state', function() {
    const ctx = makeAudioContext();
    const shifter = new PitchTempoShifter(ctx, makeBuffer(), null, null, null);
    shifter.applySettings(1, 0, 0);
    expect(shifter.connect()).toBe(true);
    expect(shifter.isConnected()).toBe(true);

    shifter.seek(0.5);

    expect(shifter.isConnected()).toBe(false);
    expect(shifter.connect()).toBe(true);
    expect(shifter.isConnected()).toBe(true);
  });

  test('getCurrentTime tracks direct-mode buffer playhead', function() {
    const ctx = makeAudioContext();
    const shifter = new PitchTempoShifter(ctx, makeBuffer(10), null, null, null);
    shifter.applySettings(1, 0, 0);
    expect(shifter.connect()).toBe(true);
    expect(shifter.getCurrentTime()).toBeCloseTo(0);
    ctx.currentTime = 10.5;
    expect(shifter.getCurrentTime()).toBeCloseTo(0.5);
  });
});

describe('PitchTempoShifter live pitch', function() {
  test('changing pitch while SoundTouch is running does not reconnect', function() {
    const ctx = makeAudioContext();
    const shifter = new PitchTempoShifter(ctx, makeBuffer(10), null, null, null);
    shifter.applySettings(1, 2, 0);
    expect(shifter.connect()).toBe(true);
    shifter.shifter.connect.mockClear();
    shifter.shifter.disconnect.mockClear();

    shifter.applySettings(1, 5, 0);

    expect(shifter.isConnected()).toBe(true);
    expect(shifter.shifter.disconnect).not.toHaveBeenCalled();
    expect(shifter.shifter.connect).not.toHaveBeenCalled();
    expect(shifter.shifter.pitchSemitones).toBe(5);
  });

  test('returning to pitch 0 while SoundTouch is running stays connected', function() {
    const ctx = makeAudioContext();
    const shifter = new PitchTempoShifter(ctx, makeBuffer(10), null, null, null);
    shifter.applySettings(1, 2, 0);
    expect(shifter.connect()).toBe(true);
    shifter.shifter.disconnect.mockClear();

    shifter.applySettings(1, 0, 0);

    expect(shifter.isConnected()).toBe(true);
    expect(shifter.shifter.disconnect).not.toHaveBeenCalled();
    expect(shifter.shifter.pitchSemitones).toBe(0);
  });
});
