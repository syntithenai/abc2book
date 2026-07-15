import React, { useCallback, useMemo, useRef, useState } from 'react';
import { beatsPerBarFromMeter } from '../notation/beatGrid';
import { cloneVoiceEvent, pitchToMidi } from '../notation/voiceEventModel';
import {
  resizeEventDuration,
  insertNoteAtBeat,
  deleteEventById,
  eventDurationBeats,
} from '../notation/pianoRollEdit';
import { moveNoteTiming, moveNotePitch, splitEventAtBeat } from '../notation/timingEdit';
import { PIANO_ROLL_TOOLS } from '../notation/notationConstants';
import {
  beatToX,
  xToBeat,
  midiToY,
  yToMidi,
  DEFAULT_BEAT_WIDTH,
  DEFAULT_ROW_HEIGHT,
} from '../notation/pianoRollGeometry';
import { marqueeSelect, nudgeSelection, duplicateSelection } from '../notation/pianoRollSelection';
import { usePianoRollMediaSync } from '../hooks/usePianoRollMediaSync';
import { useWaveformPeaks } from '../hooks/useWaveformPeaks';
import { useNoteAudition } from '../hooks/useNoteAudition';
import PianoRollToolbar from './PianoRollToolbar';
import PianoRollRuler from './PianoRollRuler';
import PianoRollPianoKeys from './PianoRollPianoKeys';
import PianoRollWaveform, { waveformHeight } from './PianoRollWaveform';
import PianoRollPlayhead from './PianoRollPlayhead';
import PianoRollPlaybackRegion from './PianoRollPlaybackRegion';
import './PianoRollEditor.css';

export default function PianoRollEditor(props) {
  const {
    session,
    tuneMeta,
    tune,
    mediaController,
    onChange,
    onSelect,
    onFlushCommit,
    backgroundEvents,
    onAlignAction,
    onQuantize,
    dispatch,
  } = props;

  const svgRef = useRef(null);
  const workspaceRef = useRef(null);
  const [drag, setDrag] = useState(null);
  const [previewEvents, setPreviewEvents] = useState(null);
  const [marquee, setMarquee] = useState(null);

  const zoom = session.pianoRollZoom || { beatWidth: DEFAULT_BEAT_WIDTH, rowHeight: DEFAULT_ROW_HEIGHT };
  const beatWidth = zoom.beatWidth || DEFAULT_BEAT_WIDTH;
  const rowHeight = zoom.rowHeight || DEFAULT_ROW_HEIGHT;
  const tool = session.pianoRollTool || PIANO_ROLL_TOOLS.SELECT;

  const beatTimes = null;

  const linkStartAt = mediaController && mediaController.getLinkStartAt
    ? mediaController.getLinkStartAt()
    : 0;
  const linkEndAt = mediaController && mediaController.getLinkEndAt
    ? mediaController.getLinkEndAt()
    : null;

  const mediaSync = usePianoRollMediaSync({
    mediaController: mediaController,
    beatTimes: beatTimes,
    tempo: tuneMeta.tempo,
    linkStartAt: linkStartAt,
    linkEndAt: linkEndAt,
    enabled: !!mediaController,
  });

  const activeLink = tune && tune.links && mediaController && typeof mediaController.mediaLinkNumber === 'number'
    ? tune.links[mediaController.mediaLinkNumber]
    : null;
  const waveformUrl = activeLink && activeLink.url ? activeLink.url : null;
  const waveform = useWaveformPeaks(waveformUrl, !!session.pianoRollShowWaveform && !!waveformUrl);
  const { auditionMidi } = useNoteAudition();

  const activeEvents = previewEvents || session.events;

  const noteEvents = useMemo(function() {
    return activeEvents.filter(function(ev) {
      return ev.type === 'note' || ev.type === 'chord';
    });
  }, [activeEvents]);

  const restEvents = useMemo(function() {
    return activeEvents.filter(function(ev) { return ev.type === 'rest'; });
  }, [activeEvents]);

  const backgroundNoteEvents = useMemo(function() {
    return (backgroundEvents || []).filter(function(ev) {
      return ev.type === 'note' || ev.type === 'chord';
    });
  }, [backgroundEvents]);

  const pitchRange = useMemo(function() {
    let min = 60;
    let max = 72;
    function scanEvents(events) {
      events.forEach(function(ev) {
        (ev.pitches || (ev.pitch ? [ev.pitch] : [])).forEach(function(p) {
          const midi = pitchToMidi(p);
          if (midi != null) {
            min = Math.min(min, midi);
            max = Math.max(max, midi);
          }
        });
      });
    }
    scanEvents(noteEvents);
    scanEvents(backgroundNoteEvents);
    return { min: min - 2, max: max + 2 };
  }, [noteEvents, backgroundNoteEvents]);

  const beatsPerBar = beatsPerBarFromMeter(tuneMeta.meter);
  const gridSlots = session.snapSlotsPerBeat || 4;
  const gridBeat = 1 / gridSlots;
  const wfHeight = session.pianoRollShowWaveform ? waveformHeight() : 0;

  const numBars = Math.max(4, Math.ceil(Math.max(
    noteEvents[noteEvents.length - 1]?.startBeat || 0,
    backgroundNoteEvents[backgroundNoteEvents.length - 1]?.startBeat || 0,
    mediaSync.playheadBeat || 0
  ) / beatsPerBar) + 1);

  const width = numBars * beatsPerBar * beatWidth;
  const height = (pitchRange.max - pitchRange.min + 1) * rowHeight;

  function snapBeat(beat) {
    if (!session.snapEnabled) return beat;
    const grid = 1 / (session.snapSlotsPerBeat || 4);
    return Math.round(beat / grid) * grid;
  }

  function clientToSvg(e) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    return pt.matrixTransform(ctm.inverse());
  }

  function commitEvents(events, caretIndex, label) {
    setPreviewEvents(null);
    onChange(events, caretIndex, { historyLabel: label });
  }

  function finishDrag(events) {
    if (events) commitEvents(events, session.caretIndex, drag && drag.historyLabel ? drag.historyLabel : 'Piano roll edit');
    if (onFlushCommit) onFlushCommit();
    setDrag(null);
  }

  function handlePointerDown(e, ev, toneIndex, mode) {
    e.preventDefault();
    e.stopPropagation();

    if (tool === PIANO_ROLL_TOOLS.ERASE) {
      commitEvents(deleteEventById(session.events, ev.id, tuneMeta), session.caretIndex, 'Erase note');
      return;
    }
    if (tool === PIANO_ROLL_TOOLS.SPLIT) {
      const pt = clientToSvg(e);
      const splitBeat = snapBeat(Math.max(0, xToBeat(pt.x, beatWidth)));
      commitEvents(splitEventAtBeat(session.events, ev.id, splitBeat, tuneMeta), session.caretIndex, 'Split note');
      return;
    }

    if (mode === 'resize-start' || mode === 'resize-end') {
      setDrag({
        mode: mode,
        eventId: ev.id,
        startX: e.clientX,
        origBeat: ev.startBeat || 0,
        origDuration: eventDurationBeats(ev, tuneMeta),
        historyLabel: 'Resize note',
      });
      setPreviewEvents(session.events.map(cloneVoiceEvent));
      return;
    }

    const midi = pitchToMidi((ev.pitches || [ev.pitch])[toneIndex]);
    if (onSelect) onSelect(ev.id);
    if (midi != null) auditionMidi(midi);
    setDrag({
      mode: e.ctrlKey ? 'duplicate' : 'move',
      eventId: ev.id,
      toneIndex: toneIndex,
      startX: e.clientX,
      startY: e.clientY,
      origBeat: ev.startBeat || 0,
      origMidi: midi,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      historyLabel: e.ctrlKey ? 'Duplicate note' : 'Move note',
    });
    setPreviewEvents(session.events.map(cloneVoiceEvent));
  }

  function handleBackgroundPointerDown(e) {
    if (e.target !== e.currentTarget && e.target.getAttribute('fill') !== 'transparent') return;
    const pt = clientToSvg(e);

    if (tool === PIANO_ROLL_TOOLS.SELECT && e.button === 0) {
      setMarquee({ startX: pt.x, startY: pt.y, x: pt.x, y: pt.y, width: 0, height: 0 });
      return;
    }

    if (tool !== PIANO_ROLL_TOOLS.DRAW && tool !== PIANO_ROLL_TOOLS.SELECT) return;

    const beat = snapBeat(Math.max(0, xToBeat(pt.x, beatWidth)));
    const midi = yToMidi(pt.y, pitchRange, rowHeight);
    auditionMidi(midi);
    const result = insertNoteAtBeat(session.events, beat, midi, session, tuneMeta);
    commitEvents(result.events, result.caretIndex, 'Insert note');
  }

  function applyDragMove(e) {
    if (!drag || !previewEvents) return null;
    let next = session.events.map(cloneVoiceEvent);

    if (drag.mode === 'resize-end') {
      const dx = e.clientX - drag.startX;
      const beatDelta = dx / beatWidth;
      const newDur = Math.max(0.125, drag.origDuration + beatDelta);
      next = resizeEventDuration(session.events, drag.eventId, newDur, tuneMeta);
      setPreviewEvents(next);
      return next;
    }

    if (drag.mode === 'resize-start') {
      const dx = e.clientX - drag.startX;
      const beatDelta = dx / beatWidth;
      const newStart = snapBeat(Math.max(0, drag.origBeat + beatDelta));
      const newDur = Math.max(0.125, drag.origDuration - beatDelta);
      next = moveNoteTiming(session.events, drag.eventId, newStart, tuneMeta);
      next = resizeEventDuration(next, drag.eventId, newDur, tuneMeta);
      setPreviewEvents(next);
      return next;
    }

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const lockHorizontal = drag.shiftKey || e.shiftKey;
    const lockVertical = drag.altKey || e.altKey;

    let targetBeat = drag.origBeat;
    if (!lockVertical) {
      targetBeat = snapBeat(Math.max(0, drag.origBeat + dx / beatWidth));
    }

    next = moveNoteTiming(session.events, drag.eventId, targetBeat, tuneMeta);

    if (!lockHorizontal) {
      const semitones = Math.round(-dy / rowHeight);
      if (semitones !== 0) {
        next = moveNotePitch(next, drag.eventId, drag.toneIndex, drag.origMidi + semitones, tuneMeta);
      }
    }

    setPreviewEvents(next);
    return next;
  }

  function handlePointerMove(e) {
    if (marquee) {
      const pt = clientToSvg(e);
      setMarquee({
        startX: marquee.startX,
        startY: marquee.startY,
        x: Math.min(marquee.startX, pt.x),
        y: Math.min(marquee.startY, pt.y),
        width: Math.abs(pt.x - marquee.startX),
        height: Math.abs(pt.y - marquee.startY),
      });
      return;
    }
    applyDragMove(e);
  }

  function handlePointerUp(e) {
    if (marquee) {
      const ids = marqueeSelect(noteEvents, marquee, pitchRange, rowHeight, beatWidth);
      if (ids.length && onSelect) {
        onSelect(ids[0], { eventIds: ids });
      }
      setMarquee(null);
      return;
    }
    if (drag && previewEvents) {
      let finalEvents = previewEvents;
      if (drag.mode === 'duplicate') {
        finalEvents = duplicateSelection(session.events, [drag.eventId], 0.25, tuneMeta);
      }
      finishDrag(finalEvents);
      return;
    }
    setDrag(null);
  }

  function handleKeyDown(e) {
    const ids = session.selection.eventIds || [];
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (!ids.length) return;
      e.preventDefault();
      const grid = 1 / (session.snapSlotsPerBeat || 4);
      let deltaBeat = 0;
      let deltaMidi = 0;
      if (e.key === 'ArrowLeft') deltaBeat = -grid;
      if (e.key === 'ArrowRight') deltaBeat = grid;
      if (e.key === 'ArrowUp') deltaMidi = 1;
      if (e.key === 'ArrowDown') deltaMidi = -1;
      const next = nudgeSelection(session.events, ids, deltaBeat, deltaMidi, tuneMeta, session.selection.toneIndex);
      commitEvents(next, session.caretIndex, 'Nudge notes');
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && ids.length) {
      e.preventDefault();
      let next = session.events;
      ids.forEach(function(id) {
        next = deleteEventById(next, id, tuneMeta);
      });
      commitEvents(next, session.caretIndex, 'Delete notes');
    }
  }

  const renderNoteLayer = useCallback(function(events, className, interactive) {
    return events.map(function(ev) {
      const midis = (ev.pitches || [ev.pitch]).map(function(p) { return pitchToMidi(p); }).filter(function(m) { return m != null; });
      const x = beatToX(ev.startBeat || 0, beatWidth);
      const w = Math.max(8, beatToX(eventDurationBeats(ev, tuneMeta), beatWidth));
      return midis.map(function(midi, ti) {
        const y = midiToY(midi, pitchRange, rowHeight);
        const selected = session.selection.eventIds.indexOf(ev.id) >= 0;
        return (
          <g key={ev.id + '-' + ti + '-' + className}>
            <rect
              className={'piano-roll-note ' + className + (selected ? ' selected' : '')}
              x={x}
              y={y}
              width={w}
              height={rowHeight - 2}
              rx={3}
              onPointerDown={interactive ? function(e) { handlePointerDown(e, ev, ti, 'move'); } : undefined}
            />
            {interactive ? (
              <g>
                <rect
                  className="piano-roll-resize-handle piano-roll-resize-start"
                  x={x}
                  y={y}
                  width={4}
                  height={rowHeight - 2}
                  onPointerDown={function(e) { handlePointerDown(e, ev, ti, 'resize-start'); }}
                />
                <rect
                  className="piano-roll-resize-handle piano-roll-resize-end"
                  x={x + w - 4}
                  y={y}
                  width={4}
                  height={rowHeight - 2}
                  onPointerDown={function(e) { handlePointerDown(e, ev, ti, 'resize-end'); }}
                />
              </g>
            ) : null}
          </g>
        );
      });
    });
  }, [beatWidth, pitchRange, rowHeight, session.selection.eventIds, tuneMeta, tool]);

  return (
    <div className="piano-roll-editor-root">
      {dispatch ? (
        <PianoRollToolbar
          session={session}
          dispatch={dispatch}
          onQuantize={onQuantize}
          onAlignAction={onAlignAction}
        />
      ) : null}
      <div className="piano-roll-workspace" ref={workspaceRef} tabIndex={0} onKeyDown={handleKeyDown}>
        <div className="piano-roll-sticky-header">
          <div className="piano-roll-keys-spacer" />
          <PianoRollRuler
            width={width}
            beatsPerBar={beatsPerBar}
            beatWidth={beatWidth}
            numBars={numBars}
            onSeekBeat={mediaSync.seekToBeat}
          />
        </div>
        <div className="piano-roll-body">
          <div className="piano-roll-keys-sticky">
            <div style={{ height: wfHeight }} />
            <PianoRollPianoKeys
              pitchRange={pitchRange}
              rowHeight={rowHeight}
              height={height}
              onAuditionMidi={auditionMidi}
            />
          </div>
          <div className="piano-roll-canvas-wrap">
            <svg
              ref={svgRef}
              className="piano-roll-editor"
              data-testid="piano-roll-canvas"
              width={width}
              height={height + wfHeight}
              viewBox={'0 0 ' + width + ' ' + (height + wfHeight)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              {session.pianoRollShowWaveform ? (
                <g transform={'translate(0,' + wfHeight + ')'}>
                  <PianoRollWaveform
                    peaks={waveform.peaks}
                    width={width}
                    height={wfHeight}
                    durationSeconds={waveform.durationSeconds}
                    beatTimes={beatTimes}
                    tempo={tuneMeta.tempo}
                    beatWidth={beatWidth}
                  />
                </g>
              ) : null}
              <g transform={'translate(0,' + wfHeight + ')'}>
                <rect
                  x={0}
                  y={0}
                  width={width}
                  height={height}
                  fill="transparent"
                  onPointerDown={handleBackgroundPointerDown}
                />
                {Array.from({ length: Math.floor(numBars * beatsPerBar / gridBeat) + 1 }).map(function(_, i) {
                  const x = i * gridBeat * beatWidth;
                  return <line key={'grid-' + i} x1={x} y1={0} x2={x} y2={height} className="piano-roll-gridline" />;
                })}
                {Array.from({ length: numBars + 1 }).map(function(_, i) {
                  const x = i * beatsPerBar * beatWidth;
                  return <line key={'bar-' + i} x1={x} y1={0} x2={x} y2={height} className="piano-roll-barline" />;
                })}
                {restEvents.map(function(ev) {
                  const x = beatToX(ev.startBeat || 0, beatWidth);
                  const w = Math.max(4, beatToX(eventDurationBeats(ev, tuneMeta), beatWidth));
                  return (
                    <rect
                      key={'rest-' + ev.id}
                      className="piano-roll-rest"
                      x={x}
                      y={0}
                      width={w}
                      height={height}
                    />
                  );
                })}
                <PianoRollPlaybackRegion
                  region={mediaSync.playbackRegion}
                  beatWidth={beatWidth}
                  height={height}
                />
                {renderNoteLayer(backgroundNoteEvents, 'piano-roll-note-background', false)}
                {renderNoteLayer(noteEvents, '', true)}
                <PianoRollPlayhead beat={mediaSync.playheadBeat} beatWidth={beatWidth} height={height} />
                {marquee ? (
                  <rect
                    x={marquee.x}
                    y={marquee.y}
                    width={marquee.width}
                    height={marquee.height}
                    className="piano-roll-marquee"
                  />
                ) : null}
              </g>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
