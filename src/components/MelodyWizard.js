import { Alert, Button, Form } from 'react-bootstrap';
import { useEffect, useRef, useState } from 'react';
import ParserProblemsDiff from './ParserProblemsDiff';
import useAbcjsParser from '../useAbcjsParser';
import CreatableSelect from 'react-select/creatable';
import TuneMediaAnalysisButton from './TuneMediaAnalysisButton';
import useTuneMediaAnalysis from '../useTuneMediaAnalysis';
import { loadTimedMediaDraft, saveTimedMediaDraft } from '../timedMediaCache';
import { timedMelodyToAbc } from '../timedMelodyModel';
import { resolvePrimaryVoiceKey } from '../abcVoiceUtils';
import MelodyProcessingPanel from './MelodyProcessingPanel';
import TimedDerivationControls from './TimedDerivationControls';
import {
  loadMelodyProcessingSettings,
  saveMelodyProcessingSettings,
} from '../melodyProcessingSettings';

export default function MelodyWizard(props) {
  const [melody, setMelody] = useState('');
  const [processingSettings, setProcessingSettings] = useState(loadMelodyProcessingSettings());
  const abcjsParser = useAbcjsParser({ tunebook: props.tunebook });
  const { analysis } = useTuneMediaAnalysis({ tune: props.tune });
  const lastAppliedVersionRef = useRef(0);
  const tune = props.tune;

  useEffect(function() {
    if (!analysis || !analysis.formatted || !analysis.formatted.melodyText) return;
    if (analysis.version === lastAppliedVersionRef.current) return;
    lastAppliedVersionRef.current = analysis.version;
    setMelody(analysis.formatted.melodyText);
    if (tune && tune.id) {
      saveTimedMediaDraft(tune.id, { melodyAbcText: analysis.formatted.melodyText });
    }
  }, [analysis, tune]);

  const tuneId = tune && tune.id
  useEffect(function() {
    if (!tune || !tune.id) return;
    loadTimedMediaDraft(tune.id).then(function(draft) {
      if (draft && draft.melodyAbcText) {
        setMelody(draft.melodyAbcText);
        return;
      }
      if (tune.timedMelody) {
        const meter = tune.meter || '4/4';
        const beatsPerBar = props.tunebook.abcTools.getBeatsPerBar(meter) || 4;
        const barSlots = props.tunebook.abcTools.getNoteLengthsPerBar(
          tune.noteLength || '1/8',
          meter
        );
        const slotsPerBeat = barSlots && beatsPerBar
          ? Math.max(1, Math.round(barSlots / beatsPerBar))
          : 2;
        const abcText = timedMelodyToAbc(tune.timedMelody, {
          beatsPerBar: beatsPerBar,
          slotsPerBeat: slotsPerBeat,
          noteLength: tune.noteLength,
        });
        if (abcText) setMelody(abcText);
      }
    });
  }, [tune, tuneId, props.tunebook.abcTools]);

  useEffect(function() {
    if (Array.isArray(props.notes) && props.notes.length > 0) {
      setMelody(props.notes.join('\n'));
    }
  }, [props.notes, props.tunebook.abcTools, tune]);

  return <div>
    <Form.Group controlId="melodywiz">
      <div style={{ clear: 'both' }}>
        <TuneMediaAnalysisButton
          tune={tune}
          label="Listen"
          activeLabel="Listening..."
          buttonStyle={{ float: 'left', marginRight: '1em' }}
        />

        <Button variant="success" style={{ float: 'right', marginRight: '1em' }} onClick={function() {
          if (!window.confirm('Do you really want to update your music with this melody?')) return;
          var newAbcNotes = props.tunebook.abcTools.justNotes(abcjsParser.mergeMelody(melody, props.abc));
          var abcJson = props.tunebook.abcTools.abc2json(props.abc);
          var useVoiceKey = resolvePrimaryVoiceKey(abcJson.voices);
          abcJson.voices[useVoiceKey] = { meta: '', notes: newAbcNotes.split('\n') };
          props.tunebook.saveTune(abcJson, false, { historyLabel: 'Apply melody', immediate: true });
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

    <MelodyProcessingPanel
      settings={processingSettings}
      onChange={function(next) {
        setProcessingSettings(next);
        saveMelodyProcessingSettings(next);
      }}
    />

    <TimedDerivationControls
      tune={tune}
      tunebook={props.tunebook}
      abc={props.abc}
      onSaveTune={function(updated, historyOptions) {
        props.tunebook.saveTune(updated || tune, false, historyOptions || { historyLabel: 'Apply melody', immediate: true });
      }}
    />

    <Form.Control
      disabled={!tune.meter}
      style={{ height: '20em' }}
      as="textarea"
      placeholder={'eg\nC D E F | G2 A B c |'}
      value={melody}
      onChange={function(e) {
        setMelody(e.target.value);
        if (tune && tune.id) {
          saveTimedMediaDraft(tune.id, { melodyAbcText: e.target.value });
        }
      }}
    />
    {!analysis && (
      <Alert variant="info" style={{ marginTop: '0.8em' }}>
        Use Listen on any Lyrics, Chords, or Melody tab to analyze linked media once. Lyrics are applied immediately and can be undone with the back arrow. Chords and melody stay here until you press Save.
      </Alert>
    )}
  </div>;
}
