import React, { useLayoutEffect, useState } from 'react';
import { isSectionMarkerChordName } from '../chordSheetUtils';
import { sectionDisplayTitle } from '../lyricStructureUtils';
import { selectionRectsForEventIds } from '../notation/staffClickResolve';

/**
 * Section title labels above staff strains (replaces section-marker chord glyphs in display ABC).
 */
export default function NotationSectionLabelsOverlay(props) {
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
      const seenStrain = Object.create(null);
      events.forEach(function(ev) {
        if (ev.type !== 'note' && ev.type !== 'chord') return;
        const symbols = Array.isArray(ev.chordSymbols) ? ev.chordSymbols : [];
        const marker = symbols.find(function(name) {
          return isSectionMarkerChordName(name);
        });
        if (!marker) return;
        const strainKey = ev.strainIndex != null ? String(ev.strainIndex) : '0';
        if (seenStrain[strainKey]) return;
        seenStrain[strainKey] = true;
        const title = sectionDisplayTitle({ header: marker, lines: [] });
        const rects = selectionRectsForEventIds(wrap, events, [ev.id], voiceStaffIndex);
        if (!rects || !rects[0]) return;
        const rect = rects[0];
        next.push({
          id: ev.id,
          text: title || marker,
          left: rect.left + rect.width * 0.5,
          top: Math.max(0, rect.top - 18),
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
  }, [containerRef, session.events, voiceStaffIndex, displayAbc]);

  if (!labels.length) return null;

  return (
    <div className="notation-section-labels-overlay" aria-hidden="true">
      {labels.map(function(item) {
        return (
          <span
            key={item.id}
            className="notation-section-label"
            data-testid="notation-section-label"
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
