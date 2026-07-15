export function resolveNotationAction(event, context) {
  const mod = event.metaKey || event.ctrlKey;
  const shift = event.shiftKey;
  const alt = event.altKey;
  const key = event.key;

  if (mod && key.toLowerCase() === 'z' && shift) return { action: 'redo' };
  if (mod && key.toLowerCase() === 'z') return { action: 'undo' };
  if (mod && shift && key.toLowerCase() === 'x') return { action: 'swapClipboard' };
  if (mod && key.toLowerCase() === 'c') return { action: 'copy' };
  if (mod && key.toLowerCase() === 'x') return { action: 'cut' };
  if (mod && key.toLowerCase() === 'v') return { action: 'paste' };
  if (mod && !shift && key.toLowerCase() === 'k') return { action: 'editChordSymbol' };
  if (mod && !shift && key.toLowerCase() === 'f') return { action: 'editFingering' };
  if (mod && shift && key.toLowerCase() === 'i') return { action: 'setNoteInputMethod', method: 'rePitch' };
  if (mod && alt && key.toLowerCase() === 'p') return { action: 'togglePianoRoll' };
  if (mod && !shift && key.toLowerCase() === 'b') return { action: 'insertMeasure' };

  if (!mod && !alt && key.toLowerCase() === 'n') return { action: 'toggleNoteInput' };
  if (!mod && !alt && !shift && key.toLowerCase() === 'm') return { action: 'setNoteInputMethod', method: 'duration' };
  if (key === 'Escape') return { action: 'exitNoteInput' };
  if (key >= '1' && key <= '9') return { action: 'setDuration', key: parseInt(key, 10) };
  if (key === '.') return { action: 'toggleDot' };
  if (key === '0') return { action: 'insertRest' };
  if (key === 'T' || key === 't') return { action: 'toggleTie' };
  if (key === 'R' || key === 'r') return { action: 'repeat' };

  if (key.length === 1) {
    const pitchLetter = key.toUpperCase();
    if (pitchLetter >= 'A' && pitchLetter <= 'G') {
      return { action: shift ? 'addChordTone' : 'insertPitch', letter: pitchLetter };
    }
  }
  if (key === 'ArrowLeft') {
    if (mod) return { action: 'prevMeasure' };
    if (shift) return { action: 'extendSelection', delta: -1 };
    return { action: 'prevEvent' };
  }
  if (key === 'ArrowRight') {
    if (mod) return { action: 'nextMeasure' };
    if (shift) return { action: 'extendSelection', delta: 1 };
    return { action: 'nextEvent' };
  }
  if (key === 'ArrowUp') {
    if (mod) return { action: 'transposeOctave', delta: 1 };
    if (alt && shift) return { action: 'transposeDiatonic', delta: 1 };
    return { action: 'transposeChromatic', delta: 1 };
  }
  if (key === 'ArrowDown') {
    if (mod) return { action: 'transposeOctave', delta: -1 };
    if (alt && shift) return { action: 'transposeDiatonic', delta: -1 };
    return { action: 'transposeChromatic', delta: -1 };
  }
  if (key === 'Backspace') return { action: mod ? 'removeRange' : 'deleteToRest', backward: true };
  if (key === 'Delete') return { action: mod ? 'removeRange' : 'deleteToRest', backward: false };
  if (shift && (key === 'Q' || key === 'q')) return { action: 'halveDurationDotAware' };
  if (shift && (key === 'W' || key === 'w')) return { action: 'doubleDurationDotAware' };
  if (!shift && (key === 'Q' || key === 'q')) return { action: 'halveDuration' };
  if (!shift && (key === 'W' || key === 'w')) return { action: 'doubleDuration' };
  if (key === '-' && !mod) return { action: 'accidental', value: -1 };
  if (key === '=' && !mod) return { action: 'accidental', value: 0 };
  if (key === '+' && !mod) return { action: 'accidental', value: 1 };
  if (!mod && !shift && key === 's') return { action: 'toggleSnap' };
  if (!mod && key === '|') return { action: 'insertBarline', barToken: '|' };
  if (!mod && key === '!') return { action: 'insertSystemBreak' };
  if (key === 'Insert') return { action: 'insertMeasure' };
  if (!mod && !shift && !alt && (key === 'j' || key === 'J')) return { action: 'respellEnharmonic' };

  return null;
}
