import { saveBlobToDevice } from './nativeFileSave';
import { SoundTouch, SimpleFilter, WebAudioBufferSource } from 'soundtouchjs';
import {
  clamp,
  combinedPitchSemitones,
  TEMPO_MIN,
  TEMPO_MAX,
} from './pitchTempoUtils';
import { mixStemBuffersOffline, loadStemBuffersForSource } from './nativeFilteredMedia';
import MP3Converter from './MP3Converter';

const RENDER_CHUNK_SIZE = 4096;

function shouldUseDirectTempo(pitch, fineTune) {
  return Math.abs(combinedPitchSemitones(pitch, fineTune)) < 0.0001;
}

async function renderDirectTempo(buffer, tempo) {
  const rate = clamp(tempo > 0 ? tempo : 1, TEMPO_MIN, TEMPO_MAX);
  const sampleRate = buffer.sampleRate || 44100;
  const outLength = Math.max(1, Math.ceil(buffer.length / rate));
  const offline = new OfflineAudioContext(buffer.numberOfChannels || 2, outLength, sampleRate);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = rate;
  source.connect(offline.destination);
  source.start(0);
  return offline.startRendering();
}

function renderWithSoundTouch(buffer, tempo, pitch, fineTune) {
  const soundtouch = new SoundTouch();
  soundtouch.tempo = clamp(tempo > 0 ? tempo : 1, TEMPO_MIN, TEMPO_MAX);
  soundtouch.pitchSemitones = combinedPitchSemitones(pitch, fineTune);

  const source = new WebAudioBufferSource(buffer);
  let ended = false;
  const filter = new SimpleFilter(source, soundtouch, function() {
    ended = true;
  });

  const temp = new Float32Array(RENDER_CHUNK_SIZE * 2);
  const leftParts = [];
  const rightParts = [];
  let totalFrames = 0;

  while (!ended) {
    const extracted = filter.extract(temp, RENDER_CHUNK_SIZE);
    if (!extracted) break;
    const left = new Float32Array(extracted);
    const right = new Float32Array(extracted);
    for (let i = 0; i < extracted; i += 1) {
      left[i] = temp[i * 2];
      right[i] = temp[i * 2 + 1];
    }
    leftParts.push(left);
    rightParts.push(right);
    totalFrames += extracted;
  }

  const sampleRate = buffer.sampleRate || 44100;
  const out = new AudioBuffer({
    length: Math.max(1, totalFrames),
    numberOfChannels: 2,
    sampleRate: sampleRate,
  });
  const outLeft = out.getChannelData(0);
  const outRight = out.getChannelData(1);
  let offset = 0;
  for (let part = 0; part < leftParts.length; part += 1) {
    outLeft.set(leftParts[part], offset);
    outRight.set(rightParts[part], offset);
    offset += leftParts[part].length;
  }
  return out;
}

export async function applyPlaybackSettingsOffline(buffer, settings) {
  if (!buffer) {
    throw new Error('No audio buffer to process');
  }
  const tempo = settings && settings.tempo > 0 ? settings.tempo : 1;
  const pitch = settings && settings.pitch ? settings.pitch : 0;
  const fineTune = settings && settings.fineTune ? settings.fineTune : 0;
  if (shouldUseDirectTempo(pitch, fineTune)) {
    return renderDirectTempo(buffer, tempo);
  }
  return renderWithSoundTouch(buffer, tempo, pitch, fineTune);
}

export async function buildProcessedMediaBlob(cacheOptions, settings) {
  const loaded = await loadStemBuffersForSource(cacheOptions, {
    allowNetworkSeparation: false,
  });
  if (!loaded || !loaded.stemBuffers) {
    throw new Error('Stems are not available for this track');
  }

  const mixed = mixStemBuffersOffline(loaded.stemBuffers, settings.audioFilters);
  if (!mixed) {
    throw new Error('Stem mix produced no audio');
  }

  const processed = await applyPlaybackSettingsOffline(mixed, settings);
  const converter = new MP3Converter();
  const blob = await converter.convertAudioBuffer(processed);
  return {
    blob: blob,
    duration: processed.duration,
    separation: loaded.separation,
  };
}

export function triggerBlobDownload(blob, filename) {
  saveBlobToDevice(blob, filename).catch(function(err) {
    console.warn('download failed', err);
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.setAttribute('download', filename);
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);
  });
}

export async function downloadProcessedMediaBlob(cacheOptions, settings, filename) {
  const result = await buildProcessedMediaBlob(cacheOptions, settings);
  triggerBlobDownload(result.blob, filename);
  return result;
}
