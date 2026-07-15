import { useEffect, useState } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';
import ChordRecordControls from './ChordRecordControls';
import './ChordSectionRecordModal.css';

/**
 * Full-screen record dialog for one section or the whole grid.
 * Save writes chords into ABC via onSave.
 */
export default function ChordSectionRecordModal(props) {
  const show = !!props.show;
  const title = props.title || 'Record chords';
  const existingChart = String(props.chart == null ? '' : props.chart);
  const [draft, setDraft] = useState('');

  useEffect(function() {
    if (!show) return;
    setDraft('');
  }, [show, props.sectionKey]);

  function handleSave() {
    const chart = String(draft || '').trim() ? draft : existingChart;
    if (typeof props.onSave === 'function') {
      props.onSave({ chart: chart, meter: props.meter });
    }
  }

  return (
    <Modal
      show={show}
      onHide={props.onHide}
      fullscreen
      className="chord-section-record-modal"
    >
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body className="chord-section-record-modal-body">
        <ChordRecordControls
          tune={props.tune}
          meter={props.meter || (props.tune && props.tune.meter)}
          initialChords={existingChart}
          autoActivate={!!props.autoActivate}
          onChordsCaptured={function(gridText) {
            setDraft(String(gridText || ''));
          }}
          onRecordingReset={function() {
            setDraft('');
          }}
        />
        <div className="chord-section-record-compare">
          <div className="chord-section-record-compare-pane">
            <div className="small text-muted mb-1">Existing</div>
            <pre className="chord-section-record-compare-pre">
              {existingChart.trim() ? existingChart : '(none)'}
            </pre>
          </div>
          <div className="chord-section-record-compare-pane">
            <div className="small text-muted mb-1">Recorded (editable)</div>
            <Form.Control
              as="textarea"
              rows={6}
              className="chord-section-record-compare-textarea"
              value={draft}
              placeholder="Stop recording to fill this, or type/edit chord grid text here"
              onChange={function(e) {
                setDraft(e.target.value);
              }}
            />
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={props.onHide}>Cancel</Button>
        <Button
          variant="success"
          disabled={!String(draft || '').trim() && !String(existingChart || '').trim()}
          onClick={handleSave}
        >
          Save
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
