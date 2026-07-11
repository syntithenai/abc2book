import { useEffect, useMemo, useState } from 'react';
import { Accordion, Button, ButtonGroup, Col, Form, Row } from 'react-bootstrap';
import CreatableSelect from 'react-select/creatable';
import { formatTuneFieldValue } from '../tuneImportMergeUtils';
import { getMusicGenreSelectOptions, genreSelectValue } from '../musicGenreOptions';
import ImportFieldSuggestion from './ImportFieldSuggestion';
import ReviewNotationMergePanel from './ReviewNotationMergePanel';
import FieldPreviewEditor from './FieldPreviewEditor';
import LinksEditor from './LinksEditor';
import TuneAliasesField from './TuneAliasesField';
import ComposerSearchButton from './ComposerSearchButton';
import ComposerCandidateQuickPick from './ComposerCandidateQuickPick';
import BookSelectorModal from './BookSelectorModal';
import TagsSelectorModal from './TagsSelectorModal';
import KeySignatureInput from './KeySignatureInput';
import Abc from './Abc';

const NOTE_LENGTH_OPTIONS = ['', '1', '1/2', '1/3', '1/4', '1/6', '1/8', '1/12', '1/16'];

const ADVANCED_MERGE_FIELD_KEYS = [
  'aliases',
  'rhythm',
  'capo',
  'transpose',
  'tuning',
  'timedChords',
  'timedLyrics',
  'playbackAudioFilters',
  'soundFonts',
  'meta',
];

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

function parseListField(value) {
  return String(value || '')
    .split(',')
    .map(function(item) { return item.trim(); })
    .filter(Boolean);
}

function buildMelodyPreviewAbc(metadata, melodyNotesText) {
  const meta = metadata || {};
  const notes = String(melodyNotesText || '').trim();
  if (!notes) return '';
  return [
    'X:1',
    'M:' + (meta.meter || '4/4'),
    'L:' + (meta.noteLength || '1/8'),
    'K:' + (meta.key || 'C'),
    notes,
  ].join('\n');
}

function AbcPreview(props) {
  if (!props.tunebook || !props.abc) return null;
  return (
    <div className="tune-record-form-abc-preview mb-2">
      <Abc
        tunebook={props.tunebook}
        abc={props.abc}
        hidePlayer={true}
        hideSvg={false}
        editableTempo={false}
        autoStart={false}
      />
    </div>
  );
}

export default function TuneRecordForm(props) {
  const values = props.values || {};
  const suggestions = props.suggestions || {};
  const tunebook = props.tunebook;
  const [previewAbc, setPreviewAbc] = useState('');
  const hasAdvancedMergeFields = ADVANCED_MERGE_FIELD_KEYS.some(function(key) {
    return !!suggestions[key];
  });
  const [advancedActiveKey, setAdvancedActiveKey] = useState(function() {
    return hasAdvancedMergeFields ? 'advanced' : null;
  });

  useEffect(function() {
    if (hasAdvancedMergeFields) setAdvancedActiveKey('advanced');
  }, [hasAdvancedMergeFields]);

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

  const rhythmOptions = useMemo(function() {
    if (Array.isArray(props.rhythmOptions) && props.rhythmOptions.length) return props.rhythmOptions;
    if (!tunebook || !tunebook.abcTools || !tunebook.abcTools.getRhythmTypes) return [];
    return Object.keys(tunebook.abcTools.getRhythmTypes()).map(function(type) {
      return { value: type, label: type };
    });
  }, [props.rhythmOptions, tunebook]);

  const meterOptions = useMemo(function() {
    if (Array.isArray(props.meterOptions) && props.meterOptions.length) return props.meterOptions;
    if (!tunebook || !tunebook.abcTools || !tunebook.abcTools.getTimeSignatureTypes) {
      return [{ value: '', label: 'None' }];
    }
    const options = tunebook.abcTools.getTimeSignatureTypes().map(function(type) {
      return { value: type, label: type };
    });
    options.unshift({ value: '', label: 'None' });
    return options;
  }, [props.meterOptions, tunebook]);

  const selectedBooks = parseListField(values.bookList);
  const selectedTags = parseListField(values.tagList);
  const primaryBook = selectedBooks[0] || '';

  useEffect(function() {
    const timer = setTimeout(function() {
      setPreviewAbc(buildMelodyPreviewAbc(notationMetadata, values.notes));
    }, 250);
    return function() { clearTimeout(timer); };
  }, [values.notes, values.meter, values.noteLength, values.keyName]);

  function renderBooksAndTags() {
    if (props.bookTagsSlot) return props.bookTagsSlot;
    if (!tunebook) {
      return (
        <Row>
          <Col md={6}>
            <Form.Group className="mb-3">
              <FieldLabelRow label="Book(s)" formKey="bookList" suggestion={suggestions.bookList} onApplySuggestion={props.onApplySuggestion} />
              <Form.Control
                value={values.bookList || ''}
                placeholder="comma separated"
                onChange={function(e) { setField('bookList', e.target.value); }}
              />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group className="mb-3">
              <FieldLabelRow label="Tags" formKey="tagList" suggestion={suggestions.tagList} onApplySuggestion={props.onApplySuggestion} />
              <Form.Control
                value={values.tagList || ''}
                placeholder="comma separated"
                onChange={function(e) { setField('tagList', e.target.value); }}
              />
            </Form.Group>
          </Col>
        </Row>
      );
    }

    return (
      <Row>
        <Col md={6}>
          <Form.Group className="mb-3">
            <FieldLabelRow label="Book(s)" formKey="bookList" suggestion={suggestions.bookList} onApplySuggestion={props.onApplySuggestion} />
            <div>
              <ButtonGroup style={{ backgroundColor: '#3f81e3', borderRadius: '10px' }}>
                {primaryBook ? (
                  <Button title="Clear book" onClick={function() { setField('bookList', ''); }}>
                    {tunebook.icons && tunebook.icons.closecircle ? tunebook.icons.closecircle : '×'}
                  </Button>
                ) : null}
                <BookSelectorModal
                  forceRefresh={props.forceRefresh}
                  title="Select a Book"
                  tunebook={tunebook}
                  value={primaryBook}
                  onChange={function(val) { setField('bookList', val || ''); }}
                  defaultOptions={tunebook.getTuneBookOptions}
                  searchOptions={tunebook.getSearchTuneBookOptions}
                  triggerElement={
                    <Button style={{ marginLeft: '0.1em', color: 'black' }}>
                      {tunebook.icons && tunebook.icons.book ? tunebook.icons.book : null}{' '}
                      {primaryBook ? <b>{primaryBook}</b> : 'Select a book'}
                    </Button>
                  }
                />
              </ButtonGroup>
            </div>
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group className="mb-3">
            <FieldLabelRow label="Tags" formKey="tagList" suggestion={suggestions.tagList} onApplySuggestion={props.onApplySuggestion} />
            <div>
              <TagsSelectorModal
                forceRefresh={props.forceRefresh}
                tunebook={tunebook}
                setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                defaultOptions={tunebook.getTuneTagOptions}
                searchOptions={tunebook.getSearchTuneTagOptions}
                value={selectedTags}
                onChange={function(value) {
                  setField('tagList', Array.isArray(value) ? value.join(', ') : '');
                }}
                showTags={true}
              />
              <span>
                {selectedTags.map(function(tag) {
                  return <Button key={tag} style={{ marginLeft: '0.2em' }} variant="outline-info">{tag}</Button>;
                })}
              </span>
            </div>
          </Form.Group>
        </Col>
      </Row>
    );
  }

  function suggestionControl(formKey, label) {
    if (!suggestions[formKey]) return null;
    return (
      <ImportFieldSuggestion
        id={formKey}
        label={label}
        fieldKey={suggestions[formKey].key}
        suggestion={suggestions[formKey]}
        importedDisplay={formatTuneFieldValue(suggestions[formKey].key, suggestions[formKey].value)}
        onApply={function() {
          if (typeof props.onApplySuggestion === 'function') {
            props.onApplySuggestion(formKey, suggestions[formKey]);
          }
        }}
      />
    );
  }

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
              tunebook={tunebook}
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

      {renderBooksAndTags()}

      <Row>
        <Col md={6}>
          <Form.Group className="mb-3">
            <FieldLabelRow label="Genre" formKey="genre" suggestion={suggestions.genre} onApplySuggestion={props.onApplySuggestion} />
            <CreatableSelect
              value={genreSelectValue(values.genre)}
              onChange={function(val) { setField('genre', val ? val.label : ''); }}
              options={getMusicGenreSelectOptions()}
              isClearable={true}
              blurInputOnSelect={true}
              createOptionPosition="first"
              placeholder="eg Folk, Jazz"
            />
          </Form.Group>
        </Col>
        <Col md={3}>
          <Form.Group className="mb-3">
            <FieldLabelRow label="Key" formKey="keyName" suggestion={suggestions.keyName} onApplySuggestion={props.onApplySuggestion} />
            <KeySignatureInput value={values.keyName || ''} onChange={function(next) { setField('keyName', next); }} />
          </Form.Group>
        </Col>
        <Col md={3}>
          <Form.Group className="mb-3">
            <FieldLabelRow label="Meter" formKey="meter" suggestion={suggestions.meter} onApplySuggestion={props.onApplySuggestion} />
            <CreatableSelect
              value={values.meter ? { value: values.meter, label: values.meter } : { value: '', label: '' }}
              onChange={function(val) { setField('meter', val ? val.value : ''); }}
              options={meterOptions}
              isClearable={true}
              blurInputOnSelect={true}
              createOptionPosition="first"
            />
          </Form.Group>
        </Col>
      </Row>

      <Row>
        <Col md={4}>
          <Form.Group className="mb-3">
            <FieldLabelRow label="Tempo" formKey="tempo" suggestion={suggestions.tempo} onApplySuggestion={props.onApplySuggestion} />
            <Form.Control type="number" value={values.tempo || ''} onChange={function(e) { setField('tempo', e.target.value); }} />
          </Form.Group>
        </Col>
        <Col md={4}>
          <Form.Group className="mb-3">
            <FieldLabelRow label="Note length" formKey="noteLength" suggestion={suggestions.noteLength} onApplySuggestion={props.onApplySuggestion} />
            <Form.Select value={values.noteLength || ''} onChange={function(e) { setField('noteLength', e.target.value); }}>
              {NOTE_LENGTH_OPTIONS.map(function(option) {
                return <option key={option || 'empty'} value={option}>{option || ''}</option>;
              })}
            </Form.Select>
          </Form.Group>
        </Col>
      </Row>

      <div className="mb-3">
        <Form.Label>Links</Form.Label>
        <LinksEditor
          links={Array.isArray(values.links) ? values.links : []}
          tune={props.previewTune}
          tuneId={props.previewTune && props.previewTune.id}
          tunebook={tunebook}
          token={props.token}
          forceRefresh={props.forceRefresh}
          simplified={true}
          onChange={function(next) { setField('links', next); }}
        />
      </div>

      <FieldPreviewEditor
        label="Background info"
        value={values.backgroundInfo || ''}
        onChange={function(text) { setField('backgroundInfo', text); }}
        previewLines={4}
        dialogRows={14}
        emptyMessage="No background info yet."
        suggestionControl={suggestionControl('backgroundInfo', 'Background info')}
      />

      <FieldPreviewEditor
        label="Lyrics"
        value={values.lyrics || ''}
        onChange={function(text) { setField('lyrics', text); }}
        previewLines={5}
        dialogRows={18}
        emptyMessage="No lyrics yet."
        suggestionControl={suggestionControl('lyrics', 'Lyrics')}
      />

      <div className="mb-3">
        {showNotationMerge ? (
          <ReviewNotationMergePanel
            currentText={values.notes || ''}
            importedText={importedNotation}
            metadata={notationMetadata}
            tunebook={tunebook}
            onChange={function(text) { setField('notes', text); }}
          />
        ) : null}
        <FieldPreviewEditor
          label="ABC Notes"
          value={values.notes || ''}
          onChange={function(text) { setField('notes', text); }}
          previewLines={6}
          dialogRows={20}
          monospace={true}
          emptyMessage="No ABC notes yet."
          suggestionControl={suggestionControl('notes', 'ABC Notes')}
          abovePreview={<AbcPreview tunebook={tunebook} abc={previewAbc} />}
          renderDialogExtra={function(draft) {
            return (
              <AbcPreview
                tunebook={tunebook}
                abc={buildMelodyPreviewAbc(notationMetadata, draft)}
              />
            );
          }}
        />
      </div>

      {props.extraSections ? props.extraSections : null}

      <Accordion
        className="tune-record-form-advanced mb-3"
        activeKey={advancedActiveKey}
        onSelect={function(key) { setAdvancedActiveKey(key); }}
      >
        <Accordion.Item eventKey="advanced">
          <Accordion.Header>
            Advanced fields
          </Accordion.Header>
          <Accordion.Body>
            <TuneAliasesField
              value={Array.isArray(values.aliases) ? values.aliases : []}
              onChange={function(next) { setField('aliases', next); }}
            />
            {suggestions.aliases ? (
              <div className="mb-3">
                {suggestionControl('aliases', 'Aliases')}
              </div>
            ) : null}

            <Form.Group className="mb-3">
              <FieldLabelRow label="Rhythm" formKey="rhythm" suggestion={suggestions.rhythm} onApplySuggestion={props.onApplySuggestion} />
              <CreatableSelect
                value={values.rhythm ? { value: values.rhythm, label: values.rhythm } : { value: '', label: '' }}
                onChange={function(val) {
                  const nextRhythm = val ? val.value : '';
                  const patch = { rhythm: nextRhythm };
                  if (nextRhythm && tunebook && tunebook.abcTools && tunebook.abcTools.timeSignatureFromTuneType) {
                    const inferredMeter = tunebook.abcTools.timeSignatureFromTuneType(nextRhythm);
                    if (inferredMeter && !String(values.meter || '').trim()) patch.meter = inferredMeter;
                  }
                  if (typeof props.onChange === 'function') {
                    props.onChange(updateValues(values, patch));
                  }
                }}
                options={rhythmOptions}
                isClearable={true}
                blurInputOnSelect={true}
                createOptionPosition="first"
              />
            </Form.Group>

            <Row>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <FieldLabelRow label="Capo" formKey="capo" suggestion={suggestions.capo} onApplySuggestion={props.onApplySuggestion} />
                  <Form.Control type="number" value={values.capo || ''} onChange={function(e) { setField('capo', e.target.value); }} />
                </Form.Group>
              </Col>
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
            </Row>

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
