import React, { useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react';
import PianoRollPianoKeys from './PianoRollPianoKeys';
import PianoRollRuler from './PianoRollRuler';
import DualEndedSlider from './DualEndedSlider';
import { beatToX, xToBeat, midiToY, DEFAULT_BEAT_WIDTH, DEFAULT_ROW_HEIGHT } from '../notation/pianoRollGeometry';

const KEYS_WIDTH = 44;
const MIN_BEAT_WIDTH = 4;
const MAX_BEAT_WIDTH = 120;
const MIN_ROW_HEIGHT = 4;
const MAX_ROW_HEIGHT = 28;
const ZOOM_STEP = 1.5;
const WHEEL_ZOOM_FACTOR = 1.06;
const FOOTER_RESERVE_PX = 56;

function buildPitchRange(noteGroups) {
  const midis = [];
  (noteGroups || []).forEach(function(group) {
    (group.notes || []).concat(group.excludedNotes || []).forEach(function(n) {
      midis.push(n.midi);
    });
  });
  if (!midis.length) return { min: 48, max: 72 };
  return {
    min: Math.max(0, Math.min.apply(null, midis) - 1),
    max: Math.min(127, Math.max.apply(null, midis) + 1),
  };
}

function noteRects(notes, pitchRange, beatWidth, rowHeight, tempoBpm, color, ghost) {
  const beatDuration = 60 / Math.max(tempoBpm || 120, 1);
  return (notes || []).map(function(note, index) {
    const startBeat = note.start / beatDuration;
    const endBeat = note.end / beatDuration;
    const width = Math.max(3, beatToX(Math.max(0.125, endBeat - startBeat), beatWidth));
    const x = beatToX(startBeat, beatWidth);
    const y = midiToY(note.midi, pitchRange, rowHeight);
    return (
      <rect
        key={(ghost ? 'g' : 'n') + index}
        x={x}
        y={y + 1}
        width={width}
        height={Math.max(2, rowHeight - 2)}
        fill={ghost ? '#bbb' : color}
        opacity={ghost ? 0.35 : 0.88}
        rx={1}
      />
    );
  });
}

function slotToBarPulse(slot, pulsesPerBar) {
  const safe = Math.max(0, slot);
  return {
    bar: Math.floor(safe / pulsesPerBar),
    pulse: safe % pulsesPerBar,
  };
}

const MidiImportMultiPianoRoll = forwardRef(function MidiImportMultiPianoRoll(props, ref) {
  const session = props.session;
  const scrollRef = useRef(null);
  const [dragAnacrusis, setDragAnacrusis] = useState(null);
  const [cursorBeat, setCursorBeat] = useState(null);

  const zoom = session.previewZoom || { beatWidth: DEFAULT_BEAT_WIDTH, rowHeight: DEFAULT_ROW_HEIGHT };
  const beatWidth = zoom.beatWidth || DEFAULT_BEAT_WIDTH;
  const rowHeight = zoom.rowHeight || DEFAULT_ROW_HEIGHT;
  const gridSlots = Math.max(1, session.previewSnapSlotsPerBeat || 4);
  const anacrusisBeats = session.anacrusisBeats || 0;
  const selectedVoice = (session.voices || []).find(function(v) {
    return v.id === session.selectedVoiceId;
  }) || (session.voices || []).find(function(v) { return v.enabled; }) || (session.voices || [])[0];
  const filters = (selectedVoice && selectedVoice.filters) || {};

  const groups = useMemo(function() {
    const voices = props.processedVoices || [];
    return voices.map(function(voice) {
      const voiceFilters = voice.filters || {};
      const showGhosts = voiceFilters.showOnlyPassing !== false;
      return {
        color: voice.color,
        notes: voice.notes || [],
        excludedNotes: showGhosts ? (voice.excludedNotes || []) : [],
        tempoBpm: (voice.grid && voice.grid.tempoBpm) || 120,
        meter: (voice.grid && voice.grid.timeSignature) || '4/4',
      };
    });
  }, [props.processedVoices]);

  const pitchRange = useMemo(function() { return buildPitchRange(groups); }, [groups]);

  const tempoBpm = (session.sharedGrid && session.sharedGrid.tempoBpm)
    || (groups[0] && groups[0].tempoBpm)
    || 120;
  const meter = (session.sharedGrid && session.sharedGrid.timeSignature)
    || (groups[0] && groups[0].meter)
    || '4/4';
  const beatsPerBar = parseInt(String(meter).split('/')[0], 10) || 4;
  const beatDuration = 60 / Math.max(tempoBpm, 1);
  let maxEndBeat = 4;
  groups.forEach(function(g) {
    g.notes.concat(g.excludedNotes).forEach(function(n) {
      maxEndBeat = Math.max(maxEndBeat, n.end / beatDuration);
    });
  });
  maxEndBeat = Math.max(maxEndBeat, anacrusisBeats + beatsPerBar);
  const numBarsFilter = filters.endBar != null && filters.endBar < 9999 ? filters.endBar : null;
  const numBars = Math.max(1, Math.ceil((maxEndBeat - anacrusisBeats) / beatsPerBar), (numBarsFilter || 0) + 1);
  const totalBeats = anacrusisBeats + numBars * beatsPerBar;
  const width = beatToX(totalBeats, beatWidth);
  const height = (pitchRange.max - pitchRange.min + 1) * rowHeight;
  const gridBeat = 1 / gridSlots;
  const pulsesPerBar = beatsPerBar * gridSlots;
  const totalSlots = numBars * pulsesPerBar;
  const measuredBarsWidth = beatToX(numBars * beatsPerBar, beatWidth);
  const anacrusisOffsetPx = beatToX(anacrusisBeats, beatWidth);

  const startSlot = Math.max(
    0,
    Math.min(
      totalSlots - 1,
      (filters.startBar || 0) * pulsesPerBar + (filters.startPulse || 0)
    )
  );
  let endSlot;
  if (filters.endBar == null || filters.endBar >= 9999) {
    endSlot = totalSlots - 1;
  } else {
    const endPulse = filters.endPulse != null && filters.endPulse < 9999
      ? filters.endPulse
      : pulsesPerBar - 1;
    endSlot = Math.max(
      startSlot,
      Math.min(totalSlots - 1, filters.endBar * pulsesPerBar + endPulse)
    );
  }
  const rangeX = beatToX(anacrusisBeats + startSlot / gridSlots, beatWidth);
  const rangeW = Math.max(2, beatToX((endSlot - startSlot + 1) / gridSlots, beatWidth));

  function setZoom(patch) {
    if (props.onZoomChange) props.onZoomChange(Object.assign({}, zoom, patch));
  }

  function clampBeatWidth(v) {
    return Math.max(MIN_BEAT_WIDTH, Math.min(MAX_BEAT_WIDTH, v));
  }

  function clampRowHeight(v) {
    return Math.max(MIN_ROW_HEIGHT, Math.min(MAX_ROW_HEIGHT, v));
  }

  function fitToView() {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const footerEl = document.querySelector('.midi-import-footer-toolbar');
    const transportEl = document.querySelector('.now-playing-transport-bar');
    const footerH = footerEl ? footerEl.getBoundingClientRect().height : FOOTER_RESERVE_PX;
    const transportH = transportEl ? transportEl.getBoundingClientRect().height : 0;
    const availW = Math.max(120, el.clientWidth - KEYS_WIDTH - 8);
    // Viewport space below the pane top, minus footer toolbar + mini player.
    // Measure real chrome heights so Fit stays stable (not content-driven).
    const availH = Math.max(
      120,
      window.innerHeight - rect.top - footerH - transportH - 8
    );
    const rows = pitchRange.max - pitchRange.min + 1;
    const fitBeatWidth = clampBeatWidth((availW - 12) / Math.max(totalBeats, 1));
    const fitRowHeight = clampRowHeight((availH - 40) / Math.max(rows, 1));
    setZoom({ beatWidth: fitBeatWidth, rowHeight: fitRowHeight });
  }


  function scrollToKeepBeat(beat, nextBeatWidth) {
    const el = scrollRef.current;
    if (!el || beat == null || !isFinite(beat)) return;
    const oldX = beatToX(beat, beatWidth) + KEYS_WIDTH;
    const newX = beatToX(beat, nextBeatWidth) + KEYS_WIDTH;
    const viewportX = oldX - el.scrollLeft;
    requestAnimationFrame(function() {
      if (!scrollRef.current) return;
      scrollRef.current.scrollLeft = Math.max(0, newX - viewportX);
    });
  }

  function centerOnBeat(beat, nextBeatWidth) {
    const el = scrollRef.current;
    if (!el || beat == null || !isFinite(beat)) return;
    const widthForBeat = nextBeatWidth != null ? nextBeatWidth : beatWidth;
    const x = beatToX(beat, widthForBeat) + KEYS_WIDTH;
    requestAnimationFrame(function() {
      if (!scrollRef.current) return;
      const scroller = scrollRef.current;
      scroller.scrollLeft = Math.max(0, x - scroller.clientWidth / 2);
    });
  }

  function applyBeatWidthZoom(nextBeatWidth, anchorBeat) {
    const clamped = clampBeatWidth(nextBeatWidth);
    const focusBeat = anchorBeat != null ? anchorBeat : cursorBeat;
    setZoom({ beatWidth: clamped });
    if (focusBeat != null) {
      centerOnBeat(focusBeat, clamped);
    }
  }

  useImperativeHandle(ref, function() {
    return {
      fitToView: fitToView,
      zoomBy: function(factor) {
        applyBeatWidthZoom(beatWidth * factor, cursorBeat);
      },
      nudgeBeatWidth: function(delta) {
        applyBeatWidthZoom(beatWidth + delta, cursorBeat);
      },
      nudgeRowHeight: function(delta) {
        setZoom({ rowHeight: clampRowHeight(rowHeight + delta) });
      },
    };
  }, [beatWidth, rowHeight, totalBeats, pitchRange.min, pitchRange.max, cursorBeat]);

  function onSlotRangeChange(lo, hi) {
    const start = slotToBarPulse(Math.min(lo, hi), pulsesPerBar);
    const end = slotToBarPulse(Math.max(lo, hi), pulsesPerBar);
    if (props.onFiltersChange) {
      props.onFiltersChange({
        positionEnabled: true,
        startBar: start.bar,
        startPulse: start.pulse,
        endBar: end.bar,
        endPulse: end.pulse,
      });
    }
  }

  function handleAnacrusisPointerDown(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragAnacrusis({ startX: e.clientX, startBeats: anacrusisBeats });
  }

  function handleAnacrusisPointerMove(e) {
    if (!dragAnacrusis) return;
    const deltaBeats = (e.clientX - dragAnacrusis.startX) / beatWidth;
    const next = Math.max(0, Math.min(beatsPerBar * 2, dragAnacrusis.startBeats + deltaBeats));
    // Snap anacrusis drag to the current grid.
    const snapped = Math.round(next * gridSlots) / gridSlots;
    if (props.onAnacrusisChange) props.onAnacrusisChange(snapped);
  }

  function handleAnacrusisPointerUp() {
    setDragAnacrusis(null);
  }


  function handleRollClick(e) {
    if (dragAnacrusis) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const beat = Math.max(0, Math.min(totalBeats, xToBeat(x, beatWidth)));
    // Snap cursor to current grid
    const snapped = Math.round(beat * gridSlots) / gridSlots;
    setCursorBeat(snapped);
  }

  function handleWheel(e) {
    // Vertical wheel / trackpad → horizontal zoom. Shift+wheel keeps native horizontal scroll.
    if (e.shiftKey) return;
    if (Math.abs(e.deltaY) < 0.5) return;
    e.preventDefault();
    const el = scrollRef.current;
    const factor = e.deltaY < 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR;
    let anchor = cursorBeat;
    if (anchor == null && el) {
      const rect = el.getBoundingClientRect();
      const xInContent = e.clientX - rect.left + el.scrollLeft - KEYS_WIDTH;
      anchor = Math.max(0, xToBeat(xInContent, beatWidth));
    }
    applyBeatWidthZoom(beatWidth * factor, anchor);
  }

  useEffect(function() {
    const el = scrollRef.current;
    if (!el) return undefined;
    function onWheel(e) {
      handleWheel(e);
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return function() {
      el.removeEventListener('wheel', onWheel);
    };
  });


  const barLines = [];
  for (let b = 0; b <= numBars; b += 1) {
    barLines.push(anacrusisBeats + b * beatsPerBar);
  }

  const gridLines = [];
  for (let beat = 0; beat <= totalBeats + 0.0001; beat += gridBeat) {
    gridLines.push(beat);
  }

  function formatSlot(slot) {
    const bp = slotToBarPulse(slot, pulsesPerBar);
    return (bp.bar + 1) + '.' + bp.pulse;
  }

  return (
    <div className="midi-import-multi-roll">
      <div
        className="midi-cleanup-pane-scroll midi-import-roll-scroll"
        ref={scrollRef}
        onPointerMove={handleAnacrusisPointerMove}
        onPointerUp={handleAnacrusisPointerUp}
        onPointerLeave={handleAnacrusisPointerUp}
       
      >
        <div className="midi-cleanup-pane-inner" style={{ width: width + KEYS_WIDTH }}>
          <div
            className="midi-import-bar-range-aligned"
            style={{ marginLeft: KEYS_WIDTH + anacrusisOffsetPx, width: measuredBarsWidth }}
            title="Import range (grid slots)"
          >
            <DualEndedSlider
              min={0}
              max={Math.max(1, totalSlots - 1)}
              low={startSlot}
              high={endSlot}
              hideLabels={false}
              formatLow={formatSlot}
              formatHigh={formatSlot}
              onChange={onSlotRangeChange}
            />
          </div>
          <div style={{ marginLeft: KEYS_WIDTH }}>
            <PianoRollRuler
              width={width}
              beatsPerBar={beatsPerBar}
              beatWidth={beatWidth}
              numBars={numBars}
              anacrusisBeats={anacrusisBeats}
            />
          </div>
          <div className="d-flex">
            <PianoRollPianoKeys pitchRange={pitchRange} rowHeight={rowHeight} height={height} />
            <svg width={width} height={height} className="midi-cleanup-roll-svg" onClick={handleRollClick} style={{ cursor: 'crosshair' }}>
              <rect x={rangeX} y={0} width={rangeW} height={height} className="midi-import-bar-range-fill" />
              {gridLines.map(function(beat, i) {
                const x = beatToX(beat, beatWidth);
                const rel = beat - anacrusisBeats;
                const isBar = rel >= -0.0001 && Math.abs(rel % beatsPerBar) < gridBeat * 0.5;
                return (
                  <line
                    key={'grid-' + i}
                    x1={x}
                    y1={0}
                    x2={x}
                    y2={height}
                    className={isBar ? 'midi-import-grid-bar' : 'midi-import-grid-sub'}
                  />
                );
              })}
              {groups.map(function(g, gi) {
                return (
                  <g key={'voice-' + gi}>
                    {noteRects(g.excludedNotes, pitchRange, beatWidth, rowHeight, g.tempoBpm, g.color, true)}
                    {noteRects(g.notes, pitchRange, beatWidth, rowHeight, g.tempoBpm, g.color, false)}
                  </g>
                );
              })}
              {barLines.map(function(beat, i) {
                const x = beatToX(beat, beatWidth);
                const isDownbeat = i === 0;
                return (
                  <line
                    key={'bar-' + i}
                    x1={x}
                    y1={0}
                    x2={x}
                    y2={height}
                    className={isDownbeat ? 'midi-import-anacrusis-handle' : 'midi-import-barline'}
                    onPointerDown={isDownbeat ? handleAnacrusisPointerDown : undefined}
                  />
                );
              })}

              {cursorBeat != null ? (
                <line
                  x1={beatToX(cursorBeat, beatWidth)}
                  y1={0}
                  x2={beatToX(cursorBeat, beatWidth)}
                  y2={height}
                  className="midi-import-cursor-line"
                />
              ) : null}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
});

export default MidiImportMultiPianoRoll;
