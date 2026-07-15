import { useCallback, useEffect, useRef } from 'react';
import { gmNameAt } from '../gmInstrumentNames';
import {
  LOCAL_SOUNDFONT_INSTRUMENTS,
  remapGmProgramToLocal,
} from '../localSoundfontInstrumentMap';
import { getSoundfontPlayerHostname, isResolverMusyngKiteReady } from '../soundFontConfig';

const instrumentCache = {};
let sharedCtx = null;

function resolveInstrumentName(programOrName) {
  if (typeof programOrName === 'string' && programOrName.trim()) {
    return programOrName.trim();
  }
  const program = Math.max(0, Math.min(127, Math.floor(Number(programOrName) || 0)));
  const fullReady = isResolverMusyngKiteReady();
  if (fullReady) return gmNameAt(program);
  const localProgram = remapGmProgramToLocal(program);
  const name = gmNameAt(localProgram);
  if (LOCAL_SOUNDFONT_INSTRUMENTS.indexOf(name) >= 0) return name;
  return 'acoustic_grand_piano';
}

function loadInstrument(instrumentName) {
  const name = instrumentName || 'acoustic_grand_piano';
  if (instrumentCache[name]) return instrumentCache[name];
  instrumentCache[name] = import('soundfont-player').then(function(mod) {
    const Soundfont = mod.default || mod;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!sharedCtx) sharedCtx = new AudioCtx();
    const hostname = getSoundfontPlayerHostname();
    return Soundfont.instrument(sharedCtx, name, {
      soundfont: 'MusyngKite',
      format: 'mp3',
      nameToUrl: function(instName, soundfont, format) {
        const host = String(hostname || '').replace(/\/+$/g, '');
        if (host.endsWith('/' + soundfont) || host.endsWith(soundfont)) {
          return host + '/' + instName + '-' + format + '.js';
        }
        return host + '/' + soundfont + '/' + instName + '-' + format + '.js';
      },
    }).then(function(instrument) {
      return { instrument: instrument, ctx: sharedCtx, name: name };
    }).catch(function() {
      // Fall back to default CDN piano if the named SF fails to load.
      return Soundfont.instrument(sharedCtx, 'acoustic_grand_piano').then(function(instrument) {
        return { instrument: instrument, ctx: sharedCtx, name: 'acoustic_grand_piano' };
      });
    });
  });
  return instrumentCache[name];
}

export function useNoteAudition(initialProgramOrName) {
  const loadedRef = useRef(null);
  const lastMidiRef = useRef(null);
  const lastTimeRef = useRef(0);
  const desiredNameRef = useRef(resolveInstrumentName(initialProgramOrName));

  const ensureInstrument = useCallback(function(programOrName) {
    const name = resolveInstrumentName(programOrName);
    desiredNameRef.current = name;
    return loadInstrument(name).then(function(result) {
      if (desiredNameRef.current === name) {
        loadedRef.current = result;
      }
      return result;
    });
  }, []);

  useEffect(function() {
    let cancelled = false;
    ensureInstrument(initialProgramOrName).then(function(result) {
      if (!cancelled) loadedRef.current = result;
    });
    return function() { cancelled = true; };
  }, [ensureInstrument, initialProgramOrName]);

  const auditionMidi = useCallback(function(midi, durationMs, programOrName) {
    const dur = durationMs || 200;
    const now = Date.now();
    if (lastMidiRef.current === midi && now - lastTimeRef.current < 80) return;
    lastMidiRef.current = midi;
    lastTimeRef.current = now;

    function playWith(loaded) {
      if (!loaded || !loaded.instrument) return;
      try {
        loaded.instrument.play(midi, loaded.ctx.currentTime, { duration: dur / 1000 });
      } catch (err) { /* ignore */ }
    }

    if (programOrName != null) {
      ensureInstrument(programOrName).then(playWith);
      return;
    }
    playWith(loadedRef.current);
  }, [ensureInstrument]);

  return { auditionMidi: auditionMidi, ensureInstrument: ensureInstrument };
}
