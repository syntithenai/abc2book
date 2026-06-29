import { Alert, Button } from 'react-bootstrap';
import useAbcjsParser from '../useAbcjsParser';
import {
  applyRhythmicScaffoldToAbc,
  applyWLinesToTune,
} from '../timedAbcDeriver';
import { resolvePrimaryVoiceKey } from '../abcVoiceUtils';

export default function TimedDerivationControls(props) {
  const tune = props.tune;
  const tunebook = props.tunebook;
  const abcjsParser = useAbcjsParser({ tunebook: tunebook });

  const hasTimedLyrics = tune && tune.timedLyrics && tune.timedLyrics.lines && tune.timedLyrics.lines.length > 0;
  const hasTimedMelody = tune && tune.timedMelody && tune.timedMelody.notes && tune.timedMelody.notes.length > 0;
  const hasTimedChords = tune && tune.timedChords && tune.timedChords.beatTimes && tune.timedChords.beatTimes.length > 0;

  function saveMergedAbc(mergedAbc, options) {
    const abcJson = tunebook.abcTools.abc2json(mergedAbc);
    abcJson.id = tune.id;
    if (options && options.timingScaffold) {
      abcJson.timingScaffold = true;
    }
    if (Array.isArray(tune.wLines) && tune.wLines.length > 0) {
      abcJson.wLines = tune.wLines.slice();
    }
    if (typeof props.onSaveTune === 'function') {
      props.onSaveTune(abcJson);
    } else {
      tunebook.saveTune(abcJson);
    }
    if (typeof props.onApplied === 'function') {
      props.onApplied();
    }
  }

  function handleGenerateWLines() {
    if (!hasTimedLyrics || !hasTimedMelody) return;
    if (!window.confirm('Generate note-aligned w: lyric lines from timed lyrics and melody?')) return;
    if (typeof props.pushHistory === 'function') {
      props.pushHistory(tune);
    }
    applyWLinesToTune(tune, tune.timedLyrics, tune.timedMelody);
    tune.id = tune.id;
    if (typeof props.onSaveTune === 'function') {
      props.onSaveTune(tune);
    } else {
      tunebook.saveTune(tune);
    }
    if (typeof props.onApplied === 'function') {
      props.onApplied();
    }
  }

  function handleGenerateScaffold() {
    if (!hasTimedChords) return;
    if (!window.confirm('Generate a rhythmic timing scaffold in the music voice? This marks the tune as a timing scaffold.')) return;
    if (typeof props.pushHistory === 'function') {
      props.pushHistory(tune);
    }
    const abc = props.abc || tunebook.abcTools.json2abc(tune);
    const merged = applyRhythmicScaffoldToAbc(tune, tunebook, abcjsParser, abc);
    const newAbcNotes = tunebook.abcTools.justNotes(merged);
    const abcJson = tunebook.abcTools.abc2json(abc);
    const voiceKey = resolvePrimaryVoiceKey(abcJson.voices);
    abcJson.voices[voiceKey] = { meta: '', notes: newAbcNotes.split('\n') };
    abcJson.timingScaffold = true;
    abcJson.id = tune.id;
    saveMergedAbc(tunebook.abcTools.json2abc(abcJson), { timingScaffold: true });
  }

  if (!hasTimedLyrics && !hasTimedChords) {
    return null;
  }

  return (
    <div style={{ marginTop: '0.8em', marginBottom: '0.8em', clear: 'both' }}>
      <Button
        variant="outline-primary"
        style={{ marginRight: '0.6em' }}
        disabled={!hasTimedLyrics || !hasTimedMelody}
        onClick={handleGenerateWLines}
      >
        Generate w: lines
      </Button>
      <Button
        variant="outline-secondary"
        disabled={!hasTimedChords}
        onClick={handleGenerateScaffold}
      >
        Generate timing scaffold
      </Button>
      {tune.timingScaffold && (
        <Alert variant="warning" style={{ marginTop: '0.6em', marginBottom: 0 }}>
          This tune is marked as a timing scaffold (beat grid + chords, not a transcribed melody).
        </Alert>
      )}
      {Array.isArray(tune.wLines) && tune.wLines.length > 0 && (
        <Alert variant="info" style={{ marginTop: '0.6em', marginBottom: 0 }}>
          {tune.wLines.length} note-aligned w: line(s) are stored on this tune and will export with ABC.
        </Alert>
      )}
    </div>
  );
}
