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

  applySettings(tempo, pitchSemitones, fineTuneCents) {
    const preserveRatio = this._connected ? this.shifter.percentagePlayed / 100 : null;
    this._tempo = clamp(tempo, TEMPO_MIN, TEMPO_MAX);
    this._pitch = clamp(pitchSemitones, PITCH_MIN, PITCH_MAX);
    this._fineTune = clamp(fineTuneCents, FINE_TUNE_MIN, FINE_TUNE_MAX);
    this.shifter.tempo = this._tempo;
    this.shifter.pitchSemitones = combinedPitchSemitones(this._pitch, this._fineTune);
    if (preserveRatio !== null && !isNaN(preserveRatio)) {
      this.shifter.percentagePlayed = preserveRatio * 100;
    }
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

  disconnect() {
    if (this._connected) {
      this.shifter.disconnect();
      this.gainNode.disconnect();
      this._connected = false;
    }
  }

  seek(ratio) {
    this.shifter.percentagePlayed = clamp(ratio, 0, 1) * 100;
  }

  destroy() {
    this.disconnect();
    this.shifter.off();
  }
}
