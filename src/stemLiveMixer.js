import {
  AUDIO_FILTER_KEYS,
  DEFAULT_AUDIO_FILTERS,
  STEM_NAME_BY_FILTER,
  audioFiltersAreNeutral,
  canonicalStemName,
  normalizeStemBufferMap,
} from './pitchTempoUtils';
import { resampleBufferToContextRate } from './audioStemMixer';

function resolveStemGain(audioFilters, filterKey) {
  const value = audioFilters && audioFilters[filterKey] !== undefined
    ? parseFloat(audioFilters[filterKey])
    : DEFAULT_AUDIO_FILTERS[filterKey];
  return isFinite(value) ? Math.max(0, value) : 1;
}

function filterKeyForStemName(stemName) {
  const canonical = canonicalStemName(stemName);
  for (let i = 0; i < AUDIO_FILTER_KEYS.length; i += 1) {
    const key = AUDIO_FILTER_KEYS[i];
    if (STEM_NAME_BY_FILTER[key] === canonical) {
      return key;
    }
  }
  return null;
}

// Real-time stem playback: each stem is a BufferSource + GainNode so slider
// changes only adjust gain and never restart the transport.
export default class StemLiveMixer {
  constructor(audioContext, onTimeUpdate, onEnded) {
    this.audioContext = audioContext;
    this.onTimeUpdate = onTimeUpdate || null;
    this.onEnded = onEnded || null;
    this._stemBuffers = null;
    this._playbackBuffers = {};
    this._gainNodes = {};
    this._outputGain = audioContext.createGain();
    this._outputGain.gain.value = 1;
    this._sources = [];
    this._connected = false;
    this._startOffset = 0;
    this._startContextTime = 0;
    this._tempo = 1;
    this._stopIntent = false;
    this._duration = 0;
    this._audioFilters = null;
    this._timeUpdateTimer = null;
    this._endedStemCount = 0;
    this._activeStemCount = 0;
  }

  get duration() {
    return this._duration;
  }

  hasPlaybackBuffers() {
    return Object.keys(this._playbackBuffers).length > 0;
  }

  isActive() {
    return !!(this._stemBuffers && this._audioFilters && !audioFiltersAreNeutral(this._audioFilters));
  }

  setStemBuffers(stemBuffers) {
    this._stopSources();
    this._stemBuffers = normalizeStemBufferMap(stemBuffers);
    this._playbackBuffers = {};
    this._duration = 0;
    if (!this._stemBuffers || Object.keys(this._stemBuffers).length === 0) {
      this._rebuildGainNodes();
      return;
    }

    let maxDuration = 0;
    Object.keys(this._stemBuffers).forEach((stemName) => {
      const buffer = this._stemBuffers[stemName];
      if (!buffer) return;
      const playbackBuffer = resampleBufferToContextRate(this.audioContext, buffer);
      this._playbackBuffers[stemName] = playbackBuffer;
      const rate = playbackBuffer.sampleRate || this.audioContext.sampleRate;
      maxDuration = Math.max(maxDuration, playbackBuffer.length / rate);
    });
    this._duration = maxDuration;
    this._rebuildGainNodes();
  }

  setFilters(audioFilters) {
    this._audioFilters = audioFilters;
    this._applyGainValues();
  }

  setTempo(tempo) {
    const next = tempo > 0 ? tempo : 1;
    if (Math.abs(next - this._tempo) < 0.0001) {
      return;
    }
    const ratio = this.getPlaybackRatio();
    this._tempo = next;
    if (this._connected) {
      this.seek(ratio);
    }
  }

  setOutputVolume(volume) {
    const next = parseFloat(volume);
    this._outputGain.gain.value = isNaN(next) ? 1 : Math.max(0, Math.min(1, next));
  }

  _rebuildGainNodes() {
    Object.keys(this._gainNodes).forEach((stemName) => {
      try { this._gainNodes[stemName].disconnect(); } catch (e) {}
    });
    this._gainNodes = {};
    Object.keys(this._playbackBuffers).forEach((stemName) => {
      const gain = this.audioContext.createGain();
      gain.connect(this._outputGain);
      this._gainNodes[stemName] = gain;
    });
    this._applyGainValues();
  }

  _applyGainValues() {
    const filters = this._audioFilters || DEFAULT_AUDIO_FILTERS;
    AUDIO_FILTER_KEYS.forEach((filterKey) => {
      const stemName = STEM_NAME_BY_FILTER[filterKey];
      const gainNode = this._gainNodes[stemName];
      if (!gainNode) return;
      gainNode.gain.value = resolveStemGain(filters, filterKey);
    });
  }

  connect() {
    if (this._connected) return true;
    this._outputGain.connect(this.audioContext.destination);
    this._startSources();
    this._connected = true;
    this._startTimeUpdates();
    return true;
  }

  disconnect() {
    this._stopTimeUpdates();
    this._stopSources();
    try { this._outputGain.disconnect(); } catch (e) {}
    this._connected = false;
  }

  isConnected() {
    return this._connected;
  }

  hasActiveSources() {
    return this._activeStemCount > 0;
  }

  seek(ratio) {
    const clamped = Math.max(0, Math.min(1, ratio || 0));
    const wasConnected = this._connected;
    if (wasConnected) {
      this._captureOffset();
      this._stopSources();
    }
    this._startOffset = clamped * this._duration;
    this._startContextTime = this.audioContext.currentTime;
    if (wasConnected) {
      this._startSources();
    }
  }

  seekSeconds(seconds) {
    if (!this._duration) return;
    this.seek(seconds / this._duration);
  }

  getPlaybackRatio() {
    if (!this._duration) return 0;
    if (!this._connected) {
      return Math.min(1, Math.max(0, this._startOffset / this._duration));
    }
    const elapsed = Math.max(0, this.audioContext.currentTime - this._startContextTime) * this._tempo;
    return Math.min(1, Math.max(0, (this._startOffset + elapsed) / this._duration));
  }

  getPlaybackSeconds() {
    return this.getPlaybackRatio() * this._duration;
  }

  _captureOffset() {
    this._startOffset = this.getPlaybackSeconds();
    this._startContextTime = this.audioContext.currentTime;
  }

  _stopSources() {
    this._stopIntent = true;
    this._sources.forEach((source) => {
      try { source.stop(); } catch (e) {}
      try { source.disconnect(); } catch (e) {}
    });
    this._sources = [];
    this._endedStemCount = 0;
    this._activeStemCount = 0;
    this._stopIntent = false;
  }

  _startSources() {
    if (!this._stemBuffers) return;
    this._stopSources();
    this._stopIntent = false;

    const offset = Math.min(
      Math.max(0, this._startOffset),
      Math.max(0, this._duration - 0.001)
    );
    const stemNames = Object.keys(this._playbackBuffers);
    this._activeStemCount = 0;

    stemNames.forEach((stemName) => {
      const buffer = this._playbackBuffers[stemName];
      const gainNode = this._gainNodes[stemName];
      if (!buffer || !gainNode) return;

      const filterKey = filterKeyForStemName(stemName);
      const gain = filterKey ? resolveStemGain(this._audioFilters, filterKey) : 1;
      gainNode.gain.value = gain;

      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = this._tempo;
      source.connect(gainNode);
      source.onended = () => {
        if (this._stopIntent) return;
        this._endedStemCount += 1;
        if (this._endedStemCount >= this._activeStemCount && this.onEnded) {
          this.onEnded();
        }
      };

      const remaining = Math.max(0, this._duration - offset);
      if (remaining <= 0.001) return;
      const startAt = Math.min(offset, Math.max(0, buffer.duration - 0.001));
      source.start(0, startAt, remaining);
      this._sources.push(source);
      this._activeStemCount += 1;
    });

    this._startContextTime = this.audioContext.currentTime;
    this._startOffset = offset;
  }

  _startTimeUpdates() {
    this._stopTimeUpdates();
    this._timeUpdateTimer = setInterval(() => {
      if (!this._connected || !this.onTimeUpdate) return;
      const seconds = this.getPlaybackSeconds();
      const ratio = this.getPlaybackRatio();
      this.onTimeUpdate(seconds, ratio);
    }, 250);
  }

  _stopTimeUpdates() {
    if (this._timeUpdateTimer) {
      clearInterval(this._timeUpdateTimer);
      this._timeUpdateTimer = null;
    }
  }

  destroy() {
    this.disconnect();
    Object.keys(this._gainNodes).forEach((stemName) => {
      try { this._gainNodes[stemName].disconnect(); } catch (e) {}
    });
    this._gainNodes = {};
    this._stemBuffers = null;
    this._playbackBuffers = {};
  }
}
