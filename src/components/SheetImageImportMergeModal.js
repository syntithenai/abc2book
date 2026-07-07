import { useEffect, useState } from 'react';
import { Button, Form, Modal } from 'react-bootstrap';

function defaultMergeOptions(result, chordText, melodyAbc, title, artist, key, meter) {
  const resolvedTitle = title != null ? title : (result && result.title);
  const resolvedArtist = artist != null ? artist : (result && result.artist);
  const resolvedKey = key != null ? key : (result && result.melody && result.melody.key);
  const resolvedMeter = meter != null ? meter : (result && result.melody && result.melody.meter);
  return {
    title: !!String(resolvedTitle || '').trim(),
    composer: !!String(resolvedArtist || '').trim(),
    chordsLyrics: !!String(chordText || '').trim(),
    melody: !!String(melodyAbc || '').trim(),
    keyMeter: !!(String(resolvedKey || '').trim() || String(resolvedMeter || '').trim()),
  };
}

export default function SheetImageImportMergeModal(props) {
  const [options, setOptions] = useState(
    defaultMergeOptions(
      props.result, props.chordText, props.melodyAbc, props.title, props.artist, props.keyName, props.meter
    )
  );

  useEffect(function() {
    if (props.show) {
      setOptions(defaultMergeOptions(
        props.result, props.chordText, props.melodyAbc, props.title, props.artist, props.keyName, props.meter
      ));
    }
  }, [props.show, props.result, props.chordText, props.melodyAbc, props.title, props.artist, props.keyName, props.meter]);

  function toggleOption(key) {
    setOptions(function(prev) {
      const next = Object.assign({}, prev);
      next[key] = !prev[key];
      return next;
    });
  }

  function confirmImport() {
    const enabled = Object.keys(options).some(function(key) { return options[key]; });
    if (!enabled) return;
    if (props.onConfirm) props.onConfirm(options);
  }

  const hasAny = Object.keys(options).some(function(key) { return options[key]; });
  const titleLabel = String(props.title != null ? props.title : (props.result && props.result.title) || '').trim();
  const artistLabel = String(props.artist != null ? props.artist : (props.result && props.result.artist) || '').trim();
  const keyLabel = String(props.keyName != null ? props.keyName : (props.result && props.result.melody && props.result.melody.key) || '').trim();
  const meterLabel = String(props.meter != null ? props.meter : (props.result && props.result.melody && props.result.melody.meter) || '').trim();
  const keyMeterParts = [keyLabel, meterLabel].filter(Boolean);

  return (
    <Modal show={props.show} onHide={function() {}} backdrop="static" keyboard={false} centered>
      <Modal.Header>
        <Modal.Title>Choose what to import</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-muted small">
          Select which parts of the transcription should be merged into the new tune.
        </p>
        <Form>
          <Form.Check
            type="checkbox"
            id="sheet-import-title"
            disabled={!titleLabel}
            checked={!!options.title}
            onChange={function() { toggleOption('title'); }}
            label={'Title' + (titleLabel ? ': ' + titleLabel : '')}
          />
          <Form.Check
            type="checkbox"
            id="sheet-import-composer"
            disabled={!artistLabel}
            checked={!!options.composer}
            onChange={function() { toggleOption('composer'); }}
            label={'Composer / artist' + (artistLabel ? ': ' + artistLabel : '')}
            className="mt-2"
          />
          <Form.Check
            type="checkbox"
            id="sheet-import-chords"
            disabled={!String(props.chordText || '').trim()}
            checked={!!options.chordsLyrics}
            onChange={function() { toggleOption('chordsLyrics'); }}
            label="Chords and lyrics"
            className="mt-2"
          />
          <Form.Check
            type="checkbox"
            id="sheet-import-melody"
            disabled={!String(props.melodyAbc || '').trim()}
            checked={!!options.melody}
            onChange={function() { toggleOption('melody'); }}
            label="Melody notation (ABC)"
            className="mt-2"
          />
          <Form.Check
            type="checkbox"
            id="sheet-import-key-meter"
            disabled={keyMeterParts.length === 0}
            checked={!!options.keyMeter}
            onChange={function() { toggleOption('keyMeter'); }}
            label={'Key and meter' + (keyMeterParts.length ? ' (' + keyMeterParts.join(', ') + ')' : '')}
            className="mt-2"
          />
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={props.onHide}>Cancel</Button>
        <Button variant="primary" onClick={confirmImport} disabled={!hasAny}>
          Import selected
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
