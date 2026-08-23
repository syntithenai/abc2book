import React from 'react';

export default function MidiImportKeySelect(props) {
  const key = props.value || 'C';

  return (
    <select
      className="form-select form-select-sm midi-import-key-native"
      value={key}
      onChange={function(e) {
        if (props.onChange) props.onChange(e.target.value);
      }}
      onClick={function(e) { e.stopPropagation(); }}
      aria-label="Key signature"
    >
      {(props.options || []).map(function(k) {
        return <option key={k} value={k}>{k}</option>;
      })}
    </select>
  );
}
