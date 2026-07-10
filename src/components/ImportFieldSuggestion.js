import { Dropdown, Button } from 'react-bootstrap';
import { formatTuneFieldValue } from '../tuneImportMergeUtils';

function truncateText(text, maxLen) {
  const value = String(text || '').trim();
  if (value.length <= maxLen) return value;
  return value.slice(0, maxLen - 1) + '…';
}

export default function ImportFieldSuggestion(props) {
  const label = props.label || 'Import';
  const suggestion = props.suggestion;
  if (!suggestion) return null;

  const fieldKey = suggestion.key || props.fieldKey || '';
  const display = props.importedDisplay != null
    ? props.importedDisplay
    : formatTuneFieldValue(fieldKey, suggestion.value);
  const preview = truncateText(display, 36);

  return (
    <Dropdown className="import-field-suggestion d-inline-block">
      <Dropdown.Toggle
        variant="outline-info"
        size="sm"
        id={'import-suggestion-' + (props.id || fieldKey || label)}
        aria-label={'Import suggestion for ' + label}
      >
        Use import: {preview || label}
      </Dropdown.Toggle>
      <Dropdown.Menu className="import-field-suggestion-menu">
        <div className="import-field-suggestion-preview">{display}</div>
        <div className="import-field-suggestion-actions">
          <Button
            size="sm"
            variant="success"
            onClick={function() {
              if (typeof props.onApply === 'function') props.onApply(suggestion);
            }}
          >
            Use import
          </Button>
        </div>
      </Dropdown.Menu>
    </Dropdown>
  );
}
