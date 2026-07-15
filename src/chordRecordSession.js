import Metronome from './Metronome';
import {
  createRhythm,
  formatRhythmText,
  rhythmFromTimeSignature,
  slotPulseIndex,
} from './metronomeRhythmPresets';
import {
  beatsPerBarFromMeter,
  metronomeBarDurationSec,
  trimOrPadBufferToDuration,
} from './chordFillPattern';
import { primeChordFills, getFillBuffer } from './chordFillPrerender';
import {
  createBeatCapture,
  assignmentsToChordGrid,
} from './chordRecordCapture';

export const CHORD_RECORD_STATES = {
  IDLE: 'idle',
  PREPARING: 'preparing',
  READY: 'ready',
  COUNT_IN: 'countIn',
  RECORDING: 'recording',
  STOPPED: 'stopped',
};

function meterFromRhythm(rhythm) {
  if (!rhythm) return '4/4';
  return formatRhythmText(rhythm) || (String(rhythm.beatsPerBar || 4) + '/4');
}

export function createChordRecordSession(options) {
  const opts = options || {};
  let state = CHORD_RECORD_STATES.IDLE;
  let meter = opts.meter || '4/4';
  let tempo = opts.tempo > 0 ? opts.tempo : 120;
  let key = opts.key || 'C';
  let rhythm = opts.rhythm || rhythmFromTimeSignature(meter) || createRhythm(beatsPerBarFromMeter(meter));
  let beatsPerBar = Math.max(1, rhythm.beatsPerBar || beatsPerBarFromMeter(meter));
  let chordLabels = [];
  let countInBeats = beatsPerBar;

  let audioContext = null;
  let gainNode = null;
  let fillBuffers = new Map();
  let capture = null;
  let metronome = null;
  let absoluteBeatIndex = -1;
  let currentBeatIndex = -1;
  let lastAssignedChord = '';
  let scheduledSources = [];
  let preparedMeta = null;

  function notifyState() {
    if (typeof opts.onStateChange === 'function') {
      opts.onStateChange(state, getSnapshot());
    }
  }

  function setState(next) {
    state = next;
    notifyState();
  }

  function getSnapshot() {
    const inCountIn = state === CHORD_RECORD_STATES.COUNT_IN;
    const beatInBar = absoluteBeatIndex >= 0
      ? (absoluteBeatIndex % beatsPerBar) + 1
      : 0;
    const barNumber = currentBeatIndex >= 0
      ? Math.floor(currentBeatIndex / beatsPerBar) + 1
      : (inCountIn && absoluteBeatIndex >= 0 ? 0 : 0);
    return {
      state: state,
      meter: meter,
      tempo: tempo,
      key: key,
      rhythm: rhythm,
      chordLabels: chordLabels.slice(),
      currentBeatIndex: currentBeatIndex,
      absoluteBeatIndex: absoluteBeatIndex,
      beatInBar: beatInBar,
      barNumber: barNumber,
      countInBeats: countInBeats,
      lastAssignedChord: lastAssignedChord,
    };
  }

  function stopMetronome() {
    if (metronome) {
      metronome.onSlotChange = null;
      metronome.onFirstNoteSchedule = null;
      metronome.stop();
      metronome = null;
    }
  }

  function stopScheduledSources(when) {
    const now = audioContext ? audioContext.currentTime : 0;
    scheduledSources.forEach(function(source) {
      try {
        if (when != null && when > now + 0.02) {
          source.stop(when);
        } else {
          source.stop();
        }
      } catch (err) {
        try { source.stop(); } catch (err2) { /* ignore */ }
      }
    });
    scheduledSources = [];
  }

  function scheduleFillPlayback(chordLabel, when, options) {
    if (!audioContext || !gainNode) return;
    const fillOpts = { meter: meter, tempo: tempo, key: key, beatsPerBar: beatsPerBar };
    const buffer = getFillBuffer(fillBuffers, chordLabel, fillOpts);
    if (!buffer) return;
    const startAt = Math.max(when, audioContext.currentTime + 0.01);
    const loop = !options || options.loop !== false;
    const barDur = metronomeBarDurationSec(tempo, beatsPerBar);
    const offsetSec = options && options.offsetSec > 0 ? options.offsetSec : 0;
    const safeOffset = Math.min(Math.max(0, offsetSec), Math.max(0, barDur - 0.001));

    // Cut any overlapping fill so only one chord sounds from the change point.
    stopScheduledSources(startAt);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    if (loop) {
      // Loop period must match the metronome bar. Prefer barDur so a long
      // abcjs buffer (fade tail) cannot drift even if trim was skipped.
      source.loopStart = 0;
      source.loopEnd = Math.min(barDur, buffer.duration);
    }
    source.connect(gainNode);
    if (safeOffset > 0) {
      source.start(startAt, safeOffset);
    } else {
      source.start(startAt);
    }
    scheduledSources.push(source);
    source.onended = function() {
      scheduledSources = scheduledSources.filter(function(item) { return item !== source; });
    };
  }

  function normalizePreparedBuffers(buffers) {
    const barDur = metronomeBarDurationSec(tempo, beatsPerBar);
    const next = new Map();
    buffers.forEach(function(buffer, key) {
      next.set(key, trimOrPadBufferToDuration(buffer, barDur, audioContext));
    });
    return next;
  }

  function syncPreparedCapture() {
    capture = createBeatCapture({ tempo: tempo, beatsPerBar: beatsPerBar });
    preparedMeta = { tempo: tempo, meter: meter, key: key, beatsPerBar: beatsPerBar };
  }

  function fillsMatchConfig() {
    return !!(preparedMeta
      && preparedMeta.tempo === tempo
      && preparedMeta.meter === meter
      && preparedMeta.key === key
      && preparedMeta.beatsPerBar === beatsPerBar
      && fillBuffers.size > 0);
  }

  function handleSlotPulse(slotIndex, rhythmState) {
    if (slotPulseIndex(rhythmState, slotIndex) !== 0) return;
    absoluteBeatIndex += 1;

    if (absoluteBeatIndex < countInBeats) {
      currentBeatIndex = -1;
      if (state !== CHORD_RECORD_STATES.COUNT_IN) {
        setState(CHORD_RECORD_STATES.COUNT_IN);
      } else {
        notifyState();
      }
      return;
    }

    currentBeatIndex = absoluteBeatIndex - countInBeats;
    if (capture && capture.getBeatTimes().length <= currentBeatIndex + beatsPerBar + countInBeats) {
      capture.extendBeats(beatsPerBar);
    }
    if (state !== CHORD_RECORD_STATES.RECORDING) {
      setState(CHORD_RECORD_STATES.RECORDING);
    } else {
      notifyState();
    }
  }

  function startContinuousMetronome() {
    absoluteBeatIndex = -1;
    currentBeatIndex = -1;
    lastAssignedChord = '';
    countInBeats = beatsPerBar;

    metronome = new Metronome(
      audioContext,
      tempo,
      beatsPerBar,
      0,
      null,
      function onError() {
        setState(CHORD_RECORD_STATES.READY);
        if (typeof opts.onError === 'function') {
          opts.onError('Metronome could not start');
        }
      },
      rhythm
    );

    metronome.onFirstNoteSchedule = function(time) {
      if (!capture) syncPreparedCapture();
      // Beat timeline includes count-in clicks so recording beat 0 is at index countInBeats.
      capture.reset(time);
    };

    metronome.onSlotChange = handleSlotPulse;
    metronome.start();
  }

  async function ensureAudioContext() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    if (!gainNode) {
      gainNode = audioContext.createGain();
      gainNode.gain.value = 0.7;
      gainNode.connect(audioContext.destination);
    }
    return audioContext;
  }

  function invalidatePreparedIfConfigChanged() {
    if (state === CHORD_RECORD_STATES.IDLE || state === CHORD_RECORD_STATES.PREPARING) return;
    if (state === CHORD_RECORD_STATES.COUNT_IN || state === CHORD_RECORD_STATES.RECORDING) return;
    if (fillsMatchConfig()) return;
    stopMetronome();
    stopScheduledSources();
    fillBuffers = new Map();
    capture = null;
    preparedMeta = null;
    absoluteBeatIndex = -1;
    currentBeatIndex = -1;
    lastAssignedChord = '';
    setState(CHORD_RECORD_STATES.IDLE);
  }

  return {
    getState: function() { return state; },
    getSnapshot: getSnapshot,

    configure(config) {
      const next = config || {};
      if (next.rhythm) {
        rhythm = createRhythm(
          next.rhythm.beatsPerBar,
          next.rhythm.accents,
          next.rhythm.pulsesPerBeat
        );
        beatsPerBar = Math.max(1, rhythm.beatsPerBar);
        meter = meterFromRhythm(rhythm);
      } else if (next.meter) {
        meter = next.meter;
        rhythm = rhythmFromTimeSignature(meter) || createRhythm(beatsPerBarFromMeter(meter));
        beatsPerBar = Math.max(1, rhythm.beatsPerBar || beatsPerBarFromMeter(meter));
      }
      if (next.tempo > 0) tempo = next.tempo;
      if (next.key) key = next.key;
      if (Array.isArray(next.chordLabels)) {
        chordLabels = next.chordLabels
          .map(function(label) { return String(label || '').trim(); })
          .filter(Boolean);
      }
      invalidatePreparedIfConfigChanged();
      notifyState();
    },

    async prepare() {
      if (!chordLabels.length) {
        return { ok: false, error: 'Select at least one chord' };
      }
      if (!meter) {
        return { ok: false, error: 'Set a time signature first' };
      }

      setState(CHORD_RECORD_STATES.PREPARING);
      stopMetronome();
      stopScheduledSources();

      try {
        await ensureAudioContext();
        const result = await primeChordFills(chordLabels, {
          meter: meter,
          tempo: tempo,
          key: key,
          beatsPerBar: beatsPerBar,
          audioContext: audioContext,
        });
        fillBuffers = normalizePreparedBuffers(result.buffers);
        if (result.errors && result.errors.length) {
          const details = result.errors.map(function(item) {
            return item.label + (item.error ? ' (' + item.error + ')' : '');
          }).join('; ');
          throw new Error('Failed to prepare fills for: ' + details);
        }
        syncPreparedCapture();
        setState(CHORD_RECORD_STATES.READY);
        return { ok: true, usedFallback: !!result.usedFallback };
      } catch (err) {
        setState(CHORD_RECORD_STATES.IDLE);
        return { ok: false, error: err && err.message ? err.message : String(err) };
      }
    },

    async startRecording() {
      if (state !== CHORD_RECORD_STATES.READY && state !== CHORD_RECORD_STATES.STOPPED) {
        return { ok: false };
      }
      if (!fillsMatchConfig()) {
        return { ok: false, error: 'Prepare recording again after changing tempo or meter' };
      }
      try {
        await ensureAudioContext();
      } catch (err) {
        return { ok: false, error: 'Audio context unavailable' };
      }

      stopMetronome();
      stopScheduledSources();
      setState(CHORD_RECORD_STATES.COUNT_IN);
      startContinuousMetronome();
      return { ok: true };
    },

    async previewChord(chordLabel) {
      const label = String(chordLabel || '').trim();
      if (!label) return { ok: false };
      if (state === CHORD_RECORD_STATES.COUNT_IN || state === CHORD_RECORD_STATES.RECORDING) {
        return { ok: false };
      }
      try {
        await ensureAudioContext();
      } catch (err) {
        return { ok: false, error: 'Audio context unavailable' };
      }
      if (!getFillBuffer(fillBuffers, label, {
        meter: meter,
        tempo: tempo,
        key: key,
        beatsPerBar: beatsPerBar,
      })) {
        return { ok: false, error: 'Prepare recording first' };
      }
      scheduleFillPlayback(label, audioContext.currentTime);
      return { ok: true };
    },

    onChordPress(chordLabel) {
      if (state === CHORD_RECORD_STATES.READY || state === CHORD_RECORD_STATES.STOPPED || state === CHORD_RECORD_STATES.IDLE) {
        this.previewChord(chordLabel);
        return null;
      }
      if (
        (state !== CHORD_RECORD_STATES.RECORDING && state !== CHORD_RECORD_STATES.COUNT_IN)
        || !capture
        || !audioContext
      ) {
        return null;
      }

      const result = capture.assignChordOnNextBeat(audioContext.currentTime, chordLabel);
      if (!result) return null;
      // Ignore taps that would land inside the count-in window.
      if (result.beatIndex < countInBeats) return null;

      lastAssignedChord = String(chordLabel || '').trim();
      const recordingBeat = result.beatIndex - countInBeats;
      const beatInBar = ((recordingBeat % beatsPerBar) + beatsPerBar) % beatsPerBar;
      const secondsPerBeat = 60 / Math.max(1, tempo);
      scheduleFillPlayback(lastAssignedChord, result.beatTime, {
        loop: true,
        offsetSec: beatInBar * secondsPerBeat,
      });
      notifyState();
      if (typeof opts.onChordAssigned === 'function') {
        opts.onChordAssigned(lastAssignedChord, result.beatIndex - countInBeats);
      }
      return {
        beatIndex: result.beatIndex - countInBeats,
        beatTime: result.beatTime,
      };
    },

    stopRecording() {
      stopMetronome();
      stopScheduledSources();
      const grid = capture
        ? assignmentsToChordGrid(capture.getAssignments(), meter, {
          endBeatIndex: currentBeatIndex >= 0 ? currentBeatIndex + countInBeats : undefined,
          startBeatIndex: countInBeats,
          beatsPerBar: beatsPerBar,
        })
        : '';
      absoluteBeatIndex = -1;
      currentBeatIndex = -1;
      setState(CHORD_RECORD_STATES.STOPPED);
      return grid;
    },

    /** Keep prepared fills; clear capture and return to READY so Start works again. */
    clearRecording() {
      stopMetronome();
      stopScheduledSources();
      absoluteBeatIndex = -1;
      currentBeatIndex = -1;
      lastAssignedChord = '';
      if (fillsMatchConfig()) {
        syncPreparedCapture();
        setState(CHORD_RECORD_STATES.READY);
        return { ok: true };
      }
      fillBuffers = new Map();
      capture = null;
      preparedMeta = null;
      setState(CHORD_RECORD_STATES.IDLE);
      return { ok: true, needsPrepare: true };
    },

    cancel() {
      stopMetronome();
      stopScheduledSources();
      fillBuffers = new Map();
      capture = null;
      preparedMeta = null;
      absoluteBeatIndex = -1;
      currentBeatIndex = -1;
      lastAssignedChord = '';
      setState(CHORD_RECORD_STATES.IDLE);
    },

    dispose() {
      this.cancel();
      if (gainNode) {
        try { gainNode.disconnect(); } catch (err) { /* ignore */ }
      }
      gainNode = null;
      audioContext = null;
    },
  };
}
