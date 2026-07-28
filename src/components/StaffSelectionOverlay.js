import React, { useLayoutEffect, useMemo, useState } from 'react';
import { EDITOR_MODES } from '../notation/notationConstants';
import { selectionRectsForEventIds } from '../notation/staffClickResolve';
import { staffNoteheadCentersForEventIds } from '../notation/staffCaretPosition';
import { findSlurGroupForSelection } from '../notation/notationMarks';
import { assignTimingToEvents, parseNoteLengthDecimal } from '../notation/beatGrid';

export default function StaffSelectionOverlay(props) {
  const {
    containerRef,
    session,
    displayAbc,
    voiceStaffIndex,
    dragPreview,
    marqueeRect,
    slurSnapEventId,
    onSlurHandlePointerDown,
    issueBarIndices,
  } = props;
  const [noteheadCenters, setNoteheadCenters] = useState([]);
  const [slurEndpointRects, setSlurEndpointRects] = useState({ start: null, end: null });
  const [snapRect, setSnapRect] = useState(null);
  const previewEventIds = dragPreview && Array.isArray(dragPreview.eventIds)
    ? dragPreview.eventIds
    : null;

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
    if (!showPitchTarget || !previewEventIds || !previewEventIds.length) {
      setNoteheadCenters([]);
      return undefined;
    }

    function measure() {
      const node = containerRef && containerRef.current;
      if (!node) {
        setNoteheadCenters([]);
        return;
      }
      setNoteheadCenters(staffNoteheadCentersForEventIds(
        node,
        session.events,
        previewEventIds,
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
    showPitchTarget,
    previewEventIds,
    containerRef,
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

  const [issueBarRects, setIssueBarRects] = useState([]);

  useLayoutEffect(function() {
    const node = containerRef && containerRef.current;
    const bars = Array.isArray(issueBarIndices) ? issueBarIndices : [];
    if (!node || !bars.length || !session || !session.events) {
      setIssueBarRects([]);
      return undefined;
    }
    const unit = parseNoteLengthDecimal(session.tuneMeta && session.tuneMeta.noteLength, session.tuneMeta && session.tuneMeta.meter);
    const meter = session.tuneMeta && session.tuneMeta.meter;
    const timed = assignTimingToEvents(session.events, meter, unit);
    function measureIssues() {
      const rects = [];
      bars.forEach(function(barIndex) {
        const ev = timed.find(function(item) {
          return typeof item.measureIndex === 'number' && item.measureIndex + 1 === barIndex;
        });
        if (!ev) return;
        const found = selectionRectsForEventIds(node, session.events, [ev.id], voiceStaffIndex);
        if (found[0]) rects.push({ barIndex: barIndex, rect: found[0] });
      });
      setIssueBarRects(rects);
    }
    measureIssues();
    const raf = requestAnimationFrame(measureIssues);
    return function() { cancelAnimationFrame(raf); };
  }, [containerRef, issueBarIndices, session.events, session.tuneMeta, displayAbc, voiceStaffIndex]);

  const showIssueBars = issueBarRects.length > 0;

  const hasMarquee = !!(marqueeRect
    && Math.abs(marqueeRect.right - marqueeRect.left) > 2
    && Math.abs(marqueeRect.bottom - marqueeRect.top) > 2);

  if (!showPitchTarget && !hasMarquee && !slurGroup && !snapRect && !showIssueBars) return null;

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

  const pitchTargets = showPitchTarget
    ? noteheadCenters.map(function(c) {
      return { left: c.x, top: c.y + previewOffsetY };
    })
    : [];

  return (
    <div className="notation-staff-selection-layer" aria-hidden="true">
      {pitchTargets.map(function(pt, index) {
        const headW = 14;
        const headH = 10;
        return (
          <div
            key={'target-' + index}
            className="notation-staff-pitch-target"
            data-testid="notation-staff-pitch-target"
            style={{
              left: pt.left + 'px',
              top: pt.top + 'px',
              width: headW + 'px',
              height: headH + 'px',
              marginLeft: (-headW / 2) + 'px',
              marginTop: (-headH / 2) + 'px',
            }}
          />
        );
      })}
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
      {issueBarRects.map(function(item) {
        const rect = item.rect;
        return (
          <div
            key={'issue-bar-' + item.barIndex}
            className="notation-staff-issue-bar"
            data-testid="notation-staff-issue-bar"
            style={{
              left: rect.left + 'px',
              top: rect.top + 'px',
              width: Math.max(rect.width, 24) + 'px',
              height: rect.height + 'px',
            }}
          />
        );
      })}
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
