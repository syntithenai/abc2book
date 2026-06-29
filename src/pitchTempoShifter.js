import { PitchShifter } from 'soundtouchjs';
import { clamp, combinedPitchSemitones, TEMPO_MIN, TEMPO_MAX, PITCH_MIN, PITCH_MAX, FINE_TUNE_MIN, FINE_TUNE_MAX } from './pitchTempoUtils';

const BUFFER_SIZE = 16384;

export default class PitchTempoShifter {
  constructor(audioContext, audioBuffer, onTimeUpdate, onEnded) {
    this.audioContext = audioContext;
    this.audioBuffer = audioBuffer;
    this.gainNode = audioContext.createGain();
    this.gainNode.gain.value = 1.0;
    this._onTimeUpdate = onTimeUpdate;
    this._onEnded = onEnded;
    this.shifter = this._createSoundTouchShifter(audioBuffer);
    this._tempo = 1.0;
    this._pitch = 0;
    this._fineTune = 0;
    this._connected = false;
    this._mode = 'direct';
    this._directSource = null;
    this._directStartContextTime = 0;
    this._directStartOffset = 0;
    this._directStopIntent = false;
    this._timeUpdateTimer = null;
  }

  get duration() {
    return this.audioBuffer ? this.audioBuffer.duration : 0;
  }

  getPlaybackRatio() {
    const duration = this.duration;
    if (!duration) return 0;
    if (this._mode === 'direct') {
      return clamp(this._getDirectPlaybackSeconds() / duration, 0, 1);
    }
    return this.shifter ? this.shifter.percentagePlayed / 100 : 0;
  }

  applySettings(tempo, pitchSemitones, fineTuneCents) {
    const wasConnected = this._connected;
    const ratio = this.getPlaybackRatio();
    this._tempo = clamp(tempo, TEMPO_MIN, TEMPO_MAX);
    this._pitch = clamp(pitchSemitones, PITCH_MIN, PITCH_MAX);
    this._fineTune = clamp(fineTuneCents, FINE_TUNE_MIN, FINE_TUNE_MAX);
    const nextMode = this._shouldUseDirectMode() ? 'direct' : 'soundtouch';

    if (wasConnected && nextMode !== this._mode) {
      this.disconnect();
      this._mode = nextMode;
      this.seek(ratio);
      this.connect();
    } else {
      this._mode = nextMode;
      if (this._mode === 'direct' && this._directSource) {
        this._directStartOffset = this._getDirectPlaybackSeconds();
        this._directStartContextTime = this.audioContext.currentTime;
        this._directSource.playbackRate.value = this._tempo;
      } else if (this.shifter) {
        this.shifter.tempo = this._tempo;
        this.shifter.pitchSemitones = combinedPitchSemitones(this._pitch, this._fineTune);
      }
    }

    const compensation = this._mode === 'soundtouch' && this._tempo > 0 ? Math.sqrt(this._tempo) : 1;
    this.gainNode.gain.value = Math.min(2.5, Math.max(0.75, compensation));
  }

  replaceBuffer(audioBuffer, preserveRatio) {
    const ratio = preserveRatio !== false ? this.getPlaybackRatio() : 0;
    const wasConnected = this._connected;
    const settings = this.getState();
    if (this._connected) {
      this.disconnect();
    }
    if (this.shifter) this.shifter.off();
    this.audioBuffer = audioBuffer;
    this.shifter = this._createSoundTouchShifter(audioBuffer);
    this.applySettings(settings.tempo, settings.pitch, settings.fineTune);
    if (ratio > 0) {
      this.seek(ratio);
    }
    if (wasConnected) {
      this.connect();
    }
  }

  getState() {
    return { tempo: this._tempo, pitch: this._pitch, fineTune: this._fineTune };
  }

  connect() {
    if (!this._connected) {
      this._mode = this._shouldUseDirectMode() ? 'direct' : 'soundtouch';
      if (this._mode === 'direct') {
        this._connectDirectSource();
      } else {
        this.shifter.connect(this.gainNode);
      }
      this.gainNode.connect(this.audioContext.destination);
      this._connected = true;
      this._startTimeUpdates();
    }
  }

  isConnected() {
    return this._connected;
  }

  disconnect() {
    if (this._connected) {
      this._stopTimeUpdates();
      if (this._mode === 'direct') {
        this._disconnectDirectSource();
      } else if (this.shifter) {
        this.shifter.disconnect();
      }
      try { this.gainNode.disconnect(); } catch (e) {}
      this._connected = false;
    }
  }

  seek(ratio) {
    const clamped = clamp(ratio, 0, 1);
    if (this._mode === 'direct') {
      const wasConnected = this._connected;
      if (wasConnected) {
        this._disconnectDirectSource();
      }
      this._directStartOffset = clamped * this.duration;
      this._directStartContextTime = this.audioContext.currentTime;
      if (wasConnected) {
        this._connectDirectSource();
      }
      return;
    }
    if (this.shifter) {
      this.shifter.percentagePlayed = clamped;
    }
  }

  destroy() {
    this.disconnect();
    if (this.shifter) this.shifter.off();
  }

  _createSoundTouchShifter(audioBuffer) {
    const shifter = new PitchShifter(
      this.audioContext,
      audioBuffer,
      BUFFER_SIZE,
      this._onEnded || (() => {})
    );
    shifter.on('play', (detail) => {
      if (this._onTimeUpdate) {
        this._onTimeUpdate(detail.timePlayed, detail.percentagePlayed / 100);
      }
    });
    return shifter;
  }

  _shouldUseDirectMode() {
    return Math.abs(combinedPitchSemitones(this._pitch, this._fineTune)) < 0.0001;
  }

  _connectDirectSource() {
    if (!this.audioBuffer) return;
    const source = this.audioContext.createBufferSource();
    source.buffer = this.audioBuffer;
    source.playbackRate.value = this._tempo;
    source.connect(this.gainNode);
    this._directStopIntent = false;
    this._directStartContextTime = this.audioContext.currentTime;
    const offset = Math.min(Math.max(0, this._directStartOffset), Math.max(0, this.duration - 0.001));
    source.onended = () => {
      if (!this._directStopIntent && this._onEnded) {
        this._onEnded();
      }
    };
    source.start(0, offset);
    this._directSource = source;
  }

  _disconnectDirectSource() {
    if (!this._directSource) return;
    this._directStartOffset = this._getDirectPlaybackSeconds();
    this._directStopIntent = true;
    try { this._directSource.stop(); } catch (e) {}
    try { this._directSource.disconnect(); } catch (e) {}
    this._directSource = null;
  }

  _getDirectPlaybackSeconds() {
    if (!this._directSource || !this._connected) {
      return this._directStartOffset;
    }
    return this._directStartOffset
      + Math.max(0, this.audioContext.currentTime - this._directStartContextTime) * this._tempo;
  }

  _startTimeUpdates() {
    this._stopTimeUpdates();
    this._timeUpdateTimer = setInterval(() => {
      if (!this._connected || !this._onTimeUpdate) return;
      const seconds = this._mode === 'direct'
        ? this._getDirectPlaybackSeconds()
        : (this.shifter ? this.shifter.timePlayed : 0);
      const ratio = this.duration > 0 ? seconds / this.duration : 0;
      this._onTimeUpdate(seconds, ratio);
    }, 250);
  }

  _stopTimeUpdates() {
    if (this._timeUpdateTimer) {
      clearInterval(this._timeUpdateTimer);
      this._timeUpdateTimer = null;
    }
  }
}
