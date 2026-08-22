import { Alert, Button, ButtonGroup } from 'react-bootstrap';

function confidenceVariant(confidence) {
  if (confidence >= 0.7) return 'success';
  if (confidence >= 0.45) return 'warning';
  return 'danger';
}

function confidenceLabel(confidence) {
  if (confidence >= 0.7) return 'High confidence';
  if (confidence >= 0.45) return 'Moderate confidence';
  return 'Low confidence';
}

export default function MidiImportDiagnostics(props) {
  const candidate = props.candidate;
  const midi = candidate && candidate.midiImport;
  const chordMeta = midi && midi.chords ? midi.chords : null;
  const warnings = (candidate && candidate.importWarnings) || [];
  if (!midi && !warnings.length) return null;

  const confidence = typeof midi.confidence === 'number' ? midi.confidence : null;
  const diagnostics = midi && midi.diagnostics ? midi.diagnostics : {};
  const profile = midi && midi.profile ? midi.profile : {};
  const chordConfidence = chordMeta && typeof chordMeta.confidence === 'number'
    ? chordMeta.confidence
    : null;

  return (
    <Alert variant={confidence != null ? confidenceVariant(confidence) : 'info'} className="mt-2 py-2">
      <div className="fw-semibold">MIDI import</div>
      {midi && midi.strategy ? (
        <div className="small">
          Strategy: {midi.strategy}
          {midi.mode ? ' · Mode: ' + midi.mode : ''}
          {confidence != null ? ' · ' + confidenceLabel(confidence) + ' (' + Math.round(confidence * 100) + '%)' : ''}
        </div>
      ) : null}
      {chordMeta && chordMeta.source && chordMeta.source !== 'none' ? (
        <div className="small text-muted">
          Chords: {chordMeta.source}
          {Array.isArray(chordMeta.tracksUsed) && chordMeta.tracksUsed.length
            ? ' (tracks ' + chordMeta.tracksUsed.join(', ') + ')'
            : ''}
          {chordConfidence != null ? ' · ' + Math.round(chordConfidence * 100) + '% confidence' : ''}
          {midi && midi.harmonyAbc ? ' · harmony voice included' : ''}
        </div>
      ) : null}
      {diagnostics.tracks_analyzed != null ? (
        <div className="small text-muted">
          Tracks analyzed: {diagnostics.tracks_analyzed}
          {diagnostics.tracks_imported != null ? ', imported: ' + diagnostics.tracks_imported : ''}
          {typeof diagnostics.quant_error === 'number' ? ', quant error: ' + diagnostics.quant_error : ''}
        </div>
      ) : null}
      {profile.voice_count_mismatch ? (
        <div className="small text-warning">
          Voice count mismatch: local SMF {profile.voice_count_client}, resolver {profile.voice_count_server}.
          Import used the local SMF voice list.
        </div>
      ) : null}
      {Array.isArray(midi.importVoices) && midi.importVoices.length ? (
        <div className="small text-muted">
          Import voices: {midi.importVoices.map(function(voice) {
            const staff = voice.staff && voice.staff !== 'auto' ? ' [' + voice.staff + ']' : '';
            const sources = (voice.sourceIds || []).length > 1
              ? ' (merged ' + voice.sourceIds.join('+') + ')'
              : '';
            return (voice.displayName || voice.name || 'voice') + staff + sources;
          }).join(' · ')}
        </div>
      ) : null}
      {profile.estimated_key ? (
        <div className="small text-muted">
          Detected key: {profile.estimated_key}
          {profile.time_signature ? ', meter: ' + profile.time_signature : ''}
          {profile.tempo_bpm ? ', tempo: ' + Math.round(profile.tempo_bpm) : ''}
        </div>
      ) : null}
      {warnings.length > 0 ? (
        <ul className="small mb-2 ps-3">
          {warnings.map(function(warning, index) {
            return <li key={'midi-warn-' + index}>{warning}</li>;
          })}
        </ul>
      ) : null}
      {typeof props.onReimport === 'function' ? (
        <ButtonGroup size="sm" className="mt-1">
          <Button
            variant="outline-secondary"
            onClick={function() { props.onReimport('melody', true); }}
          >
            Melody + chords
          </Button>
          <Button
            variant="outline-secondary"
            onClick={function() { props.onReimport('melody', false); }}
          >
            Melody only
          </Button>
          <Button
            variant="outline-secondary"
            onClick={function() { props.onReimport('multi_voice', true); }}
          >
            All voices + chords
          </Button>
        </ButtonGroup>
      ) : null}
    </Alert>
  );
}
