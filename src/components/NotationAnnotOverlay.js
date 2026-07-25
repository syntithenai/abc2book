import React, { useEffect, useRef } from 'react';
import { Form } from 'react-bootstrap';

/**
 * Lightweight overlay input for MuseScore-like chord / fingering entry on the staff.
 * mode: 'chord' | 'finger'
 */
export default function NotationAnnotOverlay(props) {
  const {
    mode,
    value,
    left,
    top,
    onChange,
    onCommit,
    onAdvance,
    onCancel,
    onClear,
  } = props;
  const inputRef = useRef(null);

  useEffect(function() {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [mode, left, top]);

  if (!mode) return null;

  const placeholder = mode === 'finger' ? '1–5 or label' : 'Am';
  const title = mode === 'finger' ? 'Fingering' : 'Chord symbol';
  const inputType = mode === 'chord' ? 'search' : 'text';

  return (
    <div
      className="notation-annot-overlay"
      style={{ left: left || 0, top: top || 0 }}
      data-testid="notation-annot-overlay"
      data-mode={mode}
    >
      <Form.Control
        ref={inputRef}
        type={inputType}
        size="sm"
        className="notation-annot-overlay-input"
        value={value || ''}
        placeholder={placeholder}
        aria-label={title}
        title={title + ' — Space advances, Enter saves, Esc cancels'}
        onChange={function(e) {
          const next = e.target.value;
          if (onChange) onChange(next);
        }}
        onSearch={function(e) {
          if (!String(e.target.value || '').length && typeof onClear === 'function') onClear();
        }}
        onKeyDown={function(e) {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            if (onCancel) onCancel();
            return;
          }
          if (e.key === 'Backspace' && !(value || '').length && typeof onClear === 'function') {
            e.preventDefault();
            e.stopPropagation();
            onClear();
            return;
          }
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            if (e.key === ' ') {
              if (onAdvance) onAdvance();
            } else if (onCommit) {
              onCommit();
            }
          }
        }}
        onBlur={function() {
          if (onCommit) onCommit();
        }}
      />
    </div>
  );
}
