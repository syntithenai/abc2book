import PitchTempoShifter from './pitchTempoShifter';
import StemLiveMixer from './stemLiveMixer';
import { fetchAndDecodeExternalMedia } from './externalMediaAudioLoader';
import { decodeAudioBytes } from './audioDecodeBytes';
import { getCachedExternalMediaBlob, getExternalMediaCacheKey, putExternalMediaCache } from './externalMediaAudioCache';
import { trimAudioBuffer } from './mediaAudioTrim';
import { mixStemBuffers, resampleBufferToContextRate } from './audioStemMixer';
import { audioFiltersAreNeutral, combinedPitchSemitones, normalizeStemBufferMap } from './pitchTempoUtils';
import { fetchStemBuffers, separateStemsFromSource } from './mediaStemClient';
import { getCachedStemSet, getStemSourceCacheKey, loadCachedStemSetForMedia, saveCachedStemSet } from './audioStemCache';

export default class ExternalMediaPitchTempo {
  constructor(onTimeUpdate, onEnded, audioContext, onPitchOutputReady) {
    this._ownsAudioContext = !audioContext;
    this.audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    this.shifter = null;
    this.onTimeUpdate = onTimeUpdate;
    this.onEnded = onEnded;
    this._onPitchOutputReady = onPitchOutputReady || null;
    this._duration = 0;
    this._loadAborted = false;
    this._sourceBuffer = null;
    this._stemBuffers = null;
    this._stemSeparation = null;
    this._audioFilters = null;
    this._stemLoadToken = 0;
    this._stemLoadingPromise = null;
    this._stemLiveMixer = null;
    this._tempo = 1;
    this._pitch = 0;
    this._fineTune = 0;
  }

  get duration() {
    if (this._stemLiveMixer && (this._stemLiveMixer.isConnected() || this._stemLiveMixer.hasPlaybackBuffers())) {
      return this._stemLiveMixer.duration || this._duration;
    }
    return this._duration;
  }

  get connected() {
    return this.isConnected();
  }

  _canUseStemLiveMixer(tempo, pitch, fineTune) {
    return Math.abs(combinedPitchSemitones(pitch, fineTune)) < 0.0001;
  }

  _ensureStemLiveMixer() {
    if (!this._stemLiveMixer) {
      const self = this;
      this._stemLiveMixer = new StemLiveMixer(
        this.audioContext,
        function(seconds, ratio) {
          if (self.onTimeUpdate) self.onTimeUpdate(seconds, ratio);
        },
        function() {
          if (self.onEnded) self.onEnded();
        }
      );
    }
    return this._stemLiveMixer;
  }

  _teardownStemLiveMixer() {
    if (!this._stemLiveMixer) return;
    this._stemLiveMixer.destroy();
    this._stemLiveMixer = null;
  }

  _activeEngine() {
    if (this._stemLiveMixer && this._stemLiveMixer.isConnected()) {
      return 'live';
    }
    return 'shifter';
  }

  _createShifter(audioBuffer) {
    this.shifter = new PitchTempoShifter(
      this.audioContext,
      audioBuffer,
      (timePlayed) => {
        if (this._activeEngine() !== 'shifter') return;
        if (this.onTimeUpdate) this.onTimeUpdate(timePlayed);
      },
      () => {
        if (this._activeEngine() !== 'shifter') return;
        if (this.onEnded) this.onEnded();
      },
      this._onPitchOutputReady
    );
  }

  async warmFromCachedStems(cacheOptions) {
    if (!cacheOptions) return 0;
    const cached = await loadCachedStemSetForMedia(cacheOptions);
    if (!cached || !cached.stemBuffers) return 0;

    const normalized = normalizeStemBufferMap(cached.stemBuffers);
    const stemBuffers = {};
    let maxDuration = 0;
    Object.keys(normalized).forEach((stemName) => {
      const buffer = normalized[stemName];
      if (!buffer) return;
      const playbackBuffer = resampleBufferToContextRate(this.audioContext, buffer);
      stemBuffers[stemName] = playbackBuffer;
      maxDuration = Math.max(maxDuration, playbackBuffer.duration);
    });
    if (maxDuration <= 0 || Object.keys(stemBuffers).length === 0) {
      return 0;
    }

    this._teardownStemLiveMixer();
    const silentLength = Math.max(1, Math.ceil(maxDuration * this.audioContext.sampleRate));
    const silentBuffer = this.audioContext.createBuffer(2, silentLength, this.audioContext.sampleRate);
    this._sourceBuffer = silentBuffer;
    this._duration = maxDuration;
    this._createShifter(silentBuffer);
    this.setStemBuffers(cached.separation, stemBuffers);
    return maxDuration;
  }

  async load(src, srcType, youtubeGetId, cacheOptions) {
    this._loadAborted = false;
    let audioBuffer = null;
    const accessToken = cacheOptions && cacheOptions.accessToken ? cacheOptions.accessToken : null;

    const cacheable = !!(cacheOptions && cacheOptions.tuneId !== undefined && cacheOptions.linkIndex !== undefined);
    const cacheKey = cacheable
      ? getExternalMediaCacheKey(cacheOptions.tuneId, cacheOptions.linkIndex, src)
      : null;

    if (cacheable) {
      const cached = await getCachedExternalMediaBlob(cacheKey);
      if (cached && cached.blob) {
        const arrayBuffer = await cached.blob.arrayBuffer();
        audioBuffer = await decodeAudioBytes(arrayBuffer, this.audioContext);
      }
    }

    if (!audioBuffer) {
      const decoded = await fetchAndDecodeExternalMedia(src, srcType, youtubeGetId, accessToken);
      if (this._loadAborted) return null;
      audioBuffer = decoded.audioBuffer;
      if (cacheable && decoded.arrayBuffer) {
        const blob = new Blob([decoded.arrayBuffer], { type: decoded.mime || 'application/octet-stream' });
        putExternalMediaCache(cacheKey, blob, decoded.duration, 'source').catch(function() {});
      }
    }

    if (this._loadAborted) return null;
    const trimBounds = cacheOptions && cacheOptions.trimBounds;
    if (trimBounds && (trimBounds.endSec > 0 || trimBounds.startSec > 0)) {
      const trimmed = trimAudioBuffer(audioBuffer, trimBounds.startSec, trimBounds.endSec);
      if (trimmed) audioBuffer = trimmed;
    }
    audioBuffer = resampleBufferToContextRate(this.audioContext, audioBuffer);
    this._teardownStemLiveMixer();
    this._sourceBuffer = audioBuffer;
    this._stemBuffers = null;
    this._stemSeparation = null;
    this._duration = audioBuffer.duration;
    this._createShifter(audioBuffer);
    return this._duration;
  }

  async ensureStemBuffers(cacheOptions, audioFilters, options) {
    const opts = options || {};
    if (!cacheOptions) {
      return null;
    }
    if (!opts.forceRefresh && this._stemBuffers) {
      return this._stemBuffers;
    }

    const token = ++this._stemLoadToken;
    if (this._stemLoadingPromise) {
      return this._stemLoadingPromise;
    }

    const loadPromise = (async () => {
      const cacheKey = getStemSourceCacheKey(
        cacheOptions.tuneId,
        cacheOptions.linkIndex,
        cacheOptions.src,
        cacheOptions.demucsModel || ''
      );

      if (!opts.forceRefresh) {
        const cached = await loadCachedStemSetForMedia(cacheOptions);
        if (cached && cached.stemBuffers) {
          if (token !== this._stemLoadToken || this._loadAborted) {
            return null;
          }
          this._stemSeparation = cached.separation || this._stemSeparation;
          this._stemBuffers = cached.stemBuffers;
          return cached.stemBuffers;
        }
      } else {
        this._stemBuffers = null;
        this._stemSeparation = null;
      }

      if (!opts.allowNetworkSeparation) {
        return null;
      }

      const source = {
        kind: 'link',
        src: cacheOptions.src,
        srcType: cacheOptions.srcType,
        label: cacheOptions.label || '',
      };
      const separation = await separateStemsFromSource({
        source: source,
        accessToken: cacheOptions.accessToken,
        signal: opts.signal,
        onProgress: opts.onProgress,
        onStatus: opts.onStatus,
      });
      if (token !== this._stemLoadToken || this._loadAborted) {
        return null;
      }

      const fetched = await fetchStemBuffers(separation, cacheOptions.accessToken, opts.signal);
      if (token !== this._stemLoadToken || this._loadAborted) {
        return null;
      }
      await saveCachedStemSet(cacheKey, {
        separation: separation,
        stemBuffers: fetched.stemBuffers,
        stemWavBytes: fetched.stemWavBytes,
      });
      this._stemSeparation = separation;
      this._stemBuffers = fetched.stemBuffers;
      return fetched.stemBuffers;
    })();

    this._stemLoadingPromise = loadPromise;
    try {
      return await loadPromise;
    } finally {
      if (this._stemLoadingPromise === loadPromise) {
        this._stemLoadingPromise = null;
      }
    }
  }

  applyStemMix(audioFilters, tempo, pitch, fineTune) {
    if (!this.shifter) return false;
    this._audioFilters = audioFilters;

    if (!this._stemBuffers) {
      this._teardownStemLiveMixer();
      if (this._sourceBuffer) {
        this.shifter.replaceBuffer(this._sourceBuffer, true);
        this._duration = this._sourceBuffer.duration;
      }
      return true;
    }

    if (this._canUseStemLiveMixer(tempo, pitch, fineTune)) {
      return this._applyStemLiveMix(audioFilters, tempo);
    }

    this._teardownStemLiveMixer();
    const wasConnected = this.shifter.isConnected();
    const ratio = wasConnected ? this.shifter.getPlaybackRatio() : 0;
    const mixed = mixStemBuffers(this.audioContext, this._stemBuffers, audioFilters);
    if (!mixed) return false;
    this.shifter.replaceBuffer(mixed, true);
    this._duration = mixed.duration;
    if (wasConnected && ratio > 0) {
      this.shifter.seek(ratio);
      if (!this.shifter.isConnected()) {
        if (this.audioContext && this.audioContext.state === 'suspended') {
          try { this.audioContext.resume(); } catch (e) {}
        }
        this.shifter.connect();
      }
    }
    return true;
  }

  _prepareStemLiveMix(audioFilters, tempo) {
    const mixer = this._ensureStemLiveMixer();
    mixer.setStemBuffers(this._stemBuffers);
    mixer.setFilters(audioFilters);
    mixer.setTempo(tempo);
    this._duration = mixer.duration || this._duration;
    return mixer;
  }

  _applyStemLiveMix(audioFilters, tempo) {
    const mixer = this._ensureStemLiveMixer();

    if (mixer.isConnected()) {
      mixer.setFilters(audioFilters);
      mixer.setTempo(tempo);
      this._duration = mixer.duration || this._duration;
      return true;
    }

    this._prepareStemLiveMix(audioFilters, tempo);
    return true;
  }

  async connectStemLivePlayback(resumeAtSeconds) {
    if (!this.canUseStemLivePlayback()) {
      return false;
    }
    if (!this._stemLiveMixer || !this._stemLiveMixer.hasPlaybackBuffers()) {
      if (!this._audioFilters) {
        return false;
      }
      this._prepareStemLiveMix(this._audioFilters, this._tempo);
    }
    if (!this._stemLiveMixer || !this._stemLiveMixer.hasPlaybackBuffers()) {
      return false;
    }
    if (this._stemLiveMixer.isConnected()) {
      return true;
    }
    if (this.shifter && this.shifter.isConnected()) {
      this.shifter.disconnect();
    }
    const duration = this._stemLiveMixer.duration;
    if (duration > 0 && resumeAtSeconds > 0) {
      this._stemLiveMixer.seek(Math.min(1, resumeAtSeconds / duration));
    }
    if (this.audioContext && this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (e) {}
    }
    if (this.audioContext.state !== 'running') {
      return false;
    }
    this._stemLiveMixer.connect();
    return this._stemLiveMixer.isConnected();
  }

  isStemLiveOutputActive() {
    return !!(this._stemLiveMixer && this._stemLiveMixer.isConnected());
  }

  prepareStemLiveMix(audioFilters, tempo, pitch, fineTune) {
    if (!this.shifter || !this._stemBuffers) return false;
    if (!this._canUseStemLiveMixer(tempo, pitch, fineTune)) return false;
    this._tempo = tempo;
    this._pitch = pitch;
    this._fineTune = fineTune;
    this._audioFilters = audioFilters;
    return this.applyStemMix(audioFilters, tempo, pitch, fineTune);
  }

  canUseStemLivePlayback(tempo, pitch, fineTune) {
    if (this._stemLiveMixer && this._stemLiveMixer.hasPlaybackBuffers()) {
      return true;
    }
    if (!this._stemBuffers || Object.keys(this._stemBuffers).length === 0) {
      return false;
    }
    return this._canUseStemLiveMixer(
      tempo !== undefined ? tempo : this._tempo,
      pitch !== undefined ? pitch : this._pitch,
      fineTune !== undefined ? fineTune : this._fineTune
    );
  }

  usesStemLivePlayback() {
    return this.canUseStemLivePlayback();
  }

  abort() {
    this._loadAborted = true;
    this._stemLoadToken++;
    this._stemLoadingPromise = null;
  }

  getPlaybackRatio() {
    if (this._stemLiveMixer && this._stemLiveMixer.isConnected()) {
      return this._stemLiveMixer.getPlaybackRatio();
    }
    return this.shifter ? this.shifter.getPlaybackRatio() : 0;
  }

  hasStemBuffers() {
    return !!this._stemBuffers;
  }

  getStemBufferNames() {
    if (!this._stemBuffers || typeof this._stemBuffers !== 'object') {
      return [];
    }
    return Object.keys(this._stemBuffers);
  }

  setStemBuffers(separation, stemBuffers) {
    this._stemSeparation = separation || null;
    this._stemBuffers = stemBuffers || null;
  }

  async applySettings(tempo, pitch, fineTune, audioFilters, cacheOptions, options) {
    if (!this.shifter) return;
    const opts = options || {};
    const nextFilters = audioFilters || this._audioFilters;
    const filtersActive = !!(nextFilters && !audioFiltersAreNeutral(nextFilters));
    const hadActiveFilters = !!(this._audioFilters && !audioFiltersAreNeutral(this._audioFilters));
    this._tempo = tempo;
    this._pitch = pitch;
    this._fineTune = fineTune;

    if (filtersActive && !this._stemBuffers) {
      const stemBuffers = await this.ensureStemBuffers(cacheOptions, nextFilters, opts);
      if (stemBuffers) {
        this.applyStemMix(nextFilters, tempo, pitch, fineTune);
      }
    } else if (this._stemBuffers && this._canUseStemLiveMixer(tempo, pitch, fineTune)) {
      this.applyStemMix(nextFilters, tempo, pitch, fineTune);
    } else if (filtersActive && this._stemBuffers) {
      this._teardownStemLiveMixer();
      const wasConnected = this.shifter.isConnected();
      const ratio = wasConnected ? this.shifter.getPlaybackRatio() : 0;
      const mixed = mixStemBuffers(this.audioContext, this._stemBuffers, nextFilters);
      if (mixed) {
        this.shifter.replaceBuffer(mixed, true);
        this._duration = mixed.duration;
        if (wasConnected && ratio > 0) {
          this.shifter.seek(ratio);
          if (!this.shifter.isConnected()) {
            if (this.audioContext && this.audioContext.state === 'suspended') {
              try { this.audioContext.resume(); } catch (e) {}
            }
            this.shifter.connect();
          }
        }
      }
      this._audioFilters = nextFilters;
    } else if (hadActiveFilters && this._sourceBuffer) {
      this._teardownStemLiveMixer();
      this.shifter.replaceBuffer(this._sourceBuffer, true);
      this._duration = this._sourceBuffer.duration;
      this._audioFilters = null;
    } else if (!filtersActive) {
      this._audioFilters = nextFilters;
    }

    if (this._stemLiveMixer && this._stemLiveMixer.isConnected()) {
      this._stemLiveMixer.setTempo(tempo);
    } else if (!(this._stemBuffers && this._canUseStemLiveMixer(tempo, pitch, fineTune))) {
      this.shifter.applySettings(tempo, pitch, fineTune);
    }
  }

  connectIfRunning() {
    if (this.audioContext.state !== 'running') {
      return false;
    }
    if (this._stemLiveMixer && this._stemLiveMixer.isConnected()) {
      return true;
    }
    if (this._stemLiveMixer && this._stemLiveMixer.isActive()) {
      if (this.shifter && this.shifter.isConnected()) {
        this.shifter.disconnect();
      }
      this._stemLiveMixer.connect();
      return this._stemLiveMixer.isConnected();
    }
    if (!this.shifter) return false;
    this.shifter.connect();
    return true;
  }

  async resumeAudioContext() {
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    return this.audioContext.state;
  }

  async connect() {
    const state = await this.resumeAudioContext();
    if (state !== 'running') {
      throw new Error('External media AudioContext is not running');
    }
    if (this._stemLiveMixer && this._stemLiveMixer.isActive()) {
      if (this.shifter) this.shifter.disconnect();
      this._stemLiveMixer.connect();
      return true;
    }
    if (this.shifter) this.shifter.connect();
    return true;
  }

  isConnected() {
    if (this._stemLiveMixer && this._stemLiveMixer.isConnected()) {
      return true;
    }
    return this.shifter ? this.shifter.isConnected() : false;
  }

  disconnect() {
    if (this._stemLiveMixer) {
      this._stemLiveMixer.disconnect();
    }
    if (this.shifter) this.shifter.disconnect();
  }

  setOutputVolume(volume) {
    if (this._stemLiveMixer && this._stemLiveMixer.isConnected()) {
      this._stemLiveMixer.setOutputVolume(volume);
      return;
    }
    if (this.shifter) this.shifter.setOutputVolume(volume);
  }

  seek(ratio) {
    if (this._stemLiveMixer && this._stemLiveMixer.isConnected()) {
      this._stemLiveMixer.seek(ratio);
      return;
    }
    if (this.shifter) this.shifter.seek(ratio);
  }

  destroy() {
    this.abort();
    this._teardownStemLiveMixer();
    if (this.shifter) {
      this.shifter.destroy();
      this.shifter = null;
    }
    this._sourceBuffer = null;
    this._stemBuffers = null;
    this._stemSeparation = null;
    if (this._ownsAudioContext && this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(function() {});
    }
  }
}
