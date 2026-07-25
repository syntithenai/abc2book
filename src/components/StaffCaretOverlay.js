import React, { useLayoutEffect, useState } from 'react';
import { EDITOR_MODES } from '../notation/notationConstants';
import { rectForEventIndex } from '../notation/staffClickResolve';

export default function StaffCaretOverlay(props) {
  const {
    containerRef,
    session,
    displayAbc,
    voiceStaffIndex,
    insertAnchor,
  } = props;
  const [computedAnchor, setComputedAnchor] = useState(null);
  const hasNoteSelection = !!(
    session.selection
    && session.selection.eventIds
    && session.selection.eventIds.length
  );
  const showNoteInputCaret = session.mode === EDITOR_MODES.NOTE_INPUT;
  const showInsertCaret = session.mode === EDITOR_MODES.NORMAL && !hasNoteSelection;
  const showCaret = showNoteInputCaret || showInsertCaret;

  useLayoutEffect(function() {
    if (!showCaret) {
      setComputedAnchor(null);
      return undefined;
    }

    function measure() {
      if (insertAnchor && typeof insertAnchor.left === 'number') {
        setComputedAnchor(insertAnchor);
        return;
      }
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
    insertAnchor,
  ]);

  const anchor = computedAnchor;
  if (!showCaret || !anchor) return null;

  return (
    <div
      className={
        'notation-staff-caret'
        + (showInsertCaret ? ' notation-staff-caret--insert' : '')
      }
      data-testid={showInsertCaret ? 'notation-staff-insert-caret' : 'notation-staff-caret'}
      style={{
        left: anchor.left + 'px',
        top: anchor.top + 'px',
        height: anchor.height + 'px',
      }}
      aria-hidden="true"
    />
  );
}
