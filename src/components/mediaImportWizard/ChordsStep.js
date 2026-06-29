import { useEffect, useMemo } from 'react';
import { Alert, Form } from 'react-bootstrap';
import useAbcjsParser from '../../useAbcjsParser';

export default function MediaImportChordsStep(props) {
  const abcjsParser = useAbcjsParser();
  const draft = props.draft;
  const hasDetectedChords = !!(draft.chordGridText && draft.chordGridText.trim());

  // When media analysis produced no chords, fall back to the chords already
  // present in the notation so the tab is never empty and the user can edit.
  const derivedFromNotation = useMemo(function() {
    if (hasDetectedChords) return '';
    const abc = draft.baseTuneAbc;
    if (!abc || !abc.trim()) return '';
    try {
      return abcjsParser.renderChords(abc, true) || '';
    } catch (e) {
      return '';
    }
  }, [hasDetectedChords, draft.baseTuneAbc]);

  useEffect(function() {
    if (!hasDetectedChords && derivedFromNotation && derivedFromNotation.trim()) {
      props.onChange({ chordGridText: derivedFromNotation, chordsFromNotation: true });
    }
  }, [derivedFromNotation, hasDetectedChords]);

  return (
    <div>
      <p>Edit the compressed chord grid. This will be merged into the notation on Finish.</p>
      {draft.chordsFromNotation && (
        <Alert variant="info">
          No chords were detected from the media. Showing the chords from the current notation — edit them as needed.
        </Alert>
      )}
      <Form.Control
        as="textarea"
        style={{ height: '24em', fontFamily: 'monospace' }}
        value={draft.chordGridText || ''}
        onChange={function(e) {
          props.onChange({ chordGridText: e.target.value });
        }}
        placeholder={'eg\nC|F# C|Cmin . . G |Cb\nD|D|A D . A |C'}
      />
    </div>
  );
}
