import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { buildAbcDoubleBarHighlightParts } from '../abcDoubleBarHighlight';

/**
 * Monospace ABC notes textarea with || (double bar) highlight backdrop.
 */
export default function AbcNotesTextarea(props) {
  const value = props.value == null ? '' : String(props.value);
  const textareaRef = useRef(null);
  const highlightRef = useRef(null);

  const parts = useMemo(function() {
    return buildAbcDoubleBarHighlightParts(value);
  }, [value]);

  function syncScroll() {
    const ta = textareaRef.current;
    const hi = highlightRef.current;
    if (!ta || !hi) return;
    hi.scrollTop = ta.scrollTop;
    hi.scrollLeft = ta.scrollLeft;
  }

  useLayoutEffect(function() {
    syncScroll();
  }, [value, props.className]);

  function setRefs(el) {
    textareaRef.current = el;
    if (typeof props.textareaRef === 'function') {
      props.textareaRef(el);
    } else if (props.textareaRef) {
      props.textareaRef.current = el;
    }
  }

  return (
    <div className="notation-abc-textarea-shell">
      <pre
        ref={highlightRef}
        className="notation-abc-textarea-highlight"
        aria-hidden="true"
      >
        {parts.map(function(part, index) {
          if (part.type === 'doubleBar') {
            return (
              <mark key={index} className="notation-abc-double-bar">
                {part.text}
              </mark>
            );
          }
          if (part.type === 'midBlockDoubleBar') {
            return (
              <mark key={index} className="notation-abc-double-bar notation-abc-double-bar--mid-block">
                {part.text}
              </mark>
            );
          }
          return <span key={index}>{part.text}</span>;
        })}
        {value.length === 0 ? '\n' : null}
      </pre>
      <textarea
        ref={setRefs}
        value={value}
        className={'notation-abc-textarea' + (props.className ? ' ' + props.className : '')}
        rows={props.rows}
        data-testid={props['data-testid']}
        aria-label={props['aria-label']}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        onFocus={props.onFocus}
        onBlur={props.onBlur}
        onChange={props.onChange}
        onSelect={props.onSelect}
        onKeyUp={props.onKeyUp}
        onClick={props.onClick}
        onScroll={syncScroll}
      />
    </div>
  );
}
