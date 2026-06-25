import { PitchShifter } from 'soundtouchjs';
import { clamp, combinedPitchSemitones, TEMPO_MIN, TEMPO_MAX, PITCH_MIN, PITCH_MAX, FINE_TUNE_MIN, FINE_TUNE_MAX } from './pitchTempoUtils';

const BUFFER_SIZE = 16384;

export default class PitchTempoShifter {
  constructor(audioContext, audioBuffer, onTimeUpdate, onEnded) {
    this.audioContext = audioContext;
    this.gainNode = audioContext.createGain();
    this.gainNode.gain.value = 1.0;
    this.shifter = new PitchShifter(audioContext, audioBuffer, BUFFER_SIZE, onEnded);
    this.shifter.on('play', (detail) => {
      if (onTimeUpdate) onTimeUpdate(detail.timePlayed, detail.percentagePlayed / 100);
    });
    this._tempo = 1.0;
    this._pitch = 0;
    this._fineTune = 0;
    this._connected = false;
  }

  get duration() {
    return this.shifter.duration;
  }

  getPlaybackRatio() {
    return this.shifter ? this.shifter.percentagePlayed / 100 : 0;
  }

  applySettings(tempo, pitchSemitones, fineTuneCents) {
    this._tempo = clamp(tempo, TEMPO_MIN, TEMPO_MAX);
    this._pitch = clamp(pitchSemitones, PITCH_MIN, PITCH_MAX);
    this._fineTune = clamp(fineTuneCents, FINE_TUNE_MIN, FINE_TUNE_MAX);
    // Live tempo/pitch only — resetting percentagePlayed clears SoundTouch buffers
    // and can spuriously fire onEnd while connected.
    this.shifter.tempo = this._tempo;
    this.shifter.pitchSemitones = combinedPitchSemitones(this._pitch, this._fineTune);
    // SoundTouch time-stretch tends to attenuate output; keep level steadier as tempo
    // changes and over long playback runs.
    const compensation = this._tempo > 0 ? Math.sqrt(this._tempo) : 1;
    this.gainNode.gain.value = Math.min(2.5, Math.max(0.75, compensation));
  }

  getState() {
    return { tempo: this._tempo, pitch: this._pitch, fineTune: this._fineTune };
  }

  connect() {
    if (!this._connected) {
      this.shifter.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);
      this._connected = true;
    }
  }

  isConnected() {
    return this._connected;
  }

  disconnect() {
    if (this._connected) {
      this.shifter.disconnect();
      this.gainNode.disconnect();
      this._connected = false;
    }
  }

  seek(ratio) {
    // soundtouchjs is asymmetric: the percentagePlayed getter returns 0-100 but
    // the setter expects a 0-1 fraction (sourcePosition = perc * duration * sr).
    // Pass the fraction directly; multiplying by 100 seeks 100x past the target.
    this.shifter.percentagePlayed = clamp(ratio, 0, 1);
  }

  destroy() {
    this.disconnect();
    this.shifter.off();
  }
}
