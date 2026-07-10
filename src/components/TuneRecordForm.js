import { Accordion, Col, Form, Row } from 'react-bootstrap';
import { formatTuneFieldValue } from '../tuneImportMergeUtils';
import ImportFieldSuggestion from './ImportFieldSuggestion';
import ReviewNotationMergePanel from './ReviewNotationMergePanel';
import LinksEditor from './LinksEditor';
import TuneAliasesField from './TuneAliasesField';
import ComposerSearchButton from './ComposerSearchButton';
import ComposerCandidateQuickPick from './ComposerCandidateQuickPick';

function FieldLabelRow(props) {
  return (
    <div className="d-flex align-items-center gap-2 flex-wrap" style={{ marginBottom: props.tight ? 0 : '0.35em' }}>
      <Form.Label className="mb-0" htmlFor={props.htmlFor}>{props.label}</Form.Label>
      {props.suggestion ? (
        <ImportFieldSuggestion
          id={props.formKey}
          label={props.label}
          fieldKey={props.suggestion.key}
          suggestion={props.suggestion}
          importedDisplay={formatTuneFieldValue(props.suggestion.key, props.suggestion.value)}
          onApply={function() {
            if (typeof props.onApplySuggestion === 'function') {
              props.onApplySuggestion(props.formKey, props.suggestion);
            }
          }}
        />
      ) : null}
      {props.children}
    </div>
  );
}

function updateValues(values, patch) {
  return Object.assign({}, values || {}, patch);
}

export default function TuneRecordForm(props) {
  const values = props.values || {};
  const suggestions = props.suggestions || {};

  function setField(field, value) {
    if (typeof props.onChange === 'function') {
      props.onChange(updateValues(values, { [field]: value }));
    }
  }

  const notationMetadata = {
    meter: values.meter,
    noteLength: values.noteLength,
    key: values.keyName,
  };
  const importedNotation = props.importedNotationText || '';
  const showNotationMerge = props.mergeMode !== 'create' && importedNotation.trim()
    && importedNotation.trim() !== String(values.notes || '').trim();

  return (
    <div className="tune-record-form">
      {props.toolbar ? <div className="tune-record-form-toolbar mb-3">{props.toolbar}</div> : null}
      {props.statusBanner ? <div className="mb-3">{props.statusBanner}</div> : null}

      <Form.Group className="mb-3">
        <FieldLabelRow
          label="Title"
          formKey="title"
          suggestion={suggestions.title}
          onApplySuggestion={props.onApplySuggestion}
        />
        <Form.Control
          id="tune-record-title"
          value={values.title || ''}
          onChange={function(e) { setField('title', e.target.value); }}
        />
      </Form.Group>

      <Form.Group className="mb-3">
        <FieldLabelRow
          label="Artist"
          formKey="artist"
          suggestion={suggestions.artist}
          onApplySuggestion={props.onApplySuggestion}
          tight={true}
        >
          {props.showComposerSearch ? (
            <ComposerSearchButton
              title={values.title}
              composer={values.artist}
              titleHint={values.title}
              token={props.token}
              tunebook={props.tunebook}
              resolverAvailable={props.resolverAvailable}
              disabled={!String(values.title || '').trim()}
              inline={true}
              onComposer={function(result) {
                if (result && result.artist) setField('artist', result.artist);
              }}
            />
          ) : null}
        </FieldLabelRow>
        <Form.Control
          value={values.artist || ''}
          onChange={function(e) { setField('artist', e.target.value); }}
        />
        {props.composerCandidates && props.composerCandidates.length > 0 ? (
          <ComposerCandidateQuickPick
            className="mt-2"
            candidates={props.composerCandidates}
            placeholder="Review discovered artist…"
            onSelect={function(value) { setField('artist', value); }}
          />
        ) : null}
      </Form.Group>

      <TuneAliasesField
        value={Array.isArray(values.aliases) ? values.aliases : []}
        onChange={function(next) { setField('aliases', next); }}
      />
      {suggestions.aliases ? (
        <div className="mb-3">
          <ImportFieldSuggestion
            label="Aliases"
            fieldKey="aliases"
            suggestion={suggestions.aliases}
            onApply={function() {
              if (typeof props.onApplySuggestion === 'function') {
                props.onApplySuggestion('aliases', suggestions.aliases);
              }
            }}
          />
        </div>
      ) : null}

      {props.bookTagsSlot ? props.bookTagsSlot : (
        <Row>
          <Col md={6}>
            <Form.Group className="mb-3">
              <FieldLabelRow
                label="Book(s)"
                formKey="bookList"
                suggestion={suggestions.bookList}
                onApplySuggestion={props.onApplySuggestion}
              />
              <Form.Control
                value={values.bookList || ''}
                placeholder="comma separated"
                onChange={function(e) { setField('bookList', e.target.value); }}
              />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group className="mb-3">
              <FieldLabelRow
                label="Tags"
                formKey="tagList"
                suggestion={suggestions.tagList}
                onApplySuggestion={props.onApplySuggestion}
              />
              <Form.Control
                value={values.tagList || ''}
                placeholder="comma separated"
                onChange={function(e) { setField('tagList', e.target.value); }}
              />
            </Form.Group>
          </Col>
        </Row>
      )}

      <Row>
        <Col md={6}>
          <Form.Group className="mb-3">
            <FieldLabelRow label="Genre" formKey="genre" suggestion={suggestions.genre} onApplySuggestion={props.onApplySuggestion} />
            <Form.Control value={values.genre || ''} onChange={function(e) { setField('genre', e.target.value); }} />
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group className="mb-3">
            <FieldLabelRow label="Rhythm" formKey="rhythm" suggestion={suggestions.rhythm} onApplySuggestion={props.onApplySuggestion} />
            <Form.Control value={values.rhythm || ''} onChange={function(e) { setField('rhythm', e.target.value); }} />
          </Form.Group>
        </Col>
      </Row>

      <Row>
        <Col md={4}>
          <Form.Group className="mb-3">
            <FieldLabelRow label="Key" formKey="keyName" suggestion={suggestions.keyName} onApplySuggestion={props.onApplySuggestion} />
            <Form.Control value={values.keyName || ''} onChange={function(e) { setField('keyName', e.target.value); }} />
          </Form.Group>
        </Col>
        <Col md={4}>
          <Form.Group className="mb-3">
            <FieldLabelRow label="Meter" formKey="meter" suggestion={suggestions.meter} onApplySuggestion={props.onApplySuggestion} />
            <Form.Control value={values.meter || ''} onChange={function(e) { setField('meter', e.target.value); }} />
          </Form.Group>
        </Col>
        <Col md={4}>
          <Form.Group className="mb-3">
            <FieldLabelRow label="Tempo" formKey="tempo" suggestion={suggestions.tempo} onApplySuggestion={props.onApplySuggestion} />
            <Form.Control type="number" value={values.tempo || ''} onChange={function(e) { setField('tempo', e.target.value); }} />
          </Form.Group>
        </Col>
      </Row>

      <Form.Group className="mb-3">
        <FieldLabelRow label="Note length" formKey="noteLength" suggestion={suggestions.noteLength} onApplySuggestion={props.onApplySuggestion} />
        <Form.Control value={values.noteLength || ''} placeholder="eg 1/8" onChange={function(e) { setField('noteLength', e.target.value); }} />
      </Form.Group>

      <div className="mb-3">
        <Form.Label>Links</Form.Label>
        <LinksEditor
          links={Array.isArray(values.links) ? values.links : []}
          tune={props.previewTune}
          tuneId={props.previewTune && props.previewTune.id}
          tunebook={props.tunebook}
          token={props.token}
          forceRefresh={props.forceRefresh}
          simplified={true}
          onChange={function(next) { setField('links', next); }}
        />
      </div>

      <Form.Group className="mb-3">
        <FieldLabelRow label="Source URL" formKey="srcUrl" suggestion={suggestions.srcUrl} onApplySuggestion={props.onApplySuggestion} />
        <Form.Control value={values.srcUrl || ''} onChange={function(e) { setField('srcUrl', e.target.value); }} />
      </Form.Group>

      <Form.Group className="mb-3">
        <FieldLabelRow label="Background info" formKey="backgroundInfo" suggestion={suggestions.backgroundInfo} onApplySuggestion={props.onApplySuggestion} />
        <Form.Control as="textarea" rows={6} value={values.backgroundInfo || ''} onChange={function(e) { setField('backgroundInfo', e.target.value); }} />
      </Form.Group>

      <Form.Group className="mb-3">
        <FieldLabelRow label="Lyrics" formKey="lyrics" suggestion={suggestions.lyrics} onApplySuggestion={props.onApplySuggestion} />
        <Form.Control as="textarea" rows={8} value={values.lyrics || ''} onChange={function(e) { setField('lyrics', e.target.value); }} />
      </Form.Group>

      <Form.Group className="mb-3">
        <FieldLabelRow label="ABC Notes" formKey="notes" suggestion={suggestions.notes} onApplySuggestion={props.onApplySuggestion} />
        {showNotationMerge ? (
          <ReviewNotationMergePanel
            currentText={values.notes || ''}
            importedText={importedNotation}
            metadata={notationMetadata}
            onChange={function(text) { setField('notes', text); }}
          />
        ) : null}
        <Form.Control
          as="textarea"
          rows={10}
          style={{ fontFamily: 'monospace' }}
          value={values.notes || ''}
          onChange={function(e) { setField('notes', e.target.value); }}
        />
      </Form.Group>

      {props.extraSections ? props.extraSections : null}

      <Accordion className="tune-record-form-advanced">
        <Accordion.Item eventKey="advanced">
          <Accordion.Header>
            Advanced fields
          </Accordion.Header>
          <Accordion.Body>
            <Row>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <FieldLabelRow label="Boost" formKey="boost" suggestion={suggestions.boost} onApplySuggestion={props.onApplySuggestion} />
                  <Form.Control value={values.boost || ''} onChange={function(e) { setField('boost', e.target.value); }} />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <FieldLabelRow label="Difficulty" formKey="difficulty" suggestion={suggestions.difficulty} onApplySuggestion={props.onApplySuggestion} />
                  <Form.Control type="number" value={values.difficulty || ''} onChange={function(e) { setField('difficulty', e.target.value); }} />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <FieldLabelRow label="Capo" formKey="capo" suggestion={suggestions.capo} onApplySuggestion={props.onApplySuggestion} />
                  <Form.Control type="number" value={values.capo || ''} onChange={function(e) { setField('capo', e.target.value); }} />
                </Form.Group>
              </Col>
            </Row>
            <Row>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <FieldLabelRow label="Transpose" formKey="transpose" suggestion={suggestions.transpose} onApplySuggestion={props.onApplySuggestion} />
                  <Form.Control value={values.transpose || ''} onChange={function(e) { setField('transpose', e.target.value); }} />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <FieldLabelRow label="Tuning" formKey="tuning" suggestion={suggestions.tuning} onApplySuggestion={props.onApplySuggestion} />
                  <Form.Control value={values.tuning || ''} onChange={function(e) { setField('tuning', e.target.value); }} />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <FieldLabelRow label="Repeats" formKey="repeats" suggestion={suggestions.repeats} onApplySuggestion={props.onApplySuggestion} />
                  <Form.Control type="number" value={values.repeats || ''} onChange={function(e) { setField('repeats', e.target.value); }} />
                </Form.Group>
              </Col>
            </Row>
            <Row>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <FieldLabelRow label="Playback tempo" formKey="playbackTempo" suggestion={suggestions.playbackTempo} onApplySuggestion={props.onApplySuggestion} />
                  <Form.Control value={values.playbackTempo || ''} onChange={function(e) { setField('playbackTempo', e.target.value); }} />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <FieldLabelRow label="Playback pitch" formKey="playbackPitch" suggestion={suggestions.playbackPitch} onApplySuggestion={props.onApplySuggestion} />
                  <Form.Control value={values.playbackPitch || ''} onChange={function(e) { setField('playbackPitch', e.target.value); }} />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <FieldLabelRow label="Fine tune" formKey="playbackFineTune" suggestion={suggestions.playbackFineTune} onApplySuggestion={props.onApplySuggestion} />
                  <Form.Control value={values.playbackFineTune || ''} onChange={function(e) { setField('playbackFineTune', e.target.value); }} />
                </Form.Group>
              </Col>
            </Row>
            <Form.Group className="mb-3">
              <FieldLabelRow label="Tablature" formKey="tablature" suggestion={suggestions.tablature} onApplySuggestion={props.onApplySuggestion} />
              <Form.Control value={values.tablature || ''} onChange={function(e) { setField('tablature', e.target.value); }} />
            </Form.Group>
            <Form.Group className="mb-3">
              <FieldLabelRow label="Composer ID" formKey="composerId" suggestion={suggestions.composerId} onApplySuggestion={props.onApplySuggestion} />
              <Form.Control value={values.composerId || ''} onChange={function(e) { setField('composerId', e.target.value); }} />
            </Form.Group>
            <Form.Group className="mb-3">
              <FieldLabelRow label="ABC comments" formKey="abccomments" suggestion={suggestions.abccomments} onApplySuggestion={props.onApplySuggestion} />
              <Form.Control as="textarea" rows={3} value={values.abccomments || ''} onChange={function(e) { setField('abccomments', e.target.value); }} />
            </Form.Group>
            {['timedChords', 'timedLyrics', 'playbackAudioFilters', 'soundFonts', 'meta'].map(function(jsonKey) {
              if (!suggestions[jsonKey]) return null;
              return (
                <div key={jsonKey} className="mb-3">
                  <FieldLabelRow
                    label={jsonKey}
                    formKey={jsonKey}
                    suggestion={suggestions[jsonKey]}
                    onApplySuggestion={props.onApplySuggestion}
                  />
                  <pre className="tune-record-form-json-preview">{formatTuneFieldValue(jsonKey, suggestions[jsonKey].value)}</pre>
                </div>
              );
            })}
          </Accordion.Body>
        </Accordion.Item>
      </Accordion>
    </div>
  );
}
