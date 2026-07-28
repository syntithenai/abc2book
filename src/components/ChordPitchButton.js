import { useCallback, useMemo, useRef } from 'react';
import { Button, ButtonGroup } from 'react-bootstrap';
import { useNoteAudition } from '../hooks/useNoteAudition';
import { playChordPitchCue, resolveChordPitchTarget } from '../chordPitchCue';

const PITCH_INSTRUMENT = 'flute';

export default function ChordPitchButton(props) {
  const {
    chordChart,
    structureSelector,
    lastNotationChordRef,
    icon,
    size,
    className,
    disabled,
  } = props;

  const playingRef = useRef(false);
  const { auditionMidi, ensureInstrument } = useNoteAudition(PITCH_INSTRUMENT);

  const previewChord = useMemo(function() {
    return resolveChordPitchTarget({
      chordChart: chordChart,
      structureSelector: structureSelector,
      lastNotationChord: lastNotationChordRef && lastNotationChordRef.current
        ? lastNotationChordRef.current
        : '',
    });
  }, [chordChart, structureSelector, lastNotationChordRef]);

  const playNote = useCallback(function(midi, durationMs) {
    auditionMidi(midi, durationMs, PITCH_INSTRUMENT);
  }, [auditionMidi]);

  const playChord = useCallback(function(midis, durationMs) {
    ensureInstrument(PITCH_INSTRUMENT).then(function(loaded) {
      if (!loaded || !loaded.instrument || !loaded.ctx) return;
      const when = loaded.ctx.currentTime;
      const dur = (durationMs || 1100) / 1000;
      midis.forEach(function(midi) {
        try {
          loaded.instrument.play(midi, when, { duration: dur });
        } catch (err) { /* ignore */ }
      });
    });
  }, [ensureInstrument]);

  const handleClick = useCallback(function() {
    if (playingRef.current || disabled) return;
    const chordLabel = resolveChordPitchTarget({
      chordChart: chordChart,
      structureSelector: structureSelector,
      lastNotationChord: lastNotationChordRef && lastNotationChordRef.current
        ? lastNotationChordRef.current
        : '',
    });
    if (!chordLabel) return;
    playingRef.current = true;
    playChordPitchCue(chordLabel, { playNote: playNote, playChord: playChord })
      .finally(function() {
        playingRef.current = false;
      });
  }, [chordChart, structureSelector, lastNotationChordRef, disabled, playNote, playChord]);

  const title = previewChord
    ? 'Pitch chord (' + previewChord + ')'
    : 'Pitch chord';

  return (
    <ButtonGroup
      size={size || 'sm'}
      className={'chord-pitch-group' + (className ? ' ' + className : '')}
    >
      <Button
        variant="outline-secondary"
        disabled={!!disabled || !previewChord}
        onClick={handleClick}
        aria-label={title}
        title={title}
      >
        {icon || '♫'}
      </Button>
    </ButtonGroup>
  );
}
