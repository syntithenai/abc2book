import { useCallback, useEffect, useRef, useState } from 'react';
import abcjs from 'abcjs';
import { getPlaybackSoundFontPlan, getSoundFontVolumeMultiplier } from './soundFontConfig';
import { remapFlattenedMidiPrograms } from './localSoundfontInstrumentMap';

const programOffsets = {
  bright_acoustic_piano: 55,
  honkytonk_piano: 55,
  electric_piano_1: 45,
  electric_piano_2: 45,
  acoustic_guitar_nylon: 15,
  acoustic_guitar_steel: 20,
  electric_guitar_jazz: 25,
  electric_guitar_clean: 15,
  electric_bass_finger: 15,
  violin: 35,
  viola: 30,
  cello: 30,
  contrabass: 40,
  trumpet: 10,
  trombone: 90,
  flute: 18,
  clarinet: 15,
};

export default function useAbcPreviewSynth() {
  const synthRef = useRef(null);
  const audioContextRef = useRef(null);
  const loadedAbcRef = useRef('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function getAudioContext() {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContextRef.current;
  }

  function stopSynth() {
    if (synthRef.current) {
      try { synthRef.current.stop(); } catch (e) { /* ignore */ }
      try { synthRef.current.pause(); } catch (e) { /* ignore */ }
    }
    setIsPlaying(false);
  }

  const loadAbc = useCallback(async function loadAbc(abc) {
    if (!abc || !String(abc).trim()) return false;
    if (!abcjs.synth.supportsAudio()) {
      setError('Audio playback is not supported in this browser');
      return false;
    }
    if (loadedAbcRef.current === abc && synthRef.current) return true;

    stopSynth();
    setLoading(true);
    setError('');
    loadedAbcRef.current = abc;

    try {
      const ac = getAudioContext();
      const host = document.createElement('div');
      const visualObjs = abcjs.renderAbc(host, abc, { add_classes: false });
      const visualObj = visualObjs && visualObjs[0];
      if (!visualObj) {
        throw new Error('Could not parse notation');
      }

      const soundFontPlan = getPlaybackSoundFontPlan({});
      const initOptions = {
        audioContext: ac,
        millisecondsPerMeasure: typeof visualObj.millisecondsPerMeasure === 'function'
          ? visualObj.millisecondsPerMeasure()
          : undefined,
        options: {
          soundFontUrl: soundFontPlan.url,
          soundFontVolumeMultiplier: getSoundFontVolumeMultiplier(),
          programOffsets: programOffsets,
        },
      };

      if (soundFontPlan.remap) {
        const flattened = visualObj.setUpAudio({});
        remapFlattenedMidiPrograms(flattened);
        initOptions.sequence = flattened;
      } else {
        initOptions.visualObj = visualObj;
      }

      const synth = new abcjs.synth.CreateSynth();
      await synth.init(initOptions);
      await synth.prime();
      synthRef.current = synth;
      if (ac.state === 'suspended') {
        await ac.resume();
      }
      setLoading(false);
      return true;
    } catch (e) {
      synthRef.current = null;
      loadedAbcRef.current = '';
      setLoading(false);
      setError((e && e.message) || 'Could not load preview audio');
      return false;
    }
  }, []);

  const play = useCallback(async function play(abc) {
    const ready = await loadAbc(abc);
    if (!ready || !synthRef.current) return;
    const ac = getAudioContext();
    if (ac.state === 'suspended') {
      await ac.resume();
    }
    if (typeof synthRef.current.seek === 'function') {
      synthRef.current.seek(0, 'seconds');
    }
    synthRef.current.start();
    setIsPlaying(true);
  }, [loadAbc]);

  const pause = useCallback(function pause() {
    if (synthRef.current) {
      try { synthRef.current.pause(); } catch (e) { /* ignore */ }
    }
    setIsPlaying(false);
  }, []);

  const rewind = useCallback(async function rewind(abc) {
    if (!abc || loadedAbcRef.current !== abc) {
      await loadAbc(abc);
    }
    if (!synthRef.current) return;
    pause();
    if (typeof synthRef.current.seek === 'function') {
      synthRef.current.seek(0, 'seconds');
    }
  }, [loadAbc, pause]);

  const togglePlay = useCallback(async function togglePlay(abc) {
    if (isPlaying) {
      pause();
      return;
    }
    await play(abc);
  }, [isPlaying, pause, play]);

  useEffect(function cleanup() {
    return function onUnmount() {
      stopSynth();
      synthRef.current = null;
      loadedAbcRef.current = '';
    };
  }, []);

  return {
    play: play,
    pause: pause,
    rewind: rewind,
    togglePlay: togglePlay,
    isPlaying: isPlaying,
    loading: loading,
    error: error,
  };
}
