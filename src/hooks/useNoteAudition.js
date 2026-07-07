import { useCallback, useEffect, useRef } from 'react';

let instrumentPromise = null;

function loadInstrument() {
  if (instrumentPromise) return instrumentPromise;
  instrumentPromise = import('soundfont-player').then(function(mod) {
    const Soundfont = mod.default || mod;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    return Soundfont.instrument(ctx, 'acoustic_grand_piano').then(function(instrument) {
      return { instrument: instrument, ctx: ctx };
    });
  });
  return instrumentPromise;
}

export function useNoteAudition() {
  const loadedRef = useRef(null);
  const lastMidiRef = useRef(null);
  const lastTimeRef = useRef(0);

  useEffect(function() {
    let cancelled = false;
    loadInstrument().then(function(result) {
      if (!cancelled) loadedRef.current = result;
    });
    return function() { cancelled = true; };
  }, []);

  const auditionMidi = useCallback(function(midi, durationMs) {
    const dur = durationMs || 200;
    const now = Date.now();
    if (lastMidiRef.current === midi && now - lastTimeRef.current < 80) return;
    lastMidiRef.current = midi;
    lastTimeRef.current = now;
    const loaded = loadedRef.current;
    if (!loaded || !loaded.instrument) return;
    try {
      loaded.instrument.play(midi, loaded.ctx.currentTime, { duration: dur / 1000 });
    } catch (err) { /* ignore */ }
  }, []);

  return { auditionMidi: auditionMidi };
}
