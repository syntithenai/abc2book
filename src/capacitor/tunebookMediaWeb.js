import { WebPlugin } from '@capacitor/core';

/**
 * Web stand-in for the Android ExoPlayer plugin, backed by one persistent
 * HTMLAudioElement. A media element (unlike Web Audio) keeps playing when a
 * mobile browser tab is backgrounded or the screen is off, and iOS only lets
 * an element play without a gesture once that same element has been unlocked.
 */

// Shortest valid silent WAV, used to unlock the element inside a user gesture.
const SILENT_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

let sharedAudio = null;
let unlocked = false;

function getAudioCtor() {
  return typeof Audio !== 'undefined' ? Audio : null;
}

export function getHostedAudioElement(AudioCtor) {
  if (sharedAudio) return sharedAudio;
  const Ctor = AudioCtor || getAudioCtor();
  if (!Ctor) return null;
  sharedAudio = new Ctor();
  sharedAudio.preload = 'auto';
  // Tempo changes use playbackRate; keep pitch (webkit prefix for older Safari).
  sharedAudio.preservesPitch = true;
  sharedAudio.webkitPreservesPitch = true;
  if (typeof sharedAudio.setAttribute === 'function') {
    sharedAudio.setAttribute('playsinline', '');
  }
  if (typeof sharedAudio.addEventListener === 'function') {
    sharedAudio.addEventListener('playing', function() { unlocked = true; });
  }
  return sharedAudio;
}

/** Call from a click/tap handler before async work so later loads may autoplay. */
export function unlockHostedAudioElement() {
  if (unlocked) return Promise.resolve(true);
  const el = getHostedAudioElement();
  if (!el) return Promise.resolve(false);
  // Never clobber a loaded track; it will unlock on its own first play.
  if (el.src && el.src !== SILENT_WAV_DATA_URI) return Promise.resolve(false);
  try {
    el.src = SILENT_WAV_DATA_URI;
    const result = el.play();
    const done = function() {
      unlocked = true;
      try { el.pause(); } catch (e) {}
      return true;
    };
    if (result && typeof result.then === 'function') {
      return result.then(done).catch(function() { return false; });
    }
    return Promise.resolve(done());
  } catch (e) {
    return Promise.resolve(false);
  }
}

export function resetHostedAudioElementForTests() {
  sharedAudio = null;
  unlocked = false;
}

export class TunebookMediaWeb extends WebPlugin {
  constructor(options) {
    super();
    const opts = options || {};
    this._AudioCtor = opts.Audio || null;
    this._loadGeneration = 0;
    this._hasMedia = false;
    this._boundEl = null;
  }

  _el() {
    const el = getHostedAudioElement(this._AudioCtor);
    if (el && this._boundEl !== el) this._bind(el);
    return el;
  }

  _bind(el) {
    this._boundEl = el;
    const self = this;
    const emitState = function() { self._emitState(); };
    ['playing', 'pause', 'loadedmetadata', 'durationchange', 'seeked', 'ratechange'].forEach(function(name) {
      el.addEventListener(name, emitState);
    });
    el.addEventListener('ended', function() {
      if (!self._hasMedia) return;
      self._emitState();
      self.notifyListeners('ended', {});
    });
    el.addEventListener('error', function() {
      if (!self._hasMedia) return;
      const err = el.error;
      self.notifyListeners('error', {
        message: err && err.message ? err.message : ('Audio error' + (err && err.code ? ' ' + err.code : '')),
      });
    });
  }

  _snapshot() {
    const el = this._boundEl;
    if (!el || !this._hasMedia) {
      return { isPlaying: false, positionMs: 0, durationMs: 0, hasMedia: false };
    }
    const dur = el.duration;
    return {
      isPlaying: !el.paused && !el.ended,
      positionMs: Math.max(0, Math.round((el.currentTime || 0) * 1000)),
      durationMs: dur > 0 && isFinite(dur) ? Math.round(dur * 1000) : 0,
      hasMedia: true,
    };
  }

  _emitState() {
    this.notifyListeners('stateChange', this._snapshot());
  }

  async load(options) {
    const opts = options || {};
    if (!opts.uri) throw new Error('uri is required for web playback');
    const el = this._el();
    if (!el) throw new Error('Audio playback is not available in this browser');
    const generation = ++this._loadGeneration;
    const self = this;
    this._hasMedia = true;
    el.src = opts.uri;
    const startSec = opts.positionMs > 0 ? opts.positionMs / 1000 : 0;
    await new Promise(function(resolve, reject) {
      function cleanup() {
        el.removeEventListener('loadedmetadata', onReady);
        el.removeEventListener('error', onError);
      }
      function onReady() {
        cleanup();
        resolve();
      }
      function onError() {
        cleanup();
        reject(new Error('Could not load audio'));
      }
      if (el.readyState >= 1) {
        resolve();
        return;
      }
      el.addEventListener('loadedmetadata', onReady);
      el.addEventListener('error', onError);
      if (typeof el.load === 'function') el.load();
    });
    if (generation !== this._loadGeneration) {
      throw new Error('Superseded by new load');
    }
    if (startSec > 0) {
      try { el.currentTime = startSec; } catch (e) {}
    }
    if (opts.autoplay !== false) {
      await el.play();
      if (generation !== this._loadGeneration) {
        throw new Error('Superseded by new load');
      }
    }
    self._emitState();
  }

  async play() {
    const el = this._el();
    if (!el || !this._hasMedia) return;
    await el.play();
  }

  async pause() {
    const el = this._el();
    if (!el) return;
    el.pause();
  }

  async seekTo(options) {
    const el = this._el();
    if (!el || !this._hasMedia) return;
    const ms = options && options.positionMs > 0 ? options.positionMs : 0;
    el.currentTime = ms / 1000;
  }

  async setPlaybackSpeed(options) {
    const el = this._el();
    if (!el) return;
    const speed = options && options.speed > 0 ? options.speed : 1;
    el.playbackRate = speed;
  }

  async getState() {
    this._el();
    return this._snapshot();
  }

  async stop() {
    this._loadGeneration += 1;
    const el = this._el();
    this._hasMedia = false;
    if (!el) return;
    el.pause();
    el.removeAttribute('src');
    if (typeof el.load === 'function') {
      try { el.load(); } catch (e) {}
    }
    this._emitState();
  }

  async getBatteryOptimizationStatus() {
    return { ignoringOptimizations: true };
  }

  async openBatterySettings() {}
}
