import {
  checkAacEncodeSupported,
  coerceAudioCompressFormat,
  encodeAudioBuffer,
  getAudioCompressCapabilities,
  isMediaRecorderAacSupported,
  pickMediaRecorderAacMimeType,
  resetAudioCompressCapabilityCache,
} from './audioCompressEncode';

jest.mock('./MP3Converter', function() {
  function MP3ConverterMock() {
    this.convertAudioBuffer = jest.fn(function() {
      return Promise.resolve(new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' }));
    });
  }
  return MP3ConverterMock;
});

function makeAudioBuffer(options) {
  const opts = options || {};
  const length = opts.length || 128;
  const sampleRate = opts.sampleRate || 44100;
  const numberOfChannels = opts.numberOfChannels || 1;
  const channels = [];
  for (let ch = 0; ch < numberOfChannels; ch += 1) {
    channels.push(new Float32Array(length));
  }
  return {
    length: length,
    sampleRate: sampleRate,
    numberOfChannels: numberOfChannels,
    duration: length / sampleRate,
    getChannelData: function(ch) {
      return channels[ch];
    },
  };
}

describe('audioCompressEncode', function() {
  beforeEach(function() {
    resetAudioCompressCapabilityCache();
  });

  test('encodes wav', async function() {
    const result = await encodeAudioBuffer(makeAudioBuffer(), 'wav');
    expect(result.format).toBe('wav');
    expect(result.extension).toBe('wav');
    expect(result.mimeType).toBe('audio/wav');
    expect(result.blob.type).toBe('audio/wav');
  });

  test('encodes mp3 via MP3Converter', async function() {
    const result = await encodeAudioBuffer(makeAudioBuffer(), 'mp3');
    expect(result.format).toBe('mp3');
    expect(result.extension).toBe('mp3');
    expect(result.mimeType).toBe('audio/mpeg');
  });

  test('falls back to mp3 when aac is unsupported', async function() {
    const originalEncoder = window.AudioEncoder;
    const originalIsTypeSupported = window.MediaRecorder && window.MediaRecorder.isTypeSupported;
    delete window.AudioEncoder;
    if (window.MediaRecorder) {
      window.MediaRecorder.isTypeSupported = function() { return false; };
    }
    try {
      resetAudioCompressCapabilityCache();
      const supported = await checkAacEncodeSupported();
      expect(supported).toBe(false);
      const result = await encodeAudioBuffer(makeAudioBuffer(), 'aac');
      expect(result.format).toBe('mp3');
      expect(result.extension).toBe('mp3');
    } finally {
      if (originalEncoder) {
        window.AudioEncoder = originalEncoder;
      } else {
        delete window.AudioEncoder;
      }
      if (window.MediaRecorder && originalIsTypeSupported) {
        window.MediaRecorder.isTypeSupported = originalIsTypeSupported;
      }
      resetAudioCompressCapabilityCache();
    }
  });

  test('coerceAudioCompressFormat downgrades unavailable aac to mp3', function() {
    expect(coerceAudioCompressFormat('aac', { wav: true, mp3: true, aac: false })).toBe('mp3');
    expect(coerceAudioCompressFormat('aac', { wav: true, mp3: true, aac: true })).toBe('aac');
    expect(coerceAudioCompressFormat('wav', { wav: true, mp3: true, aac: false })).toBe('wav');
  });

  test('getAudioCompressCapabilities includes aac when MediaRecorder supports mp4', async function() {
    const originalEncoder = window.AudioEncoder;
    delete window.AudioEncoder;
    const originalIsTypeSupported = window.MediaRecorder && window.MediaRecorder.isTypeSupported;
    if (!window.MediaRecorder) {
      window.MediaRecorder = function() {};
    }
    window.MediaRecorder.isTypeSupported = function(type) {
      return type === 'audio/mp4';
    };
    try {
      resetAudioCompressCapabilityCache();
      expect(pickMediaRecorderAacMimeType()).toBe('audio/mp4');
      expect(isMediaRecorderAacSupported()).toBe(true);
      const capabilities = await getAudioCompressCapabilities();
      expect(capabilities).toEqual({ wav: true, mp3: true, aac: true });
    } finally {
      if (originalEncoder) {
        window.AudioEncoder = originalEncoder;
      } else {
        delete window.AudioEncoder;
      }
      if (originalIsTypeSupported) {
        window.MediaRecorder.isTypeSupported = originalIsTypeSupported;
      }
      resetAudioCompressCapabilityCache();
    }
  });
});
