import React, { useLayoutEffect, useState } from 'react';
import { fingeringLabelFromEvent, fingeringNeedsStaffOverlay } from '../notation/notationMarks';
import { selectionRectsForEventIds } from '../notation/staffClickResolve';

/**
 * Renders arbitrary fingering / text labels above notes. abcjs only draws digits 0–5.
 */
export default function NotationFingeringLabelsOverlay(props) {
  const { containerRef, session, voiceStaffIndex, displayAbc } = props;
  const [labels, setLabels] = useState([]);

  useLayoutEffect(function() {
    const wrap = containerRef && containerRef.current;
    const events = session && session.events ? session.events : [];
    if (!wrap || !events.length) {
      setLabels([]);
      return undefined;
    }

    function measure() {
      const next = [];
      events.forEach(function(ev) {
        if (ev.type !== 'note' && ev.type !== 'chord') return;
        const text = fingeringLabelFromEvent(ev);
        if (!fingeringNeedsStaffOverlay(text)) return;
        const rects = selectionRectsForEventIds(wrap, events, [ev.id], voiceStaffIndex);
        if (!rects || !rects[0]) return;
        const rect = rects[0];
        next.push({
          id: ev.id,
          text: text,
          left: rect.left + rect.width * 0.5,
          top: Math.max(0, rect.top - 4),
        });
      });
      setLabels(next);
    }

    measure();
    const raf = requestAnimationFrame(measure);
    let observer = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(wrap);
    }
    window.addEventListener('resize', measure);
    return function() {
      cancelAnimationFrame(raf);
      if (observer) observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [containerRef, session.events, session.selection, voiceStaffIndex, displayAbc]);

  if (!labels.length) return null;

  return (
    <div className="notation-fingering-labels-overlay" aria-hidden="true">
      {labels.map(function(item) {
        return (
          <span
            key={item.id}
            className="notation-fingering-label"
            data-testid="notation-fingering-label"
            style={{
              left: item.left + 'px',
              top: item.top + 'px',
            }}
          >
            {item.text}
          </span>
        );
      })}
    </div>
  );
}
