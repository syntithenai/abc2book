import React, { useLayoutEffect, useState } from 'react';
import { EDITOR_MODES } from '../notation/notationConstants';
import { staffSelectionAnchorRects } from '../notation/staffCaretPosition';

export default function StaffSelectionOverlay(props) {
  const { containerRef, session, displayAbc, voiceStaffIndex } = props;
  const [rects, setRects] = useState([]);
  const showSelection = session.mode !== EDITOR_MODES.NOTE_INPUT
    && session.selection.eventIds.length > 0;

  useLayoutEffect(function() {
    if (!showSelection) {
      setRects([]);
      return undefined;
    }

    function measure() {
      const node = containerRef && containerRef.current;
      if (!node) {
        setRects([]);
        return;
      }
      setRects(staffSelectionAnchorRects(
        node,
        session.events,
        session.selection.eventIds,
        voiceStaffIndex
      ));
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
    showSelection,
    containerRef,
    session.selection.eventIds,
    session.events,
    displayAbc,
    voiceStaffIndex,
  ]);

  if (!showSelection || !rects.length) return null;

  return (
    <div className="notation-staff-selection-layer" aria-hidden="true">
      {rects.map(function(rect, index) {
        return (
          <div
            key={index}
            className="notation-staff-selection-box"
            data-testid="notation-staff-selection-box"
            style={{
              left: rect.left + 'px',
              top: rect.top + 'px',
              width: rect.width + 'px',
              height: rect.height + 'px',
            }}
          />
        );
      })}
    </div>
  );
}
