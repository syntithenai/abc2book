import Metronome from './Metronome';
import { createRhythm, slotPulseIndex } from './metronomeRhythmPresets';
import { beatsPerBarFromMeter } from './chordFillPattern';
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

export function createChordRecordSession(options) {
  const opts = options || {};
  let state = CHORD_RECORD_STATES.IDLE;
  let meter = opts.meter || '4/4';
  let tempo = opts.tempo > 0 ? opts.tempo : 120;
  let key = opts.key || 'C';
  let beatsPerBar = beatsPerBarFromMeter(meter);
  let chordLabels = [];

  let audioContext = null;
  let gainNode = null;
  let fillBuffers = new Map();
  let capture = null;
  let metronome = null;
  let currentBeatIndex = -1;
  let lastAssignedChord = '';
  let scheduledSources = [];

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
    const beatInBar = currentBeatIndex >= 0
      ? (currentBeatIndex % beatsPerBar) + 1
      : 0;
    const barNumber = currentBeatIndex >= 0
      ? Math.floor(currentBeatIndex / beatsPerBar) + 1
      : 0;
    return {
      state: state,
      meter: meter,
      tempo: tempo,
      key: key,
      chordLabels: chordLabels.slice(),
      currentBeatIndex: currentBeatIndex,
      beatInBar: beatInBar,
      barNumber: barNumber,
      lastAssignedChord: lastAssignedChord,
    };
  }

  function stopMetronome() {
    if (metronome) {
      metronome.stop();
      metronome = null;
    }
  }

  function stopScheduledSources() {
    scheduledSources.forEach(function(source) {
      try {
        source.stop();
      } catch (err) { /* ignore */ }
    });
    scheduledSources = [];
  }

  function scheduleFillPlayback(chordLabel, when) {
    if (!audioContext || !gainNode) return;
    const buffer = getFillBuffer(fillBuffers, chordLabel, { meter: meter, tempo: tempo, key: key });
    if (!buffer) return;
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(gainNode);
    const startAt = Math.max(when, audioContext.currentTime + 0.01);
    source.start(startAt);
    scheduledSources.push(source);
    source.onended = function() {
      scheduledSources = scheduledSources.filter(function(item) { return item !== source; });
    };
  }

  function startRecordingMetronome() {
    const rhythm = createRhythm(beatsPerBar);
    const anchor = audioContext.currentTime + 0.05;
    capture.reset(anchor);
    currentBeatIndex = -1;
    lastAssignedChord = '';

    metronome = new Metronome(
      audioContext,
      tempo,
      beatsPerBar,
      0,
      null,
      function onError() {
        if (typeof opts.onError === 'function') {
          opts.onError('Metronome could not start');
        }
      },
      rhythm
    );

    metronome.onSlotChange = function(slotIndex, rhythmState) {
      if (slotPulseIndex(rhythmState, slotIndex) !== 0) return;
      currentBeatIndex += 1;
      if (capture.getBeatTimes().length <= currentBeatIndex + beatsPerBar) {
        capture.extendBeats(beatsPerBar);
      }
      notifyState();
    };

    metronome.start();
    setState(CHORD_RECORD_STATES.RECORDING);
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

  return {
    getState: function() { return state; },
    getSnapshot: getSnapshot,

    configure(config) {
      const next = config || {};
      if (next.meter) {
        meter = next.meter;
        beatsPerBar = beatsPerBarFromMeter(meter);
      }
      if (next.tempo > 0) tempo = next.tempo;
      if (next.key) key = next.key;
      if (Array.isArray(next.chordLabels)) {
        chordLabels = next.chordLabels
          .map(function(label) { return String(label || '').trim(); })
          .filter(Boolean);
      }
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
          audioContext: audioContext,
        });
        fillBuffers = result.buffers;
        if (result.errors && result.errors.length) {
          const failed = result.errors.map(function(item) { return item.label; }).join(', ');
          throw new Error('Failed to prepare fills for: ' + failed);
        }
        capture = createBeatCapture({ tempo: tempo, beatsPerBar: beatsPerBar });
        setState(CHORD_RECORD_STATES.READY);
        return { ok: true };
      } catch (err) {
        setState(CHORD_RECORD_STATES.IDLE);
        return { ok: false, error: err && err.message ? err.message : String(err) };
      }
    },

    async startRecording() {
      if (state !== CHORD_RECORD_STATES.READY) return { ok: false };
      try {
        await ensureAudioContext();
      } catch (err) {
        return { ok: false, error: 'Audio context unavailable' };
      }

      stopMetronome();
      stopScheduledSources();
      setState(CHORD_RECORD_STATES.COUNT_IN);

      const rhythm = createRhythm(beatsPerBar);
      metronome = new Metronome(
        audioContext,
        tempo,
        beatsPerBar,
        beatsPerBar,
        function onCountInDone() {
          stopMetronome();
          startRecordingMetronome();
        },
        function onError() {
          setState(CHORD_RECORD_STATES.READY);
          if (typeof opts.onError === 'function') {
            opts.onError('Count-in could not start');
          }
        },
        rhythm
      );
      metronome.start();
      return { ok: true };
    },

    onChordPress(chordLabel) {
      if (state !== CHORD_RECORD_STATES.RECORDING || !capture || !audioContext) return null;
      const result = capture.assignChordOnNextBeat(audioContext.currentTime, chordLabel);
      if (!result) return null;
      lastAssignedChord = String(chordLabel || '').trim();
      scheduleFillPlayback(lastAssignedChord, result.beatTime);
      notifyState();
      if (typeof opts.onChordAssigned === 'function') {
        opts.onChordAssigned(lastAssignedChord, result.beatIndex);
      }
      return result;
    },

    stopRecording() {
      stopMetronome();
      stopScheduledSources();
      const grid = capture
        ? assignmentsToChordGrid(capture.getAssignments(), meter, {
          endBeatIndex: currentBeatIndex >= 0 ? currentBeatIndex : undefined,
        })
        : '';
      setState(CHORD_RECORD_STATES.STOPPED);
      return grid;
    },

    cancel() {
      stopMetronome();
      stopScheduledSources();
      fillBuffers = new Map();
      capture = null;
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
