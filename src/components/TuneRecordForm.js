import { useEffect, useMemo, useRef, useState } from 'react';
import { Accordion, Button, ButtonGroup, Col, Form, Row } from 'react-bootstrap';
import CreatableSelect from 'react-select/creatable';
import AsyncCreatableSelect from 'react-select/async-creatable';
import { formatTuneFieldValue } from '../tuneImportMergeUtils';
import { getMusicGenreSelectOptions, genreSelectValue } from '../musicGenreOptions';
import useMusicBrainz from '../useMusicBrainz';
import ImportFieldSuggestion from './ImportFieldSuggestion';
import ReviewNotationMergePanel from './ReviewNotationMergePanel';
import FieldPreviewEditor from './FieldPreviewEditor';
import LinksEditor from './LinksEditor';
import TuneAliasesField from './TuneAliasesField';
import TuneArtistsField from './TuneArtistsField';
import ComposerSearchButton from './ComposerSearchButton';
import NotationSearchButton from './NotationSearchButton';
import GenreSearchButton from './GenreSearchButton';
import LyricsSearchButton from './LyricsSearchButton';
import FieldLookupReviewButton from './FieldLookupReviewButton';
import ArtistsSearchButton from './ArtistsSearchButton';
import AliasesSearchButton from './AliasesSearchButton';
import TuneBackgroundSearchButton from './TuneBackgroundSearchButton';
import ComposerCandidateQuickPick from './ComposerCandidateQuickPick';
import CapitalizeTitleButton from './CapitalizeTitleButton';
import BookSelectorModal from './BookSelectorModal';
import TagsSelectorModal from './TagsSelectorModal';
import KeySignatureInput from './KeySignatureInput';
import AbcVoicesNotesEditor, { primaryVoiceNotesText } from './AbcVoicesNotesEditor';
import NoteAlignedLyricsModal from './NoteAlignedLyricsModal';
import LyricsToolsModal from './LyricsToolsModal';
import LyricsSectionsDropdown from './LyricsSectionsDropdown';
import { FormLabelWithHelp } from './FormFieldHelp';
import { EDITOR_INFO_FIELD_HELP } from '../formFieldHelpText';
import { PRACTICE_INSTRUMENTS, normalizeSuitableInstruments } from '../practiceSessionSettings';
import { formValuesToTune, importSuggestionDiffersFromForm } from '../importReviewFieldUtils';
import { getPlainLyricLines } from '../wLinesUtils';
import { mergeBibliographicList } from '../tuneBibliographicUtils';
function FormBlock(props) {
  return (
    <div className={'tune-record-form-block' + (props.className ? ' ' + props.className : '')}>
      {props.children}
    </div>
  );
}

const NOTE_LENGTH_OPTIONS = ['', '1', '1/2', '1/3', '1/4', '1/6', '1/8', '1/12', '1/16'];

const ADVANCED_MERGE_FIELD_KEYS = [
  'rhythm',
  'noteLength',
  'capo',
  'transpose',
  'tuning',
  'suitableForPractice',
  'suitableFor',
  'playbackAudioFilters',
  'soundFonts',
  'meta',
];

function FieldLabelRow(props) {
  const hasChoiceList = props.suggestion
    && Array.isArray(props.suggestion.choices)
    && props.suggestion.choices.length > 1;
  const showSuggestion = props.suggestion
    && (hasChoiceList
      || !props.values
      || importSuggestionDiffersFromForm(props.formKey, props.suggestion, props.values));
  return (
    <div className="d-flex align-items-center gap-2 flex-wrap" style={{ marginBottom: props.tight ? 0 : '0.35em' }}>
      <Form.Label className="mb-0" htmlFor={props.htmlFor}>{props.label}</Form.Label>
      {showSuggestion ? (
        <ImportFieldSuggestion
          id={props.formKey}
          label={props.label}
          formKey={props.formKey}
          fieldKey={props.suggestion.key}
          suggestion={props.suggestion}
          choices={Array.isArray(props.suggestion.choices) ? props.suggestion.choices : null}
          importedDisplay={formatTuneFieldValue(props.suggestion.key, props.suggestion.value)}
          previewMetadata={props.previewMetadata}
          onSelectChoice={function(choice) {
            if (typeof props.onApplySuggestion !== 'function') return;
            props.onApplySuggestion(props.formKey, Object.assign({}, props.suggestion, {
              value: choice && choice.value !== undefined ? choice.value : props.suggestion.value,
              displayValue: choice && choice.preview != null ? choice.preview : props.suggestion.displayValue,
              source: choice && choice.source ? choice.source : props.suggestion.source,
            }));
          }}
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

export default function TuneRecordForm(props) {
  const values = props.values || {};
  const suggestions = props.suggestions || {};
  const tunebook = props.tunebook;
  const musicBrainz = useMusicBrainz();
  const lyricsTextareaRef = useRef(null);
  const [showNoteAlignedLyrics, setShowNoteAlignedLyrics] = useState(false);
  const [showLyricsTools, setShowLyricsTools] = useState(false);
  const [lyricsToolsQuery, setLyricsToolsQuery] = useState('');

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
      // Partial patch so parents can merge against latest state (multi-add pickers).
      props.onChange({ [field]: value });
    }
  }

  function patchField(field, updater) {
    if (typeof props.onChange !== 'function') return;
    props.onChange(function(current) {
      const prev = current && Object.prototype.hasOwnProperty.call(current, field)
        ? current[field]
        : values[field];
      return { [field]: updater(prev) };
    });
  }

  const notationMetadata = {
    meter: values.meter,
    noteLength: values.noteLength,
    key: values.keyName,
  };
  const importedNotation = props.importedNotationText || '';
  const showNotationMerge = props.mergeMode !== 'create' && importedNotation.trim()
    && importedNotation.trim() !== String(values.notes || '').trim();

  const lyricsTune = useMemo(function() {
    return formValuesToTune(values, props.previewTune || {});
  }, [values, props.previewTune]);

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

  function renderBooksAndTags() {
    if (props.bookTagsSlot) return props.bookTagsSlot;
    if (!tunebook) {
      return (
        <Row>
          <Col md={6}>
            <Form.Group className="mb-0">
              <FieldLabelRow label="Book(s)" formKey="bookList" suggestion={suggestions.bookList} onApplySuggestion={props.onApplySuggestion}  values={values} />
              <Form.Control
                value={values.bookList || ''}
                placeholder="comma separated"
                onChange={function(e) { setField('bookList', e.target.value); }}
              />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group className="mb-0">
              <FieldLabelRow label="Tags" formKey="tagList" suggestion={suggestions.tagList} onApplySuggestion={props.onApplySuggestion}  values={values} />
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
          <Form.Group className="mb-0">
            <FieldLabelRow label="Book(s)" formKey="bookList" suggestion={suggestions.bookList} onApplySuggestion={props.onApplySuggestion}  values={values} />
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
          <Form.Group className="mb-0">
            <FieldLabelRow label="Tags" formKey="tagList" suggestion={suggestions.tagList} onApplySuggestion={props.onApplySuggestion}  values={values} />
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
    const suggestion = suggestions[formKey];
    if (!suggestion) return null;
    const hasChoiceList = Array.isArray(suggestion.choices) && suggestion.choices.length > 1;
    if (!hasChoiceList && !importSuggestionDiffersFromForm(formKey, suggestion, values)) return null;
    return (
      <ImportFieldSuggestion
        id={formKey}
        label={label}
        formKey={formKey}
        fieldKey={suggestion.key}
        suggestion={suggestion}
        choices={Array.isArray(suggestion.choices) ? suggestion.choices : null}
        importedDisplay={formatTuneFieldValue(suggestion.key, suggestion.value)}
        previewMetadata={notationMetadata}
        onSelectChoice={function(choice) {
          if (typeof props.onApplySuggestion !== 'function') return;
          props.onApplySuggestion(formKey, Object.assign({}, suggestion, {
            value: choice && choice.value !== undefined ? choice.value : suggestion.value,
            displayValue: choice && choice.preview != null ? choice.preview : suggestion.displayValue,
            source: choice && choice.source ? choice.source : suggestion.source,
          }));
        }}
        onApply={function() {
          if (typeof props.onApplySuggestion === 'function') {
            props.onApplySuggestion(formKey, suggestion);
          }
        }}
      />
    );
  }

  const compactSelectStyles = {
    control: function(base) {
      return Object.assign({}, base, { minHeight: 31, fontSize: '0.875rem' });
    },
    valueContainer: function(base) {
      return Object.assign({}, base, { padding: '0 6px' });
    },
    indicatorsContainer: function(base) {
      return Object.assign({}, base, { height: 29 });
    },
    menuPortal: function(base) {
      return Object.assign({}, base, { zIndex: 9999 });
    },
  };

  return (
    <div className="tune-record-form" data-testid="tune-record-form">
      {props.toolbar ? <div className="tune-record-form-toolbar mb-3">{props.toolbar}</div> : null}
      {props.statusBanner ? <div className="mb-3">{props.statusBanner}</div> : null}

      <FormBlock>
        <Form.Group className="mb-3">
          <FieldLabelRow
            label="Title"
            formKey="title"
            suggestion={suggestions.title}
            onApplySuggestion={props.onApplySuggestion}
            values={values}
            htmlFor="tune-record-title"
          >
            <CapitalizeTitleButton
              value={values.title}
              onCapitalize={function(next) { setField('title', next); }}
            />
          </FieldLabelRow>
          <Form.Control
            id="tune-record-title"
            value={values.title || ''}
            onChange={function(e) {
              setField('title', e.target.value);
            }}
          />
        </Form.Group>

        <Form.Group className="mb-0">
          {props.showComposerSearch ? (
            <ComposerSearchButton
              tuneId={props.previewTune && props.previewTune.id}
              candidateId={props.candidateId}
              title={values.title}
              composer={values.artist}
              titleHint={values.title}
              token={props.token}
              tunebook={tunebook}
              resolverAvailable={props.resolverAvailable}
              disabled={!String(values.title || '').trim()}
              inline={true}
              existingArtists={values.artists}
              onComposer={function(result) {
                if (result && result.artist) setField('artist', result.artist);
              }}
              onAddArtist={function(artistName) {
                patchField('artists', function(current) {
                  return mergeBibliographicList(current, [artistName]);
                });
              }}
              onSuggestedTitle={function(suggestion) {
                if (suggestion && suggestion.title) setField('title', suggestion.title);
              }}
            >
              {function(api) {
                return (
                  <>
                    <FieldLabelRow
                      label="Composer"
                      formKey="artist"
                      suggestion={suggestions.artist}
                      onApplySuggestion={props.onApplySuggestion}
                      tight={true}
                      values={values}
                    >
                      {api.buttonGroup}
                    </FieldLabelRow>
                    <AsyncCreatableSelect
                      value={values.artist
                        ? { value: values.artist, label: values.artist }
                        : null}
                      onChange={function(val) { setField('artist', val ? val.label : ''); }}
                      defaultOptions={[]}
                      loadOptions={musicBrainz.artistOptions}
                      isClearable={true}
                      blurInputOnSelect={true}
                      createOptionPosition="first"
                      allowCreateWhileLoading={true}
                      placeholder="Type composer name"
                      menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
                      styles={compactSelectStyles}
                    />
                    {api.errorNode}
                  </>
                )
              }}
            </ComposerSearchButton>
          ) : (
            <>
              <FieldLabelRow
                label="Composer"
                formKey="artist"
                suggestion={suggestions.artist}
                onApplySuggestion={props.onApplySuggestion}
                tight={true}
                values={values}
              />
              <AsyncCreatableSelect
                value={values.artist
                  ? { value: values.artist, label: values.artist }
                  : null}
                onChange={function(val) { setField('artist', val ? val.label : ''); }}
                defaultOptions={[]}
                loadOptions={musicBrainz.artistOptions}
                isClearable={true}
                blurInputOnSelect={true}
                createOptionPosition="first"
                allowCreateWhileLoading={true}
                placeholder="Type composer name"
                menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
                styles={compactSelectStyles}
              />
            </>
          )}
          {props.composerCandidates && props.composerCandidates.length > 0 ? (
            <ComposerCandidateQuickPick
              className="mt-2"
              candidates={props.composerCandidates}
              placeholder="Review discovered artist…"
              onSelect={function(value) { setField('artist', value); }}
            />
          ) : null}
        </Form.Group>

        <ArtistsSearchButton
          tuneId={props.previewTune && props.previewTune.id}
          candidateId={props.candidateId}
          title={values.title}
          artist={values.artist}
          existingArtists={values.artists}
          tunebook={tunebook}
          disabled={!String(values.title || '').trim()}
          onAddArtist={function(artistName) {
            patchField('artists', function(current) {
              return mergeBibliographicList(current, [artistName]);
            });
          }}
        >
          {function(api) {
            return (
              <div className="d-flex align-items-start gap-2 flex-wrap mb-2 mt-3">
                <div style={{ flex: '1 1 12em' }}>
                  <TuneArtistsField
                    value={Array.isArray(values.artists) ? values.artists : []}
                    onChange={function(next) { setField('artists', next); }}
                  />
                </div>
                {api.buttonGroup}
                {api.errorNode}
              </div>
            )
          }}
        </ArtistsSearchButton>
        {suggestions.artists ? (
          <div className="mb-2">
            {suggestionControl('artists', 'Artists')}
          </div>
        ) : null}

        <AliasesSearchButton
          tuneId={props.previewTune && props.previewTune.id}
          candidateId={props.candidateId}
          title={values.title}
          artist={values.artist}
          existingAliases={values.aliases}
          tunebook={tunebook}
          resolverAvailable={props.resolverAvailable}
          token={props.token}
          disabled={!String(values.title || '').trim()}
          onAddAlias={function(alias) {
            patchField('aliases', function(current) {
              return mergeBibliographicList(current, [alias]);
            });
          }}
        >
          {function(api) {
            return (
              <div className="d-flex align-items-start gap-2 flex-wrap mb-0">
                <div style={{ flex: '1 1 12em' }}>
                  <TuneAliasesField
                    value={Array.isArray(values.aliases) ? values.aliases : []}
                    onChange={function(next) { setField('aliases', next); }}
                  />
                </div>
                {api.buttonGroup}
                {api.errorNode}
              </div>
            )
          }}
        </AliasesSearchButton>
        {suggestions.aliases ? (
          <div className="mt-2">
            {suggestionControl('aliases', 'Aliases')}
          </div>
        ) : null}
      </FormBlock>

      <FormBlock>
        {renderBooksAndTags()}
      </FormBlock>

      <FormBlock className="tune-record-form-block--meta">
        <div className="tune-record-form-meta-row">
          <Form.Group className="tune-record-form-meta-field">
            <FieldLabelRow label="Time Signature" formKey="meter" suggestion={suggestions.meter} onApplySuggestion={props.onApplySuggestion} values={values} tight={true}>
              <FieldLookupReviewButton
                tuneId={props.previewTune && props.previewTune.id}
                candidateId={props.candidateId}
                kind="meter"
                currentValue={values.meter || ''}
                currentDisplay={values.meter || ''}
                onApply={function(applied) {
                  if (!applied) return
                  const meter = String(applied.meter || applied.preview || '').trim()
                  if (meter) setField('meter', meter)
                }}
              />
            </FieldLabelRow>
            <CreatableSelect
              value={values.meter ? { value: values.meter, label: values.meter } : { value: '', label: '' }}
              onChange={function(val) { setField('meter', val ? val.value : ''); }}
              options={meterOptions}
              isClearable={true}
              blurInputOnSelect={true}
              createOptionPosition="first"
              menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
              styles={compactSelectStyles}
            />
          </Form.Group>
          <Form.Group className="tune-record-form-meta-field">
            <FieldLabelRow label="Key" formKey="keyName" suggestion={suggestions.keyName} onApplySuggestion={props.onApplySuggestion} values={values} tight={true}>
              <FieldLookupReviewButton
                tuneId={props.previewTune && props.previewTune.id}
                candidateId={props.candidateId}
                kind="key"
                currentValue={values.keyName || ''}
                currentDisplay={values.keyName || ''}
                onApply={function(applied) {
                  if (!applied) return
                  const key = String(applied.key || applied.preview || '').trim()
                  if (key) setField('keyName', key)
                }}
              />
            </FieldLabelRow>
            <KeySignatureInput
              value={values.keyName || ''}
              onChange={function(next) { setField('keyName', next); }}
              className="tune-record-form-key-input"
            />
          </Form.Group>
          <Form.Group className="tune-record-form-meta-field tune-record-form-meta-field--tempo">
            <FieldLabelRow label="Tempo" formKey="tempo" suggestion={suggestions.tempo} onApplySuggestion={props.onApplySuggestion} values={values} tight={true}>
              <FieldLookupReviewButton
                tuneId={props.previewTune && props.previewTune.id}
                candidateId={props.candidateId}
                kind="tempo"
                currentValue={values.tempo || ''}
                currentDisplay={values.tempo || ''}
                onApply={function(applied) {
                  if (!applied) return
                  const raw = applied.tempo != null ? applied.tempo : applied.preview
                  const parsed = parseInt(String(raw == null ? '' : raw).split('=').pop(), 10)
                  if (!isNaN(parsed) && parsed > 0) setField('tempo', String(parsed))
                }}
              />
            </FieldLabelRow>
            <Form.Control
              type="number"
              size="sm"
              value={values.tempo || ''}
              onChange={function(e) { setField('tempo', e.target.value); }}
            />
          </Form.Group>
          <Form.Group className="tune-record-form-meta-field">
            <FieldLabelRow label="Genre" formKey="genre" suggestion={suggestions.genre} onApplySuggestion={props.onApplySuggestion} values={values} tight={true}>
              <GenreSearchButton
                tuneId={props.previewTune && props.previewTune.id}
                candidateId={props.candidateId}
                title={values.title}
                artist={values.artist}
                rhythm={values.rhythm}
                currentGenre={values.genre}
                backgroundInfo={values.backgroundInfo}
                tunebook={tunebook}
                disabled={!String(values.title || '').trim()}
                onGenre={function(genre) { setField('genre', genre); }}
              />
            </FieldLabelRow>
            <CreatableSelect
              value={genreSelectValue(values.genre)}
              onChange={function(val) { setField('genre', val ? val.label : ''); }}
              options={getMusicGenreSelectOptions()}
              isClearable={true}
              blurInputOnSelect={true}
              createOptionPosition="first"
              placeholder="eg Folk, Jazz"
              menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
              styles={compactSelectStyles}
            />
          </Form.Group>
        </div>
      </FormBlock>

      <FormBlock>
        <FieldPreviewEditor
          label="Lyrics"
          value={values.lyrics || ''}
          onChange={function(text) { setField('lyrics', text); }}
          previewLines={5}
          emptyMessage="No lyrics yet."
          textareaRef={lyricsTextareaRef}
          suggestionControl={(
            <>
              {suggestionControl('lyrics', 'Lyrics')}
              <LyricsSearchButton
                tuneId={props.previewTune && props.previewTune.id}
                candidateId={props.candidateId}
                title={values.title}
                artist={values.artist}
                rhythm={values.rhythm}
                currentGenre={values.genre}
                token={props.token}
                tunebook={tunebook}
                resolverAvailable={props.resolverAvailable}
                existingLyrics={values.lyrics || ''}
                disabled={!String(values.title || '').trim()}
                alsoSearchChords={true}
                forceReview={true}
                onGenreAccept={function(genre) { setField('genre', genre); }}
                onLyrics={function(result) {
                  const text = result && (result.text || (Array.isArray(result.lines) ? result.lines.join('\n') : ''));
                  if (text) setField('lyrics', text);
                }}
              />
            </>
          )}
          dialogToolbar={function(toolbar) {
            return (
              <div className="abc-editor-lyrics-toolbar d-flex align-items-center gap-2 flex-wrap">
                <Button
                  variant="outline-primary"
                  size="sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35em' }}
                  title="Open lyrics tools with selected text"
                  onClick={function() {
                    const node = toolbar.textareaRef && toolbar.textareaRef.current;
                    let selected = '';
                    if (node && typeof node.selectionStart === 'number') {
                      selected = String(node.value || '').slice(node.selectionStart, node.selectionEnd);
                    }
                    const firstLine = String(selected || toolbar.draft || '')
                      .split(/\r?\n/)
                      .map(function(line) { return line.trim(); })
                      .find(Boolean) || '';
                    setLyricsToolsQuery(firstLine);
                    setShowLyricsTools(true);
                  }}
                >
                  {tunebook && tunebook.icons && tunebook.icons.quillpen ? tunebook.icons.quillpen : null}
                  Tools
                </Button>
                <LyricsSectionsDropdown
                  size="sm"
                  lyricsText={toolbar.draft || ''}
                  textareaRef={toolbar.textareaRef}
                  tunebook={tunebook}
                  onChange={function(text) { toolbar.setDraft(text); }}
                />
                <Button
                  variant="outline-secondary"
                  size="sm"
                  style={{ marginLeft: 'auto' }}
                  onClick={function() { setShowNoteAlignedLyrics(true); }}
                >
                  Note-aligned lyrics
                </Button>
              </div>
            );
          }}
        />
      </FormBlock>

      <FormBlock>
        {showNotationMerge ? (
          <ReviewNotationMergePanel
            currentText={primaryVoiceNotesText(values.voices) || values.notes || ''}
            importedText={importedNotation}
            metadata={notationMetadata}
            tunebook={tunebook}
            onChange={function(text) {
              const voices = Object.assign({}, values.voices || { '1': { meta: '', notes: [] } });
              const primaryKey = Object.keys(voices).sort()[0] || '1';
              voices[primaryKey] = Object.assign({}, voices[primaryKey] || { meta: '' }, {
                notes: String(text || '').split(/\r?\n/),
              });
              if (typeof props.onChange === 'function') {
                props.onChange(updateValues(values, { voices: voices, notes: text }));
              }
            }}
          />
        ) : null}
        <AbcVoicesNotesEditor
          voices={values.voices}
          tunebook={tunebook}
          metadata={notationMetadata}
          previewLines={5}
          suggestionControl={(
            <>
              {suggestionControl('notes', 'Notation')}
              <NotationSearchButton
                tuneId={props.previewTune && props.previewTune.id}
                candidateId={props.candidateId}
                title={values.title}
                artist={values.artist}
                rhythm={values.rhythm}
                currentGenre={values.genre}
                currentValue={values.notes || ''}
                token={props.token}
                tunebook={tunebook}
                resolverAvailable={props.resolverAvailable}
                disabled={!String(values.title || '').trim()}
                onGenreAccept={function(genre) { setField('genre', genre); }}
                onNotation={function(candidate) {
                  const abc = candidate && candidate.abc ? String(candidate.abc) : '';
                  if (!abc || !tunebook || !tunebook.abcTools) return;
                  const imported = tunebook.abcTools.abc2json(abc);
                  const notes = imported && Array.isArray(imported.notes)
                    ? imported.notes.join('\n')
                    : (imported && imported.voices
                      ? primaryVoiceNotesText(imported.voices)
                      : abc);
                  const voices = Object.assign({}, values.voices || { '1': { meta: '', notes: [] } });
                  const primaryKey = Object.keys(voices).sort()[0] || '1';
                  voices[primaryKey] = Object.assign({}, voices[primaryKey] || { meta: '' }, {
                    notes: String(notes || '').split(/\r?\n/),
                  });
                  if (typeof props.onChange === 'function') {
                    props.onChange(updateValues(values, {
                      voices: imported && imported.voices ? imported.voices : voices,
                      notes: notes,
                    }));
                  }
                }}
              />
            </>
          )}
          onChange={function(nextVoices) {
            if (typeof props.onChange === 'function') {
              props.onChange(updateValues(values, {
                voices: nextVoices,
                notes: primaryVoiceNotesText(nextVoices),
              }));
            }
          }}
        />
      </FormBlock>

      <FormBlock>
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
      </FormBlock>

      <FormBlock>
        <FieldPreviewEditor
          label="Background info"
          value={values.backgroundInfo || ''}
          onChange={function(text) { setField('backgroundInfo', text); }}
          previewLines={5}
          fillDialogHeight={true}
          emptyMessage="No background info yet."
          suggestionControl={(
            <>
              {suggestionControl('backgroundInfo', 'Background info')}
              {(props.previewTune && props.previewTune.id) ? (
                <TuneBackgroundSearchButton
                  tuneId={props.previewTune.id}
                  title={values.title}
                  artist={values.artist}
                  lyrics={values.lyrics}
                  rhythm={values.rhythm}
                  currentGenre={values.genre}
                  token={props.token}
                  existingBackgroundInfo={values.backgroundInfo}
                  tunebook={tunebook}
                  disabled={!String(values.title || '').trim()}
                  onGenreAccept={function(genre) { setField('genre', genre); }}
                  onBackgroundInfo={function(result) {
                    if (result && result.text) setField('backgroundInfo', result.text);
                  }}
                />
              ) : null}
            </>
          )}
        />
      </FormBlock>

      <NoteAlignedLyricsModal
        show={showNoteAlignedLyrics}
        onHide={function() { setShowNoteAlignedLyrics(false); }}
        tune={lyricsTune}
        tunebook={tunebook}
        onSaved={function(savedTune) {
          if (!savedTune) return;
          const plain = getPlainLyricLines(savedTune).join('\n');
          if (plain && plain !== String(values.lyrics || '')) {
            setField('lyrics', plain);
          }
        }}
      />
      <LyricsToolsModal
        show={showLyricsTools}
        onHide={function() { setShowLyricsTools(false); }}
        query={lyricsToolsQuery}
      />

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
            <Form.Group className="mb-3">
              <FieldLabelRow label="Rhythm" formKey="rhythm" suggestion={suggestions.rhythm} onApplySuggestion={props.onApplySuggestion}  values={values} />
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

            <Form.Group className="mb-3">
              <FieldLabelRow label="Note length" formKey="noteLength" suggestion={suggestions.noteLength} onApplySuggestion={props.onApplySuggestion}  values={values} />
              <Form.Select value={values.noteLength || ''} onChange={function(e) { setField('noteLength', e.target.value); }}>
                {NOTE_LENGTH_OPTIONS.map(function(option) {
                  return <option key={option || 'empty'} value={option}>{option || ''}</option>;
                })}
              </Form.Select>
            </Form.Group>

            <Row>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <FieldLabelRow label="Capo" formKey="capo" suggestion={suggestions.capo} onApplySuggestion={props.onApplySuggestion}  values={values} />
                  <Form.Control type="number" value={values.capo || ''} onChange={function(e) { setField('capo', e.target.value); }} />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <FieldLabelRow label="Transpose" formKey="transpose" suggestion={suggestions.transpose} onApplySuggestion={props.onApplySuggestion}  values={values} />
                  <Form.Control value={values.transpose || ''} onChange={function(e) { setField('transpose', e.target.value); }} />
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group className="mb-3">
                  <FieldLabelRow label="Tuning" formKey="tuning" suggestion={suggestions.tuning} onApplySuggestion={props.onApplySuggestion}  values={values} />
                  <Form.Control value={values.tuning || ''} onChange={function(e) { setField('tuning', e.target.value); }} />
                </Form.Group>
              </Col>
            </Row>

            <div className="abc-editor-info-section abc-editor-info-section-practice mb-3">
              <div className="abc-editor-info-section-heading">Practice</div>
              <Row className="g-2 align-items-end">
                <Col xs={12} lg={4}>
                  <Form.Group className="mb-3" controlId="suitableForPractice">
                    <FormLabelWithHelp
                      label="Suitable for practice"
                      helpBody={EDITOR_INFO_FIELD_HELP.suitableForPractice.body}
                      helpTitle={EDITOR_INFO_FIELD_HELP.suitableForPractice.title}
                    />
                    <Form.Check
                      type="checkbox"
                      id="tune-record-suitable-for-practice"
                      label="Include in practice sessions"
                      checked={!!values.suitableForPractice}
                      onChange={function(e) { setField('suitableForPractice', !!e.target.checked); }}
                    />
                  </Form.Group>
                </Col>
                <Col xs={12} lg={8}>
                  <Form.Group className="mb-3" controlId="suitableFor">
                    <FormLabelWithHelp
                      label="Suitable for"
                      helpBody={EDITOR_INFO_FIELD_HELP.suitableFor.body}
                      helpTitle={EDITOR_INFO_FIELD_HELP.suitableFor.title}
                    />
                    <div className="abc-editor-suitable-for">
                      {PRACTICE_INSTRUMENTS.map(function(item) {
                        const selected = normalizeSuitableInstruments(values.suitableFor);
                        const checked = selected.indexOf(item.id) !== -1;
                        return (
                          <Form.Check
                            inline
                            key={item.id}
                            type="checkbox"
                            id={'tune-record-suitable-for-' + item.id}
                            label={item.label}
                            checked={checked}
                            onChange={function(e) {
                              const next = selected.slice();
                              if (e.target.checked) {
                                if (next.indexOf(item.id) === -1) next.push(item.id);
                              } else {
                                const idx = next.indexOf(item.id);
                                if (idx !== -1) next.splice(idx, 1);
                              }
                              setField('suitableFor', next);
                            }}
                          />
                        );
                      })}
                    </div>
                  </Form.Group>
                </Col>
              </Row>
            </div>

            {['playbackAudioFilters', 'soundFonts', 'meta'].map(function(jsonKey) {
              if (!suggestions[jsonKey]) return null;
              return (
                <div key={jsonKey} className="mb-3">
                  <FieldLabelRow
                    label={jsonKey}
                    formKey={jsonKey}
                    suggestion={suggestions[jsonKey]}
                    onApplySuggestion={props.onApplySuggestion}
                   values={values} />
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
