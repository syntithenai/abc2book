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
  } = props;
  const inputRef = useRef(null);

  useEffect(function() {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [mode, left, top]);

  if (!mode) return null;

  const placeholder = mode === 'finger' ? '1–5' : 'Am';
  const title = mode === 'finger' ? 'Fingering' : 'Chord symbol';

  return (
    <div
      className="notation-annot-overlay"
      style={{ left: left || 0, top: top || 0 }}
      data-testid="notation-annot-overlay"
      data-mode={mode}
    >
      <Form.Control
        ref={inputRef}
        size="sm"
        value={value || ''}
        placeholder={placeholder}
        aria-label={title}
        title={title + ' — Space advances, Esc cancels'}
        onChange={function(e) { if (onChange) onChange(e.target.value); }}
        onKeyDown={function(e) {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            if (onCancel) onCancel();
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
