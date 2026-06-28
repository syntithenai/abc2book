import { Alert, Button, Form } from 'react-bootstrap';
import { useEffect, useRef, useState } from 'react';
import ParserProblemsDiff from './ParserProblemsDiff';
import useAbcjsParser from '../useAbcjsParser';
import CreatableSelect from 'react-select/creatable';
import TuneMediaAnalysisButton from './TuneMediaAnalysisButton';
import useTuneMediaAnalysis from '../useTuneMediaAnalysis';

export default function MelodyWizard(props) {
  const [melody, setMelody] = useState('');
  const abcjsParser = useAbcjsParser({ tunebook: props.tunebook });
  const { analysis } = useTuneMediaAnalysis();
  const lastAppliedVersionRef = useRef(0);
  const tune = props.tune;

  useEffect(function() {
    if (!analysis || !analysis.formatted || !analysis.formatted.melodyText) return;
    if (analysis.version === lastAppliedVersionRef.current) return;
    lastAppliedVersionRef.current = analysis.version;
    setMelody(analysis.formatted.melodyText);
  }, [analysis]);

  useEffect(function() {
    if (Array.isArray(props.notes) && props.notes.length > 0) {
      setMelody(props.notes.join('\n'));
    }
  }, [props.notes]);

  return <div>
    <Form.Group controlId="melodywiz">
      <div style={{ clear: 'both' }}>
        <TuneMediaAnalysisButton
          label="Listen"
          activeLabel="Listening..."
          buttonStyle={{ float: 'left', marginRight: '1em' }}
        />

        <Button variant="success" style={{ float: 'right', marginRight: '1em' }} onClick={function() {
          if (!window.confirm('Do you really want to update your music with this melody?')) return;
          var newAbcNotes = props.tunebook.abcTools.justNotes(melody);
          var abcJson = props.tunebook.abcTools.abc2json(props.abc);
          var keyList = Object.keys(abcJson.voices).sort();
          var useVoiceKey = keyList.length > 0 ? keyList[0] : null;
          if (useVoiceKey === null) {
            abcJson.voices[1] = { meta: '', notes: newAbcNotes.split('\n') };
          } else {
            abcJson.voices[parseInt(useVoiceKey, 10)] = { meta: '', notes: newAbcNotes.split('\n') };
          }
          props.tunebook.saveTune(abcJson);
        }}>Save</Button>

        <Button
          style={{ float: 'right', marginRight: '3em' }}
          variant="danger"
          onClick={function() {
            if (!window.confirm('Do you really want to reset any changes you have made to this melody?')) return;
            if (Array.isArray(props.notes)) {
              setMelody(props.notes.join('\n'));
            } else {
              setMelody('');
            }
          }}
        >Reset</Button>

        <div style={{ float: 'right', marginRight: '1em' }}><ParserProblemsDiff tunebook={props.tunebook} abc={props.abc} /></div>
      </div>
      <div style={{ clear: 'both' }} />
      <Form.Label>Time Signature</Form.Label>
      <CreatableSelect
        value={tune.meter ? { value: tune.meter, label: tune.meter } : { value: '', label: '' }}
        onChange={function(val) { tune.meter = val.label; props.saveTune(tune); }}
        options={props.tunebook.abcTools.getTimeSignatureTypes().map(function(type) {
          return { value: type, label: type };
        })}
        isClearable={false}
        blurInputOnSelect={true}
        createOptionPosition={'first'}
        allowCreateWhileLoading={true}
        allowCreate={true}
      />
      <Form.Label>Repeats</Form.Label>
      <Form.Control
        type="text"
        placeholder="eg 100"
        value={tune.repeats ? tune.repeats : ''}
        onChange={function(e) { tune.repeats = e.target.value; tune.id = props.tuneId; props.saveTune(tune); }}
      />
    </Form.Group>

    <Form.Control
      disabled={!tune.meter}
      style={{ height: '20em' }}
      as="textarea"
      placeholder={'eg\nC D E F | G2 A B c |'}
      value={melody}
      onChange={function(e) { setMelody(e.target.value); }}
    />
    {!analysis && (
      <Alert variant="info" style={{ marginTop: '0.8em' }}>
        Use Listen on any Lyrics, Chords, or Melody tab to analyze linked media once. Lyrics are applied immediately and can be undone with the back arrow. Chords and melody stay here until you press Save.
      </Alert>
    )}
  </div>;
}
