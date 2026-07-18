import PitchTempoShifter from './pitchTempoShifter';
import { fetchAndDecodeExternalMedia } from './externalMediaAudioLoader';
import { decodeAudioBytes } from './audioDecodeBytes';
import { getCachedExternalMediaBlob, getExternalMediaCacheKey, putExternalMediaCache } from './externalMediaAudioCache';
import { trimAudioBuffer } from './mediaAudioTrim';
import { mixStemBuffers, resampleBufferToContextRate } from './audioStemMixer';
import { audioFiltersAreNeutral } from './pitchTempoUtils';
import { fetchStemBuffers, separateStemsFromSource } from './mediaStemClient';
import { getCachedStemSet, getStemSourceCacheKey, saveCachedStemSet } from './audioStemCache';

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
  }

  get duration() {
    return this._duration;
  }

  get connected() {
    return this.shifter ? this.shifter.isConnected() : false;
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
        // Decode on this.audioContext so the result is already at the
        // context sample rate and the resample below is a no-op.
        audioBuffer = await decodeAudioBytes(arrayBuffer, this.audioContext);
      }
    }

    if (!audioBuffer) {
      const decoded = await fetchAndDecodeExternalMedia(src, srcType, youtubeGetId, accessToken);
      if (this._loadAborted) return null;
      audioBuffer = decoded.audioBuffer;
      if (cacheable && decoded.arrayBuffer) {
        // Write-through the original compressed bytes so future sessions
        // skip the download. Fire-and-forget; playback must not wait, and
        // storing source bytes avoids a main-thread re-encode.
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
    this._sourceBuffer = audioBuffer;
    this._stemBuffers = null;
    this._stemSeparation = null;
    this._duration = audioBuffer.duration;
    this.shifter = new PitchTempoShifter(
      this.audioContext,
      audioBuffer,
      (timePlayed) => {
        if (this.onTimeUpdate) this.onTimeUpdate(timePlayed);
      },
      () => {
        if (this.onEnded) this.onEnded();
      },
      this._onPitchOutputReady
    );
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
        const cached = await getCachedStemSet(cacheKey);
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

  applyStemMix(audioFilters) {
    if (!this.shifter) return false;
    this._audioFilters = audioFilters;
    if (!this._stemBuffers || audioFiltersAreNeutral(audioFilters)) {
      if (this._sourceBuffer) {
        this.shifter.replaceBuffer(this._sourceBuffer, true);
        this._duration = this._sourceBuffer.duration;
      }
      return true;
    }
    const mixed = mixStemBuffers(this.audioContext, this._stemBuffers, audioFilters);
    if (!mixed) return false;
    this.shifter.replaceBuffer(mixed, true);
    this._duration = mixed.duration;
    return true;
  }

  abort() {
    this._loadAborted = true;
    this._stemLoadToken++;
    this._stemLoadingPromise = null;
  }

  getPlaybackRatio() {
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

    if (filtersActive) {
      if (this._stemBuffers) {
        this.applyStemMix(nextFilters);
      } else {
        const stemBuffers = await this.ensureStemBuffers(cacheOptions, nextFilters, opts);
        if (stemBuffers) {
          this.applyStemMix(nextFilters);
        }
      }
    } else if (hadActiveFilters && this._sourceBuffer) {
      this.shifter.replaceBuffer(this._sourceBuffer, true);
      this._duration = this._sourceBuffer.duration;
      this._audioFilters = null;
    } else if (!filtersActive) {
      this._audioFilters = null;
    }
    this.shifter.applySettings(tempo, pitch, fineTune);
  }

  connectIfRunning() {
    if (!this.shifter || this.audioContext.state !== 'running') {
      return false;
    }
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
    if (this.shifter) this.shifter.connect();
    return true;
  }

  isConnected() {
    return this.shifter ? this.shifter.isConnected() : false;
  }

  disconnect() {
    if (this.shifter) this.shifter.disconnect();
  }

  setOutputVolume(volume) {
    if (this.shifter) this.shifter.setOutputVolume(volume);
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
    this._sourceBuffer = null;
    this._stemBuffers = null;
    this._stemSeparation = null;
    if (this._ownsAudioContext && this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(function() {});
    }
  }
}
