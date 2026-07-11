import { useMemo, useState } from 'react';
import { Button } from 'react-bootstrap';
import CreatableSelect from 'react-select/creatable';
import {
  listKeySignatureOptions,
  normalizeKeySignature,
  suggestKeySignature,
  filterKeySignatureOption,
} from '../keySignatureNormalize';

export default function KeySignatureInput(props) {
  const value = props.value == null ? '' : String(props.value);
  const [inputValue, setInputValue] = useState('');

  const options = useMemo(function() {
    return listKeySignatureOptions();
  }, []);

  const selectValue = value
    ? { value: value, label: value }
    : null;

  const suggestionSource = String(inputValue || '').trim() || value;
  const suggestion = suggestKeySignature(suggestionSource);

  function commit(raw) {
    const next = normalizeKeySignature(raw);
    if (typeof props.onChange === 'function') props.onChange(next);
  }

  function applySuggestion() {
    if (!suggestion) return;
    setInputValue('');
    commit(suggestion);
  }

  return (
    <div className={'key-signature-input' + (props.className ? ' ' + props.className : '')}>
      {suggestion ? (
        <div className="key-signature-suggestion">
          <Button
            type="button"
            variant="outline-info"
            size="sm"
            className="key-signature-suggestion-token"
            onClick={applySuggestion}
            aria-label={'Use normalized key ' + suggestion}
          >
            Use {suggestion}
          </Button>
        </div>
      ) : null}
      <CreatableSelect
        inputId={props.id}
        aria-label={props['aria-label'] || 'Key'}
        value={selectValue}
        inputValue={inputValue}
        onInputChange={function(next, meta) {
          if (meta && meta.action === 'input-change') {
            setInputValue(next);
          }
        }}
        onChange={function(val) {
          setInputValue('');
          commit(val ? val.value : '');
        }}
        onBlur={function() {
          const typed = String(inputValue || '').trim();
          if (typed) {
            setInputValue('');
            commit(typed);
            return;
          }
          if (value) commit(value);
        }}
        options={options}
        filterOption={filterKeySignatureOption}
        isClearable={props.isClearable !== false}
        blurInputOnSelect={true}
        createOptionPosition="first"
        placeholder={props.placeholder || ''}
        menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
        styles={{
          menuPortal: function(base) { return Object.assign({}, base, { zIndex: 9999 }); },
        }}
      />
    </div>
  );
}
