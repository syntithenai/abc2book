import PitchTempoShifter from './pitchTempoShifter';
import { fetchAndDecodeExternalMedia } from './externalMediaAudioLoader';
import { getCachedExternalMediaBlob, getExternalMediaCacheKey } from './externalMediaAudioCache';

export default class ExternalMediaPitchTempo {
  constructor(onTimeUpdate, onEnded) {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.shifter = null;
    this.onTimeUpdate = onTimeUpdate;
    this.onEnded = onEnded;
    this._duration = 0;
    this._loadAborted = false;
  }

  get duration() {
    return this._duration;
  }

  async load(src, srcType, youtubeGetId, cacheOptions) {
    this._loadAborted = false;
    let audioBuffer = null;
    const accessToken = cacheOptions && cacheOptions.accessToken ? cacheOptions.accessToken : null;

    if (cacheOptions && cacheOptions.tuneId !== undefined && cacheOptions.linkIndex !== undefined) {
      const cacheKey = getExternalMediaCacheKey(cacheOptions.tuneId, cacheOptions.linkIndex, src);
      const cached = await getCachedExternalMediaBlob(cacheKey);
      if (cached && cached.blob) {
        const arrayBuffer = await cached.blob.arrayBuffer();
        const decodeModule = await import('audio-decode');
        const decode = decodeModule.default || decodeModule;
        audioBuffer = await decode(arrayBuffer);
      }
    }

    if (!audioBuffer) {
      const decoded = await fetchAndDecodeExternalMedia(src, srcType, youtubeGetId, accessToken);
      if (this._loadAborted) return null;
      audioBuffer = decoded.audioBuffer;
    }

    if (this._loadAborted) return null;
    this._duration = audioBuffer.duration;
    this.shifter = new PitchTempoShifter(
      this.audioContext,
      audioBuffer,
      (timePlayed) => {
        if (this.onTimeUpdate) this.onTimeUpdate(timePlayed);
      },
      () => {
        if (this.onEnded) this.onEnded();
      }
    );
    return this._duration;
  }

  abort() {
    this._loadAborted = true;
  }

  applySettings(tempo, pitch, fineTune) {
    if (this.shifter) this.shifter.applySettings(tempo, pitch, fineTune);
  }

  async connect() {
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    if (this.shifter) this.shifter.connect();
  }

  disconnect() {
    if (this.shifter) this.shifter.disconnect();
  }

  seek(ratio) {
    if (this.shifter) this.shifter.seek(ratio);
  }

  destroy() {
    this.abort();
    if (this.shifter) {
      this.shifter.destroy();
      this.shifter = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(function() {});
    }
  }
}
