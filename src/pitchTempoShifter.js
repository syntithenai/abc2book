import { PitchShifter } from 'soundtouchjs';
import { clamp, combinedPitchSemitones, TEMPO_MIN, TEMPO_MAX, PITCH_MIN, PITCH_MAX, FINE_TUNE_MIN, FINE_TUNE_MAX } from './pitchTempoUtils';

// ScriptProcessor buffer. 2048 underruns as soon as SoundTouch retunes
// (live pitch/fine-tune); 16384 was the last size that stayed smooth.
const BUFFER_SIZE = 16384;

export default class PitchTempoShifter {
  constructor(audioContext, audioBuffer, onTimeUpdate, onEnded, onPitchOutputReady) {
    this.audioContext = audioContext;
    this.audioBuffer = audioBuffer;
    this.gainNode = audioContext.createGain();
    this.gainNode.gain.value = 1.0;
    this._outputVolume = 1;
    this._directOutputGain = false;
    this._onTimeUpdate = onTimeUpdate;
    this._onEnded = onEnded;
    this._onPitchOutputReady = onPitchOutputReady || null;
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
    this._pitchOutputPending = false;
    this._scheduledConnectTimer = null;
    this._soundtouchStartContextTime = null;
    this._soundtouchHoldOffset = 0;
    this._soundtouchAwaitingFirstAudio = false;
    this._loggedFirstAudible = false;
    // Swallow BufferSource/SoundTouch end events across live mode switches so
    // a reconnect does not look like natural end → seek-to-0 / repeat.
    this._suppressEndedUntil = 0;
  }

  _emitEnded() {
    if (Date.now() < (this._suppressEndedUntil || 0)) return;
    if (this._onEnded) this._onEnded();
  }

  _suppressEndedBriefly(ms) {
    const until = Date.now() + (ms > 0 ? ms : 750);
    if (until > (this._suppressEndedUntil || 0)) {
      this._suppressEndedUntil = until;
    }
  }

  setOnPitchOutputReady(callback) {
    this._onPitchOutputReady = callback || null;
  }

  getOutputLatencySec() {
    if (!this.audioContext || this._mode !== 'soundtouch') {
      return 0
    }
    return BUFFER_SIZE / this.audioContext.sampleRate
  }

  get duration() {
    return this.audioBuffer ? this.audioBuffer.duration : 0;
  }

  getPlaybackRatio() {
    const duration = this.duration;
    if (!duration) return 0;
    return clamp(this.getCurrentTime() / duration, 0, 1);
  }

  /**
   * Seconds into the rendered buffer on the *audible* music timeline.
   * SoundTouch timePlayed advances in ScriptProcessor chunks and can stall then
   * jump (observed 0→2→4.8 freeze→9.5 at tempo 1.8), which made the cursor
   * hitch on the first line. Drive the music clock from wall × user tempo
   * (same as direct mode), anchored at connect/seek. When pitch ≠ 0 this also
   * avoids source-rate skew from internalTempo = tempo/pitchRate.
   */
  getCurrentTime() {
    if (this._mode === 'direct') {
      return Math.max(0, this._getDirectPlaybackSeconds());
    }
    return Math.max(0, this._getSoundtouchWallMusicSeconds());
  }

  /** Wall-clock × tempo from the last connect/seek anchor. */
  _getSoundtouchWallMusicSeconds() {
    if (this._scheduledConnectTimer && this._soundtouchStartContextTime != null) {
      if (this.audioContext && this.audioContext.currentTime < this._soundtouchStartContextTime) {
        return Math.max(0, this._soundtouchHoldOffset || 0);
      }
    }
    // Hold the music clock at the seek/connect offset until SoundTouch reports
    // real source progress — otherwise wall time races through the opening
    // while the ScriptProcessor is still warming up (timePlayed stuck at 0).
    if (this._soundtouchAwaitingFirstAudio) {
      const played = this.shifter && typeof this.shifter.timePlayed === 'number'
        ? this.shifter.timePlayed
        : 0
      if (played > 0.001 && this.audioContext) {
        this._soundtouchAwaitingFirstAudio = false
        this._soundtouchHoldOffset = Math.max(0, this._soundtouchHoldOffset || 0)
        this._soundtouchStartContextTime = this.audioContext.currentTime
      } else {
        return Math.max(0, this._soundtouchHoldOffset || 0)
      }
    }
    if (this._soundtouchStartContextTime != null && this.audioContext
        && (this._connected || this._scheduledConnectTimer)) {
      const elapsed = this.audioContext.currentTime - this._soundtouchStartContextTime;
      if (elapsed >= 0) {
        const tempo = this._tempo > 0 ? this._tempo : 1;
        return Math.max(0, (this._soundtouchHoldOffset || 0) + elapsed * tempo);
      }
      return Math.max(0, this._soundtouchHoldOffset || 0);
    }
    if (this._soundtouchHoldOffset > 0) {
      return this._soundtouchHoldOffset;
    }
    if (this.shifter && typeof this.shifter.timePlayed === 'number') {
      return Math.max(0, this.shifter.timePlayed);
    }
    return 0;
  }

  _anchorSoundtouchMusicClock() {
    if (!this.audioContext) return;
    const musical = this._getSoundtouchWallMusicSeconds();
    this._soundtouchHoldOffset = Math.max(0, musical);
    this._soundtouchStartContextTime = this.audioContext.currentTime;
  }

  _applySoundTouchSettings() {
    if (!this.shifter) return;
    this.shifter.tempo = this._tempo;
    this.shifter.pitchSemitones = combinedPitchSemitones(this._pitch, this._fineTune);
  }

  applySettings(tempo, pitchSemitones, fineTuneCents) {
    const wasConnected = this._connected;
    const ratio = this.getPlaybackRatio();
    const prevCombined = combinedPitchSemitones(this._pitch, this._fineTune);
    this._tempo = clamp(tempo, TEMPO_MIN, TEMPO_MAX);
    this._pitch = clamp(pitchSemitones, PITCH_MIN, PITCH_MAX);
    this._fineTune = clamp(fineTuneCents, FINE_TUNE_MIN, FINE_TUNE_MAX);
    const nextCombined = combinedPitchSemitones(this._pitch, this._fineTune);
    const pitchParamsChanged = Math.abs(prevCombined - nextCombined) >= 0.0001;
    const nextMode = this._shouldUseDirectMode() ? 'direct' : 'soundtouch';

    if (pitchParamsChanged) {
      if (Math.abs(nextCombined) >= 0.0001) {
        this._pitchOutputPending = true;
      } else {
        this._pitchOutputPending = false;
      }
    }

    if (wasConnected && nextMode !== this._mode) {
      this._suppressEndedBriefly(750);
      this.disconnect();
      this._mode = nextMode;
      if (this._mode === 'soundtouch') {
        this._applySoundTouchSettings();
      }
      this.seek(ratio);
      this.connect();
      if (nextMode === 'direct') {
        this._signalPitchOutputReady();
      }
    } else {
      this._mode = nextMode;
      if (this._mode === 'direct' && this._directSource) {
        this._directStartOffset = this._getDirectPlaybackSeconds();
        this._directStartContextTime = this.audioContext.currentTime;
        this._directSource.playbackRate.value = this._tempo;
        if (pitchParamsChanged) {
          this._signalPitchOutputReady();
        }
      } else if (this.shifter) {
        // Re-anchor before tempo changes so wall-clock music seconds stay continuous.
        if (wasConnected && this._mode === 'soundtouch') {
          this._anchorSoundtouchMusicClock();
        }
        this._applySoundTouchSettings();
      }
    }

    this._updateGain();
  }

  setOutputVolume(volume) {
    const next = parseFloat(volume);
    this._outputVolume = isNaN(next) ? 1 : clamp(next, 0, 1);
    this._updateGain();
  }

  setDirectOutputGain(enabled) {
    this._directOutputGain = !!enabled;
    this._updateGain();
  }

  _updateGain() {
    if (this._directOutputGain) {
      this.gainNode.gain.value = this._outputVolume;
      return;
    }
    const compensation = this._mode === 'soundtouch' && this._tempo > 0 ? Math.sqrt(this._tempo) : 1;
    const level = Math.min(2.5, Math.max(0.75, compensation)) * this._outputVolume;
    this.gainNode.gain.value = level;
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
      // Live stem remixes are often triggered from a slider drag, which is not
      // always treated as a user gesture. Resume before reconnecting so playback
      // does not go silent while the UI still shows "playing".
      if (this.audioContext && this.audioContext.state === 'suspended') {
        try { this.audioContext.resume(); } catch (e) {}
      }
      this.connect();
    }
  }

  getState() {
    return { tempo: this._tempo, pitch: this._pitch, fineTune: this._fineTune };
  }

  _resolveConnectWhen(startWhen) {
    const ctx = this.audioContext
    if (!ctx) return null
    return Number.isFinite(startWhen) && startWhen > ctx.currentTime + 0.001
      ? startWhen
      : ctx.currentTime
  }

  _clearScheduledConnect() {
    if (this._scheduledConnectTimer) {
      clearTimeout(this._scheduledConnectTimer)
      this._scheduledConnectTimer = null
    }
  }

  _connectSoundTouchPipeline(scheduledWhen) {
    const ctx = this.audioContext
    const now = ctx ? ctx.currentTime : 0
    const startContextTime = scheduledWhen != null ? scheduledWhen : now
    this._applySoundTouchSettings()
    this.shifter.connect(this.gainNode)
    this.gainNode.connect(this.audioContext.destination)
    this._connected = true
    this._soundtouchStartContextTime = startContextTime
    // Wall clock must not free-run before SoundTouch consumes source — that
    // raced the cursor through the first line during processor warmup.
    this._soundtouchAwaitingFirstAudio = true
    this._loggedFirstAudible = false
    this._startTimeUpdates()
  }

  connect(startWhen) {
    if (!this._connected) {
      if (!this.audioBuffer) {
        return false
      }
      this._mode = this._shouldUseDirectMode() ? 'direct' : 'soundtouch';
      if (this._mode === 'direct') {
        this._connectDirectSource(startWhen);
        if (!this._directSource) {
          return false
        }
        this.gainNode.connect(this.audioContext.destination);
        this._connected = true;
        this._soundtouchAwaitingFirstAudio = false
        this._startTimeUpdates();
      } else {
        const ctx = this.audioContext
        const when = this._resolveConnectWhen(startWhen)
        const now = ctx.currentTime
        const delayMs = (when - now) * 1000
        this._soundtouchHoldOffset = this.shifter
          ? Math.max(0, this.shifter.timePlayed || 0)
          : 0
        // Near-term connects must be synchronous — setTimeout is starved by
        // main-thread work during count-in handoff (observed ~73ms late).
        if (delayMs > 25) {
          this._clearScheduledConnect()
          this._soundtouchStartContextTime = when
          this._soundtouchAwaitingFirstAudio = true
          const self = this
          const pollConnect = function() {
            if (self._connected) return
            if (!self.audioContext) return
            const remainingSec = when - self.audioContext.currentTime
            if (remainingSec <= 0.0005) {
              self._scheduledConnectTimer = null
              // Stamp the real audible start when the timer overshoots; keeping
              // the early `when` made the music clock lead the notes by ~5–10ms.
              const startAt = remainingSec >= 0
                ? when
                : self.audioContext.currentTime
              self._connectSoundTouchPipeline(startAt)
              return
            }
            const pollDelayMs = remainingSec > 0.05
              ? Math.max(1, Math.round((remainingSec - 0.015) * 1000))
              : 1
            self._scheduledConnectTimer = setTimeout(pollConnect, pollDelayMs)
          }
          pollConnect()
          return true
        }
        this._connectSoundTouchPipeline(now)
      }
    }
    return this._connected || !!this._scheduledConnectTimer;
  }

  isConnected() {
    return this._connected;
  }

  isConnectedOrPending() {
    return this._connected || !!this._scheduledConnectTimer
  }

  getScheduledConnectTime() {
    if (this._mode === 'direct' && this._directStartContextTime != null) {
      return this._directStartContextTime
    }
    return this._soundtouchStartContextTime
  }

  disconnect() {
    this._clearScheduledConnect()
    this._soundtouchStartContextTime = null
    this._soundtouchHoldOffset = 0
    this._soundtouchAwaitingFirstAudio = false
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
      if (this._connected) {
        this._disconnectDirectSource();
        this._connected = false;
        this._stopTimeUpdates();
      }
      this._directStartOffset = clamped * this.duration;
      this._directStartContextTime = this.audioContext.currentTime;
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
    const self = this;
    const shifter = new PitchShifter(
      this.audioContext,
      audioBuffer,
      BUFFER_SIZE,
      function() { self._emitEnded(); }
    );
    shifter.on('play', (detail) => {
      if (this._pitchOutputPending && this._mode === 'soundtouch' && this._connected) {
        this._signalPitchOutputReady();
      }
      if (detail.timePlayed > 0.001 && this._soundtouchStartContextTime != null && !this._loggedFirstAudible) {
        this._loggedFirstAudible = true
      }
      if (this._onTimeUpdate) {
        this._onTimeUpdate(detail.timePlayed, detail.percentagePlayed / 100);
      }
    });
    return shifter;
  }

  _signalPitchOutputReady() {
    if (!this._pitchOutputPending) return;
    this._pitchOutputPending = false;
    if (this._onPitchOutputReady) {
      this._onPitchOutputReady();
    }
  }

  _shouldUseDirectMode() {
    // Direct BufferSource playbackRate changes both tempo and pitch; use
    // SoundTouch whenever tempo or pitch processing is needed.
    const unity = Math.abs(combinedPitchSemitones(this._pitch, this._fineTune)) < 0.0001
      && Math.abs(this._tempo - 1) < 0.0001;
    if (!unity) return false;
    // Stay on SoundTouch while it is already running so live pitch around 0
    // does not disconnect/reconnect on every slider tick.
    if (this._connected && this._mode === 'soundtouch') return false;
    return true;
  }

  _connectDirectSource(startWhen) {
    if (!this.audioBuffer) return;
    const source = this.audioContext.createBufferSource();
    source.buffer = this.audioBuffer;
    source.playbackRate.value = this._tempo;
    source.connect(this.gainNode);
    this._directStopIntent = false;
    const when = Number.isFinite(startWhen) && startWhen > this.audioContext.currentTime + 0.001
      ? startWhen
      : this.audioContext.currentTime;
    this._directStartContextTime = when;
    // Same clock field used by getScheduledConnectTime / count-in reuse so
    // onMusicStart does not tear down a correctly pre-scheduled BufferSource.
    this._soundtouchStartContextTime = when;
    const offset = Math.min(Math.max(0, this._directStartOffset), Math.max(0, this.duration - 0.001));
    const self = this
    source.onended = () => {
      if (self._directSource === source) {
        self._directSource = null
        self._connected = false
        self._stopTimeUpdates()
      }
      if (!self._directStopIntent) {
        self._emitEnded();
      }
    };
    source.start(when, offset);
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
      const seconds = this.getCurrentTime();
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
