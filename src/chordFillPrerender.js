import abcjs from 'abcjs';
import { buildChordFillAbc, chordFillCacheKey } from './chordFillPattern';
import { getPlaybackSoundFontPlan, getSoundFontVolumeMultiplier } from './soundFontConfig';
import { remapFlattenedMidiPrograms } from './localSoundfontInstrumentMap';

const ORIGINAL_SOUNDFONT_CDN = 'https://paulrosen.github.io/midi-js-soundfonts/abcjs/';

function clearAbcjsSoundsCache() {
  try {
    // Rejected note loads are cached forever; clear so a soundfont retry can succeed.
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const cache = require('abcjs/src/synth/sounds-cache');
    if (!cache || typeof cache !== 'object') return;
    Object.keys(cache).forEach(function(instrument) {
      delete cache[instrument];
    });
  } catch (err) { /* ignore — cache clear is best-effort */ }
}

function renderFillVisual(abc) {
  if (typeof document === 'undefined') return null;
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;padding:0;margin:-1px;';
  document.body.appendChild(host);
  try {
    const visualObjs = abcjs.renderAbc(host, abc, {
      add_classes: false,
      responsive: undefined,
    });
    return visualObjs && visualObjs[0] ? visualObjs[0] : null;
  } finally {
    if (host.parentNode) host.parentNode.removeChild(host);
  }
}

async function primeSingleFill(abc, audioContext, soundFontPlan) {
  const visualObj = renderFillVisual(abc);
  if (!visualObj) {
    throw new Error('ABC render produced no visual object');
  }

  const msPerMeasure = visualObj.millisecondsPerMeasure();
  if (!(msPerMeasure > 0)) {
    throw new Error('Invalid millisecondsPerMeasure from fill ABC');
  }

  const synth = new abcjs.synth.CreateSynth();
  const initOptions = {
    audioContext: audioContext,
    millisecondsPerMeasure: msPerMeasure,
    options: {
      soundFontUrl: soundFontPlan.url,
      soundFontVolumeMultiplier: getSoundFontVolumeMultiplier(),
      chordsOff: false,
      // Avoid abcjs default 200ms fade tail — it makes looped fills drift from the metronome.
      fadeLength: 0,
      noteEnd: 0,
    },
  };
  if (soundFontPlan.remap) {
    const flattened = visualObj.setUpAudio({});
    remapFlattenedMidiPrograms(flattened);
    initOptions.sequence = flattened;
  } else {
    initOptions.visualObj = visualObj;
  }
  await synth.init(initOptions);

  const primeResult = await synth.prime();
  const buffer = typeof synth.getAudioBuffer === 'function'
    ? synth.getAudioBuffer()
    : (synth.audioBuffers && synth.audioBuffers[0] ? synth.audioBuffers[0] : null);

  try {
    synth.stop();
  } catch (err) { /* ignore */ }

  if (!buffer || !(buffer.duration > 0)) {
    const status = primeResult && primeResult.status ? String(primeResult.status) : 'unknown';
    throw new Error('Prime returned empty audio buffer (status=' + status + ')');
  }
  return buffer;
}

function soundFontCandidates() {
  const plan = getPlaybackSoundFontPlan({});
  const list = [{ url: plan.url, plan: plan }];
  if (plan.bank !== 'online') {
    list.push({
      url: 'https://paulrosen.github.io/midi-js-soundfonts/MusyngKite/',
      plan: { url: 'https://paulrosen.github.io/midi-js-soundfonts/MusyngKite/', remap: false, bank: 'online' },
    });
  }
  list.push({
    url: ORIGINAL_SOUNDFONT_CDN,
    plan: { url: ORIGINAL_SOUNDFONT_CDN, remap: true, bank: 'selection' },
  });
  return list;
}

async function primeSingleFillWithFallback(abc, audioContext) {
  const candidates = soundFontCandidates();
  let lastError = null;
  for (let i = 0; i < candidates.length; i += 1) {
    try {
      if (i > 0) clearAbcjsSoundsCache();
      return await primeSingleFill(
        abc,
        audioContext,
        candidates[i].plan
      );
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Could not prime chord fill');
}

/**
 * Build a simple oscillator chord fill when soundfonts are unavailable.
 * Keeps recording usable offline / when CDN is blocked.
 */
function synthesizeFallbackFill(audioContext, chordLabel, options) {
  const opts = options || {};
  const tempo = opts.tempo > 0 ? opts.tempo : 120;
  const meter = String(opts.meter || '4/4');
  const beats = Math.max(
    1,
    opts.beatsPerBar > 0 ? opts.beatsPerBar : (parseInt(meter.split('/')[0], 10) || 4)
  );
  const secondsPerBeat = 60 / tempo;
  const durationSec = Math.max(0.25, beats * secondsPerBeat);
  const sampleRate = audioContext.sampleRate || 44100;
  const frameCount = Math.max(1, Math.round(durationSec * sampleRate));
  const buffer = audioContext.createBuffer(1, frameCount, sampleRate);
  const data = buffer.getChannelData(0);

  // Derive a few frequencies from the chord label root (C=261.63).
  const rootMatch = String(chordLabel || 'C').trim().match(/^([A-Ga-g])([#b]?)/);
  const rootMap = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let semitone = 0;
  if (rootMatch) {
    semitone = rootMap[rootMatch[1].toUpperCase()] || 0;
    if (rootMatch[2] === '#') semitone += 1;
    if (rootMatch[2] === 'b') semitone -= 1;
  }
  const isMinor = /m(?!aj)/i.test(String(chordLabel || ''));
  const intervals = isMinor ? [0, 3, 7] : [0, 4, 7];
  const freqs = intervals.map(function(interval) {
    return 261.63 * Math.pow(2, (semitone + interval) / 12);
  });

  const hitBeats = beats <= 1 ? [0] : (beats === 3 ? [0, 1] : [0, Math.floor(beats / 2)]);
  for (let h = 0; h < hitBeats.length; h += 1) {
    const start = Math.floor(hitBeats[h] * secondsPerBeat * sampleRate);
    const hitLen = Math.floor(Math.min(secondsPerBeat * 0.85, durationSec) * sampleRate);
    for (let i = 0; i < hitLen; i += 1) {
      const idx = start + i;
      if (idx >= frameCount) break;
      const t = i / sampleRate;
      const env = Math.exp(-3 * t / Math.max(0.05, hitLen / sampleRate));
      let sample = 0;
      for (let f = 0; f < freqs.length; f += 1) {
        sample += Math.sin(2 * Math.PI * freqs[f] * t) * env;
      }
      data[idx] += sample / freqs.length * 0.35;
    }
  }
  return buffer;
}

export async function primeChordFills(chordLabels, options) {
  const opts = options || {};
  const labels = Array.from(new Set((chordLabels || [])
    .map(function(label) { return String(label || '').trim(); })
    .filter(Boolean)));
  const audioContext = opts.audioContext || new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === 'suspended') {
    try {
      await audioContext.resume();
    } catch (err) { /* continue and let prime report failure */ }
  }

  const buffers = new Map();
  const errors = [];
  let usedFallback = false;

  for (let i = 0; i < labels.length; i += 1) {
    const label = labels[i];
    const cacheKey = chordFillCacheKey(label, opts);
    const abc = buildChordFillAbc(label, opts);
    if (!abc) {
      errors.push({ label: label, error: 'Could not build fill ABC' });
      continue;
    }
    try {
      const buffer = await primeSingleFillWithFallback(abc, audioContext);
      buffers.set(label, buffer);
      buffers.set(cacheKey, buffer);
    } catch (err) {
      try {
        const fallback = synthesizeFallbackFill(audioContext, label, opts);
        buffers.set(label, fallback);
        buffers.set(cacheKey, fallback);
        usedFallback = true;
      } catch (fallbackErr) {
        errors.push({
          label: label,
          error: err && err.message ? err.message : String(err),
        });
      }
    }
  }

  return {
    buffers: buffers,
    audioContext: audioContext,
    errors: errors,
    usedFallback: usedFallback,
  };
}

export function getFillBuffer(buffers, chordLabel, options) {
  if (!buffers) return null;
  const label = String(chordLabel || '').trim();
  if (buffers.get(label)) return buffers.get(label);
  const cacheKey = chordFillCacheKey(label, options || {});
  return buffers.get(cacheKey) || null;
}
