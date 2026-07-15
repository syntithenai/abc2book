import { useEffect, useState } from 'react';
import { Button, Dropdown } from 'react-bootstrap';
import { formatTuneFieldValue } from '../tuneImportMergeUtils';
import SuggestionPreviewDialog from './SuggestionPreviewDialog';
import SearchResultPickerModal from './SearchResultPickerModal';

function truncateText(text, maxLen) {
  const value = String(text || '').trim();
  if (value.length <= maxLen) return value;
  return value.slice(0, maxLen - 1) + '…';
}

function previewKind(fieldKey, formKey) {
  const key = String(formKey || fieldKey || '').toLowerCase();
  if (key === 'notes' || key === 'voices' || key === 'notation') return 'notation';
  if (key === 'lyrics' || key === 'words' || key === 'wlines' || key === 'chords') return 'lyrics';
  return null;
}

function choiceToPickerItem(choice, index) {
  const value = choice && choice.value;
  let abc = '';
  if (typeof value === 'string') abc = value;
  else if (value && typeof value === 'object' && typeof value.abc === 'string') abc = value.abc;
  else if (choice && choice.preview) abc = String(choice.preview);
  return {
    title: String(choice && (choice.label || choice.preview) || ('Option ' + (index + 1))).trim(),
    artist: '',
    preview: choice && choice.preview != null ? String(choice.preview) : abc,
    abc: abc,
    source: choice && choice.source ? String(choice.source) : '',
    sourceUrl: choice && choice.id ? String(choice.id) : '',
  };
}

/**
 * Suggestion control. Scalar fields use a dropdown; lyrics keep a confirm preview;
 * notation opens a fullscreen multi-column gallery with abcjs snippets.
 */
export default function ImportFieldSuggestion(props) {
  const label = props.label || 'Import';
  const actionLabel = props.actionLabel || 'Use import';
  const suggestion = props.suggestion;
  const choices = Array.isArray(props.choices) ? props.choices : null;
  const [previewChoice, setPreviewChoice] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(-1);
  const [showNotationGallery, setShowNotationGallery] = useState(false);
  const [showChoicesModal, setShowChoicesModal] = useState(false);

  useEffect(function() {
    if (!props.openRequestToken) return;
    if (previewKind(
      (props.suggestion && props.suggestion.key) || props.fieldKey || '',
      (props.suggestion && props.suggestion.formKey) || props.formKey || ''
    ) === 'notation') {
      setShowNotationGallery(true);
      return;
    }
    setShowChoicesModal(true);
  }, [props.openRequestToken]);

  if (!suggestion && (!choices || choices.length === 0)) return null;

  const fieldKey = (suggestion && suggestion.key) || props.fieldKey || '';
  const formKey = (suggestion && suggestion.formKey) || props.formKey || fieldKey;
  const display = props.importedDisplay != null
    ? props.importedDisplay
    : formatTuneFieldValue(fieldKey, suggestion && suggestion.value);
  const preview = truncateText(display, 36);
  const menuChoices = choices && choices.length > 0
    ? choices
    : [{
        id: 'apply',
        label: display || label,
        preview: display,
        value: suggestion,
      }];
  const toggleVariant = props.variant || 'outline-info';
  const kind = previewKind(fieldKey, formKey);
  const useNotationGallery = kind === 'notation';
  const useLyricsPreview = kind === 'lyrics';

  function applyChoice(choice, index) {
    if (typeof props.onSelectChoice === 'function') {
      props.onSelectChoice(choice, index);
      return;
    }
    if (typeof props.onApply === 'function') {
      props.onApply(choice && choice.value != null ? choice.value : suggestion);
    }
  }

  function handleChoiceClick(choice, index) {
    if (useLyricsPreview) {
      setPreviewChoice(choice);
      setPreviewIndex(index);
      return;
    }
    applyChoice(choice, index);
  }

  if (useNotationGallery) {
    return (
      <>
        <Button
          variant={toggleVariant}
          size="sm"
          className="import-field-suggestion"
          id={'import-suggestion-' + (props.id || fieldKey || label)}
          aria-label={actionLabel + ' suggestion for ' + label}
          onClick={function() { setShowNotationGallery(true); }}
        >
          {actionLabel}: {preview || label}
        </Button>
        <SearchResultPickerModal
          show={showNotationGallery}
          title={'Choose ' + (label || 'notation')}
          layout="notation"
          previewMetadata={props.previewMetadata}
          items={menuChoices.map(choiceToPickerItem)}
          onSelect={function(item, index) {
            const choice = menuChoices[index];
            if (!choice) return;
            setShowNotationGallery(false);
            applyChoice(choice, index);
          }}
          onHide={function() { setShowNotationGallery(false); }}
        />
      </>
    );
  }

  return (
    <>
      <Dropdown className="import-field-suggestion d-inline-block">
        <Dropdown.Toggle
          variant={toggleVariant}
          size="sm"
          id={'import-suggestion-' + (props.id || fieldKey || label)}
          aria-label={actionLabel + ' suggestion for ' + label}
        >
          {actionLabel}: {preview || label}
        </Dropdown.Toggle>
        <Dropdown.Menu className="import-field-suggestion-menu">
          {menuChoices.map(function(choice, index) {
            const choiceLabel = String(choice.label || choice.preview || ('Option ' + (index + 1))).trim();
            const choicePreview = choice.preview && choice.preview !== choiceLabel
              ? String(choice.preview)
              : '';
            const source = choice.source ? String(choice.source) : '';
            return (
              <Dropdown.Item
                key={choice.id || (choiceLabel + '-' + index)}
                className="import-field-suggestion-choice"
                onClick={function() {
                  handleChoiceClick(choice, index);
                }}
              >
                <div className="import-field-suggestion-choice-label">{choiceLabel}</div>
                {source ? (
                  <div className="import-field-suggestion-choice-meta">{source}</div>
                ) : null}
                {choicePreview ? (
                  <div className="import-field-suggestion-choice-preview">{truncateText(choicePreview, 160)}</div>
                ) : null}
              </Dropdown.Item>
            );
          })}
        </Dropdown.Menu>
      </Dropdown>
      <SuggestionPreviewDialog
        show={!!previewChoice}
        kind="lyrics"
        choice={previewChoice}
        metadata={props.previewMetadata}
        onCancel={function() {
          setPreviewChoice(null);
          setPreviewIndex(-1);
        }}
        onConfirm={function() {
          const choice = previewChoice;
          const index = previewIndex;
          setPreviewChoice(null);
          setPreviewIndex(-1);
          if (choice) applyChoice(choice, index);
        }}
      />
      <SearchResultPickerModal
        show={!!showChoicesModal}
        title={'Choose ' + (label || 'suggestion')}
        layout={useLyricsPreview ? 'lyrics' : 'list'}
        previewMetadata={props.previewMetadata}
        items={menuChoices.map(choiceToPickerItem)}
        onSelect={function(item, index) {
          const choice = menuChoices[index];
          if (!choice) return;
          setShowChoicesModal(false);
          handleChoiceClick(choice, index);
        }}
        onHide={function() { setShowChoicesModal(false); }}
      />
    </>
  );
}
