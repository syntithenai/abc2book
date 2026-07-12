import { Dropdown } from 'react-bootstrap';
import { formatTuneFieldValue } from '../tuneImportMergeUtils';

function truncateText(text, maxLen) {
  const value = String(text || '').trim();
  if (value.length <= maxLen) return value;
  return value.slice(0, maxLen - 1) + '…';
}

/**
 * Suggestion dropdown. Opens to a list of choices only (no Use/Choose/Dismiss buttons).
 * Pass `choices` for multi-result search; otherwise the single suggestion value is the one choice.
 */
export default function ImportFieldSuggestion(props) {
  const label = props.label || 'Import';
  const actionLabel = props.actionLabel || 'Use import';
  const suggestion = props.suggestion;
  const choices = Array.isArray(props.choices) ? props.choices : null;
  if (!suggestion && (!choices || choices.length === 0)) return null;

  const fieldKey = (suggestion && suggestion.key) || props.fieldKey || '';
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

  return (
    <Dropdown className="import-field-suggestion d-inline-block">
      <Dropdown.Toggle
        variant="outline-info"
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
                if (typeof props.onSelectChoice === 'function') {
                  props.onSelectChoice(choice, index);
                  return;
                }
                if (typeof props.onApply === 'function') {
                  props.onApply(choice.value != null ? choice.value : suggestion);
                }
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
  );
}
