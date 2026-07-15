import React, { useLayoutEffect, useMemo, useState } from 'react';
import { EDITOR_MODES } from '../notation/notationConstants';
import { selectionRectsForEventIds } from '../notation/staffClickResolve';
import { findSlurGroupForSelection } from '../notation/notationMarks';

export default function StaffSelectionOverlay(props) {
  const {
    containerRef,
    session,
    displayAbc,
    voiceStaffIndex,
    clickRects,
    dragPreview,
    marqueeRect,
    slurSnapEventId,
    onSlurHandlePointerDown,
  } = props;
  const [rects, setRects] = useState([]);
  const [slurEndpointRects, setSlurEndpointRects] = useState({ start: null, end: null });
  const [snapRect, setSnapRect] = useState(null);
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
  const previewOffsetY = previewSteps * previewStepPx;
  const showPitchTarget = previewSteps !== 0;

  const slurGroup = useMemo(function() {
    if (session.mode === EDITOR_MODES.NOTE_INPUT) return null;
    return findSlurGroupForSelection(session);
  }, [session]);

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

  useLayoutEffect(function() {
    const node = containerRef && containerRef.current;
    if (!node || !slurGroup) {
      setSlurEndpointRects({ start: null, end: null });
      return undefined;
    }
    function measureHandles() {
      const startRects = selectionRectsForEventIds(node, session.events, [slurGroup.startId], voiceStaffIndex);
      const endRects = selectionRectsForEventIds(node, session.events, [slurGroup.endId], voiceStaffIndex);
      setSlurEndpointRects({
        start: startRects[0] || null,
        end: endRects[0] || null,
      });
    }
    measureHandles();
    const raf = requestAnimationFrame(measureHandles);
    return function() { cancelAnimationFrame(raf); };
  }, [containerRef, slurGroup, session.events, displayAbc, voiceStaffIndex]);

  useLayoutEffect(function() {
    const node = containerRef && containerRef.current;
    if (!node || !slurSnapEventId) {
      setSnapRect(null);
      return undefined;
    }
    const snapRects = selectionRectsForEventIds(node, session.events, [slurSnapEventId], voiceStaffIndex);
    setSnapRect(snapRects[0] || null);
  }, [containerRef, slurSnapEventId, session.events, displayAbc, voiceStaffIndex]);

  const hasMarquee = !!(marqueeRect
    && Math.abs(marqueeRect.right - marqueeRect.left) > 2
    && Math.abs(marqueeRect.bottom - marqueeRect.top) > 2);

  if ((!showSelection || !rects.length) && !hasMarquee && !slurGroup && !snapRect) return null;

  function handlePoint(rect, which) {
    if (!rect || typeof onSlurHandlePointerDown !== 'function') return null;
    const size = 14;
    return (
      <div
        key={'slur-handle-' + which}
        className="notation-slur-endpoint-handle"
        data-testid={'notation-slur-handle-' + which}
        data-slur-end={which}
        style={{
          left: (rect.left + rect.width / 2) + 'px',
          // Sit above the notehead so the grab target is not buried under pitch-drag.
          top: (rect.top - 4) + 'px',
          width: size + 'px',
          height: size + 'px',
          marginLeft: (-size / 2) + 'px',
          marginTop: (-size / 2) + 'px',
        }}
        onPointerDownCapture={function(e) {
          onSlurHandlePointerDown(e, which, slurGroup);
        }}
      />
    );
  }

  return (
    <div className="notation-staff-selection-layer" aria-hidden="true">
      {showSelection ? rects.map(function(rect, index) {
        return (
          <div
            key={'sel-' + index}
            className={
              'notation-staff-selection-box'
              + (showPitchTarget ? ' notation-staff-selection-box--origin-muted' : '')
            }
            data-testid="notation-staff-selection-box"
            style={{
              left: rect.left + 'px',
              top: rect.top + 'px',
              width: rect.width + 'px',
              height: rect.height + 'px',
            }}
          />
        );
      }) : null}
      {showSelection && showPitchTarget ? rects.map(function(rect, index) {
        const headW = Math.max(10, Math.min(16, rect.width * 0.7 || 14));
        const headH = Math.max(7, Math.min(12, rect.height * 0.45 || 10));
        return (
          <div
            key={'target-' + index}
            className="notation-staff-pitch-target"
            data-testid="notation-staff-pitch-target"
            style={{
              left: (rect.left + rect.width / 2) + 'px',
              top: (rect.top + rect.height * 0.55 + previewOffsetY) + 'px',
              width: headW + 'px',
              height: headH + 'px',
              marginLeft: (-headW / 2) + 'px',
              marginTop: (-headH / 2) + 'px',
            }}
          />
        );
      }) : null}
      {slurGroup ? handlePoint(slurEndpointRects.start, 'start') : null}
      {slurGroup ? handlePoint(slurEndpointRects.end, 'end') : null}
      {snapRect ? (
        <div
          className="notation-slur-snap-target"
          data-testid="notation-slur-snap-target"
          style={{
            left: (snapRect.left + snapRect.width / 2) + 'px',
            top: (snapRect.top + snapRect.height * 0.55) + 'px',
            width: '14px',
            height: '10px',
            marginLeft: '-7px',
            marginTop: '-5px',
          }}
        />
      ) : null}
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
