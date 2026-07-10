import React, { useLayoutEffect, useState } from 'react';
import { EDITOR_MODES } from '../notation/notationConstants';
import { rectForEventIndex } from '../notation/staffClickResolve';

export default function StaffCaretOverlay(props) {
  const { containerRef, session, displayAbc, voiceStaffIndex } = props;
  const [computedAnchor, setComputedAnchor] = useState(null);
  const showCaret = session.mode === EDITOR_MODES.NOTE_INPUT;

  useLayoutEffect(function() {
    if (!showCaret) {
      setComputedAnchor(null);
      return undefined;
    }

    function measure() {
      const node = containerRef && containerRef.current;
      if (!node) {
        setComputedAnchor(null);
        return;
      }
      setComputedAnchor(rectForEventIndex(node, session.events, session.caretIndex, voiceStaffIndex));
    }

    measure();
    const raf = requestAnimationFrame(measure);

    const node = containerRef && containerRef.current;
    let observer = null;
    if (node && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(node);
    }
    window.addEventListener('resize', measure);

    return function() {
      cancelAnimationFrame(raf);
      if (observer) observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [
    showCaret,
    containerRef,
    session.caretIndex,
    session.events,
    displayAbc,
    voiceStaffIndex,
  ]);

  const anchor = computedAnchor;
  if (!showCaret || !anchor) return null;

  return (
    <div
      className="notation-staff-caret"
      data-testid="notation-staff-caret"
      style={{
        left: anchor.left + 'px',
        top: anchor.top + 'px',
        height: anchor.height + 'px',
      }}
      aria-hidden="true"
    />
  );
}
