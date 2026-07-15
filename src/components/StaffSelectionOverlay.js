import React, { useLayoutEffect, useState } from 'react';
import { EDITOR_MODES } from '../notation/notationConstants';
import { selectionRectsForEventIds } from '../notation/staffClickResolve';

export default function StaffSelectionOverlay(props) {
  const {
    containerRef,
    session,
    displayAbc,
    voiceStaffIndex,
    clickRects,
    dragPreview,
    marqueeRect,
  } = props;
  const [rects, setRects] = useState([]);
  const previewEventIds = dragPreview && Array.isArray(dragPreview.eventIds)
    ? dragPreview.eventIds
    : null;
  const eventIdsForRects = (previewEventIds && previewEventIds.length)
    ? previewEventIds
    : session.selection.eventIds;
  const showSelection = session.mode !== EDITOR_MODES.NOTE_INPUT
    && eventIdsForRects
    && eventIdsForRects.length > 0;
  const useClickRects = !!(
    clickRects
    && clickRects.length
    && session.selection.eventIds.length === 1
    && clickRects.length === 1
    && !dragPreview
  );

  const previewSteps = dragPreview && typeof dragPreview.staffSteps === 'number'
    ? dragPreview.staffSteps
    : 0;
  const previewStepPx = dragPreview && dragPreview.stepPx > 0 ? dragPreview.stepPx : 14;
  // Positive staffSteps = drag down = lower pitch = increase Y.
  const previewOffsetY = previewSteps * previewStepPx;

  useLayoutEffect(function() {
    if (!showSelection) {
      setRects([]);
      return undefined;
    }

    if (useClickRects) {
      setRects(clickRects);
      return undefined;
    }

    function measure() {
      const node = containerRef && containerRef.current;
      if (!node) {
        setRects([]);
        return;
      }
      setRects(selectionRectsForEventIds(
        node,
        session.events,
        eventIdsForRects,
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
    useClickRects,
    clickRects,
    containerRef,
    eventIdsForRects,
    session.events,
    displayAbc,
    voiceStaffIndex,
    dragPreview,
  ]);

  const hasMarquee = !!(marqueeRect
    && Math.abs(marqueeRect.right - marqueeRect.left) > 2
    && Math.abs(marqueeRect.bottom - marqueeRect.top) > 2);

  if ((!showSelection || !rects.length) && !hasMarquee) return null;

  return (
    <div className="notation-staff-selection-layer" aria-hidden="true">
      {showSelection ? rects.map(function(rect, index) {
        return (
          <div
            key={index}
            className={
              'notation-staff-selection-box'
              + (previewSteps ? ' notation-staff-selection-box--drag-preview' : '')
            }
            data-testid="notation-staff-selection-box"
            style={{
              left: rect.left + 'px',
              top: rect.top + 'px',
              width: rect.width + 'px',
              height: rect.height + 'px',
              transform: previewSteps ? ('translateY(' + previewOffsetY + 'px)') : undefined,
            }}
          />
        );
      }) : null}
      {hasMarquee ? (
        <div
          className="notation-staff-marquee"
          data-testid="notation-staff-marquee"
          style={{
            left: Math.min(marqueeRect.left, marqueeRect.right) + 'px',
            top: Math.min(marqueeRect.top, marqueeRect.bottom) + 'px',
            width: Math.abs(marqueeRect.right - marqueeRect.left) + 'px',
            height: Math.abs(marqueeRect.bottom - marqueeRect.top) + 'px',
          }}
        />
      ) : null}
    </div>
  );
}
