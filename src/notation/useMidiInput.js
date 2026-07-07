import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_MIDI_CHORD_WINDOW_MS, MIDI_CHORD_MODES } from './notationConstants';

export function isWebMidiSupported() {
  return typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess;
}

export default function useMidiInput(options) {
  const {
    enabled,
    selectedInputId,
    onNoteOn,
    onNoteOff,
    chordMode = MIDI_CHORD_MODES.STEP_CHORD,
    chordWindowMs = DEFAULT_MIDI_CHORD_WINDOW_MS,
    velocityThreshold = 1,
    recordActive = false,
  } = options || {};

  const [inputs, setInputs] = useState([]);
  const [access, setAccess] = useState(null);
  const [error, setError] = useState(null);
  const [activeNotes, setActiveNotes] = useState({});
  const chordBufferRef = useRef([]);
  const chordTimerRef = useRef(null);
  const onNoteOnRef = useRef(onNoteOn);
  const onNoteOffRef = useRef(onNoteOff);

  useEffect(function() { onNoteOnRef.current = onNoteOn; }, [onNoteOn]);
  useEffect(function() { onNoteOffRef.current = onNoteOff; }, [onNoteOff]);

  const refreshInputs = useCallback(function(midiAccess) {
    const list = [];
    midiAccess.inputs.forEach(function(port) {
      list.push({ id: port.id, name: port.name || port.id });
    });
    setInputs(list);
  }, []);

  const requestAccess = useCallback(async function() {
    if (!isWebMidiSupported()) {
      setError('Web MIDI is not supported in this browser');
      return null;
    }
    try {
      const midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      setAccess(midiAccess);
      refreshInputs(midiAccess);
      midiAccess.onstatechange = function() { refreshInputs(midiAccess); };
      setError(null);
      return midiAccess;
    } catch (e) {
      setError(e && e.message ? e.message : 'MIDI permission denied');
      return null;
    }
  }, [refreshInputs]);

  const flushChordBuffer = useCallback(function() {
    const buf = chordBufferRef.current;
    chordBufferRef.current = [];
    if (buf.length === 0) return;
    if (buf.length === 1) {
      if (onNoteOnRef.current) onNoteOnRef.current(buf[0]);
    } else if (onNoteOnRef.current) {
      onNoteOnRef.current({
        chord: true,
        midis: buf.map(function(n) { return n.midi; }),
        velocity: buf[0].velocity,
      });
    }
  }, []);

  const handleNoteOn = useCallback(function(msg) {
    const midi = msg.data[1];
    const velocity = msg.data[2];
    if (velocity < velocityThreshold) return;
    const payload = { midi: midi, velocity: velocity, channel: msg.data[0] & 0x0f };
    setActiveNotes(function(prev) {
      return Object.assign({}, prev, { [midi]: true });
    });

    if (recordActive || chordMode === MIDI_CHORD_MODES.SINGLE) {
      if (onNoteOnRef.current) onNoteOnRef.current(payload);
      return;
    }
    if (chordMode === MIDI_CHORD_MODES.ADD_TONE) {
      if (onNoteOnRef.current) onNoteOnRef.current(Object.assign({ addTone: true }, payload));
      return;
    }
    chordBufferRef.current.push(payload);
    clearTimeout(chordTimerRef.current);
    chordTimerRef.current = setTimeout(flushChordBuffer, chordWindowMs);
  }, [recordActive, chordMode, chordWindowMs, flushChordBuffer, velocityThreshold]);

  const handleMessage = useCallback(function(msg) {
    const status = msg.data[0] & 0xf0;
    if (status === 0x90 && msg.data[2] > 0) handleNoteOn(msg);
    else if (status === 0x80 || (status === 0x90 && msg.data[2] === 0)) {
      const midi = msg.data[1];
      if (onNoteOffRef.current) onNoteOffRef.current({ midi: midi });
      setActiveNotes(function(prev) {
        const next = Object.assign({}, prev);
        delete next[midi];
        return next;
      });
    }
  }, [handleNoteOn]);

  useEffect(function() {
    if (!enabled || !access) return undefined;
    const ports = [];
    function attach(port) {
      if (!port) return;
      port.onmidimessage = handleMessage;
      ports.push(port);
    }
    if (selectedInputId) {
      attach(access.inputs.get(selectedInputId));
    } else {
      access.inputs.forEach(attach);
    }
    return function() {
      ports.forEach(function(port) { port.onmidimessage = null; });
      clearTimeout(chordTimerRef.current);
    };
  }, [enabled, access, selectedInputId, handleMessage]);

  return {
    inputs: inputs,
    error: error,
    activeNotes: activeNotes,
    requestAccess: requestAccess,
    isSupported: isWebMidiSupported(),
  };
}
