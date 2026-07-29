import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Row, Col } from 'react-bootstrap';
import Abc from './Abc';
import NotationToolbar from './NotationToolbar';
import NotationPlaybackControls from './NotationPlaybackControls';
import NotationInputHandler from './NotationInputHandler';
import PianoRollEditor from './PianoRollEditor';
import QuantizeDialog from './QuantizeDialog';
import VirtualPiano from './VirtualPiano';
import GhostNoteOverlay from './GhostNoteOverlay';
import StaffCaretOverlay from './StaffCaretOverlay';
import StaffSelectionOverlay from './StaffSelectionOverlay';
import NotationEditorHelpModal from './NotationEditorHelpModal';
import NotationEditorWalkthroughModal from './NotationEditorWalkthroughModal';
import NotationDurationToolbar from './NotationDurationToolbar';
import NotationVoicesDropdown from './NotationVoicesDropdown';
import NotationViewSelector from './NotationViewSelector';
import WizardOptionsModal from './WizardOptionsModal';
import NotationTuneMetaModal from './NotationTuneMetaModal';
import NotationInlineSignatureModal from './NotationInlineSignatureModal';
import useAbcjsParser from '../useAbcjsParser';
import useNotationCheck from '../useNotationCheck';
import NotationIssuesPanel from './NotationIssuesPanel';
import NotationPasteModeModal from './NotationPasteModeModal';
import { notationViewToEditorViewMode } from '../viewModeUtils';
import { serializeVoiceEvents } from '../notation/abcVoiceSerializer';
import { buildAbcPreviewFromBodies, voiceDisplayLabel, mapAbcClickToVoiceCursor } from '../notation/notationDisplayAbc';
import { activeVoiceIndicesFromTune } from '../abcVoiceViewSettings';
import { notationSessionReducer, createInitialSession } from '../notation/notationSession';
import {
  isShiftMarqueeEnabled,
  isCoarsePointerEvent,
  STAFF_LONG_PRESS_MS,
} from '../notation/staffGestureFlags';
import { abcElemStartMs } from '../notation/notationPlayback';
import { serializeVoiceEventsViaParser } from '../notation/abcVoiceSerializer';
import {
  insertMidiAtCaret,
  insertMidiChordAtCaret,
  insertRestAtCaret,
  insertPitchAtCaret,
  pitchFromLetter,
  pitchFromMidi,
  deleteSelectionToRest,
  removeSelection,
  deleteToRestUndoLabel,
  restDurationChangeLabel,
  transposeSelection,
  transposeSelectionByStaffSteps,
  changeSelectedDuration,
  toggleDotOnSelection,
  scaleDuration,
  moveCaret,
  repeatLast,
  selectEventRange,
  toggleSelectionEventId,
  selectMeasureContaining,
  selectAllPitchedEvents,
  applyAccidentalToSelection,
  replaceSelectionPitch,
  rePitchAtCaret,
  resolveDragStaffSteps,
  resolveEditTargetIds,
  sortSelectionEventIdsByBeat,
  addToneToEvent,
  insertBarlineAtCaret,
  insertSystemBreakAtCaret,
  insertEmptyMeasureAtCaret,
  insertKeyChangeAtCaret,
  insertMeterChangeAtCaret,
  updateKeyChangeEvent,
  updateMeterChangeEvent,
  layoutInsertIndex,
  pasteInsertIndex,
  respellEnharmonicSelection,
  writeNoteAtBeat,
} from '../notation/notationActions';
import {
  copyToClipboard,
  pasteFromClipboard,
  cutToClipboard,
  swapWithClipboard,
  repeatSelectionAtCaret,
  getNotationClipboard,
  hasClipboardContent,
} from '../notation/notationClipboard';
import {
  applyBarPasteToEvents,
  defaultPasteFromBar,
  eventsToNoteLines,
} from '../notation/notationBarPaste';
import { quantizeVoiceEvents } from '../notation/quantizeVoiceEvents';
import {
  applyDownbeatOffset,
  snapToPlaybackRegionStart,
  slideSelection,
} from '../notation/pianoRollAlign';
import { EDITOR_MODES, EDITOR_VIEWS, BARLINE_TOKENS, NOTE_INPUT_METHODS, STAFF_SELECTION_TOOLS } from '../notation/notationConstants';
import {
  eventIndexFromAbcCharPosition,
  abcCharRangeForEventIndex,
  eventsFromVoiceBody,
  caretIndexForStartBeat,
  eventIndexFromStaffAbcElem,
  eventIndexFromSelectableIndex,
  inlineSignatureEventAtStaffClick,
} from '../notation/voiceEventTiming';
import { beatsPerBarFromMeter } from '../notation/beatGrid';
import {
  eventIdFromStaffNoteElement,
  findStaffClickNoteEl,
  caretIndexAndAnchorFromStaffClick,
  isStaffHeaderDomTarget,
  staffHeaderKindFromDomTarget,
  findBarlineEventAtClick,
  staffMarqueeSelectEventIds,
  syncStaffSelectionHighlight,
  clickHitsNotehead,
} from '../notation/staffCaretPosition';
import {
  resolveStaffClick,
  resolveStaffClickForVoice,
  selectionRectsForEventIds,
  voiceKeyFromStaffAnalysis,
} from '../notation/staffClickResolve';
import useMidiInput from '../notation/useMidiInput';
import useToolbarExpand from '../notation/useToolbarExpand';
import {
  toggleTie,
  toggleDecoration,
  clearSlurOnSelection,
  handleSlurModeClick,
  applySlurFromSelection,
  insertGraceBeforeSelection,
  applyTupletToSelection,
  setBeamBreakBeforeSelection,
  findSlurGroupForSelection,
  reassignSlurEndpoints,
  clearTupletModeAndSelection,
  setChordSymbolOnSelection,
  setFingerOnSelection,
  fingeringLabelFromEvent,
  advanceSelectionToNextNote,
  isFingerDecorationKey,
} from '../notation/notationMarks';
import { createEventId, eventMidiPitch, eventMelodicMidiPitch, parseVoiceEvents } from '../notation/voiceEventModel';
import {
  appendMidiRecordNote,
  midiRecordBufferToEvents,
} from '../notation/notationMidiRecord';
import {
  parseMidiProgramFromNotes,
  withMidiProgramPrefix,
  stripMidiProgramFromNotes,
} from '../notation/voiceMeta';
import { useNoteAudition } from '../hooks/useNoteAudition';
import NotationAnnotOverlay from './NotationAnnotOverlay';
import NotationFingeringLabelsOverlay from './NotationFingeringLabelsOverlay';
import './NotationEditor.css';

function voiceBodyForSession(notes) {
  return stripMidiProgramFromNotes(notes).join('\n');
}

function activeVoiceMidiProgram(tune, voiceKey) {
  if (!tune || !tune.voices || !voiceKey || !tune.voices[voiceKey]) return 0;
  return parseMidiProgramFromNotes(tune.voices[voiceKey].notes);
}

export default function NotationEditor(props) {
  const abcjsParser = useAbcjsParser({ tunebook: props.tunebook });
  const activeMidiProgram = activeVoiceMidiProgram(props.tune, props.voiceKey);
  const { auditionMidi, ensureInstrument } = useNoteAudition(activeMidiProgram);
  const auditionMidiRef = useRef(auditionMidi);
  auditionMidiRef.current = auditionMidi;
  const activeMidiProgramRef = useRef(activeMidiProgram);
  activeMidiProgramRef.current = activeMidiProgram;
  const tuneMeta = useMemo(function() {
    return {
      meter: props.tune.meter || '4/4',
      noteLength: props.tune.noteLength || '1/8',
      key: props.tune.key || 'C',
      tempo: props.tune.tempo || 120,
    };
  }, [
    props.tune && props.tune.meter,
    props.tune && props.tune.noteLength,
    props.tune && props.tune.key,
    props.tune && props.tune.tempo,
  ]);

  useEffect(function() {
    if (ensureInstrument) ensureInstrument(activeMidiProgram);
  }, [activeMidiProgram, ensureInstrument]);

  const [session, setSession] = useState(function() {
    const initial = createInitialSession(tuneMeta, voiceBodyForSession(props.voiceNotes));
    if (props.controlledView) initial.view = props.controlledView;
    return initial;
  });
  const sessionRef = useRef(session);

  const staffRef = useRef(null);
  const staffWrapRef = useRef(null);
  const notationPlaybackControlRef = useRef(null);
  const notationStaffDisplayControlRef = useRef(null);
  const editingControlsRef = useRef(null);
  const expandFlags = useToolbarExpand(editingControlsRef);
  const staffDragTargetRef = useRef(null);
  const staffDragPointerRef = useRef(null);
  const staffMarqueeRef = useRef(null);
  /** Note pointerdown: drag → marquee; selected notehead + vertical drag → pitch. */
  const staffPendingGestureRef = useRef(null);
  const staffLongPressTimerRef = useRef(null);
  const staffLongPressArmedRef = useRef(false);
  const slurDragRef = useRef(null);
  const [slurSnapEventId, setSlurSnapEventId] = useState(null);
  const displayedVoiceKeysRef = useRef([]);

  function clearStaffLongPress() {
    if (staffLongPressTimerRef.current) {
      clearTimeout(staffLongPressTimerRef.current);
      staffLongPressTimerRef.current = null;
    }
    staffLongPressArmedRef.current = false;
  }

  function scheduleStaffLongPressMarquee(e, captureEl, pointerId) {
    if (!isShiftMarqueeEnabled() || !isCoarsePointerEvent(e)) return;
    clearStaffLongPress();
    const clientX = e.clientX;
    const clientY = e.clientY;
    staffLongPressTimerRef.current = window.setTimeout(function() {
      staffLongPressTimerRef.current = null;
      staffLongPressArmedRef.current = true;
      staffPendingGestureRef.current = null;
      beginStaffMarquee(clientX, clientY, captureEl, pointerId);
    }, STAFF_LONG_PRESS_MS);
  }

  function isStaffNoteAbcelem(abcelem) {
    if (!abcelem) return false;
    const headerType = abcelem.el_type || abcelem.type;
    if (headerType === 'note') return true;
    return abcelem.midi != null;
  }

  function auditionEvent(ev, toneIndex, midiFallback) {
    if (!ev || (ev.type !== 'note' && ev.type !== 'chord')) return;
    const midi = eventMidiPitch(ev, toneIndex) || eventMelodicMidiPitch(ev)
      || (typeof midiFallback === 'number' ? midiFallback : null);
    if (midi != null && auditionMidiRef.current) {
      auditionMidiRef.current(midi, 200, activeMidiProgramRef.current);
    }
  }
  const auditionEventRef = useRef(auditionEvent);
  auditionEventRef.current = auditionEvent;

  function resolveClickedNoteEvent(resolved, sessionEvents, abcelem) {
    const idx = resolved.eventIndex;
    const fromHit = resolved.selectedFromNoteHit && idx < sessionEvents.length
      ? sessionEvents[idx]
      : null;
    if (fromHit && (fromHit.type === 'note' || fromHit.type === 'chord')) return fromHit;
    if (!isStaffNoteAbcelem(abcelem) || idx < 0 || idx >= sessionEvents.length) return null;
    const fromAbc = sessionEvents[idx];
    if (fromAbc && (fromAbc.type === 'note' || fromAbc.type === 'chord')) return fromAbc;
    return null;
  }

  function auditionSelection(sessionLike) {
    const s = sessionLike || sessionRef.current;
    if (!s || !s.selection || !s.selection.eventIds || !s.selection.eventIds.length) return;
    const ev = s.events.find(function(e) { return e.id === s.selection.eventIds[0]; });
    auditionEvent(ev, s.selection.toneIndex);
  }
  const lastNoteSelectionRef = useRef({ eventIds: [], toneIndex: null, anchorId: null });
  const staffDragSuppressClickRef = useRef(false);
  const staffInputHandledRef = useRef(false);
  const staffPointerRef = useRef(null);
  const resolverDebugRef = useRef(null);
  const [pitchDragPreview, setPitchDragPreview] = useState(null);
  const [marqueeClientRect, setMarqueeClientRect] = useState(null);
  const [clipboardEpoch, setClipboardEpoch] = useState(0);
  const [pasteModal, setPasteModal] = useState(null);
  const [annotEdit, setAnnotEdit] = useState(null); // { mode, value, eventId, left, top }
  const [staffInsertAnchor, setStaffInsertAnchor] = useState(null);

  const focusStaffEditor = useCallback(function() {
    function focusNow() {
      if (staffRef.current) staffRef.current.focus({ preventScroll: true });
    }
    focusNow();
    // Beat abcjs svgEl.focus() / playlist chrome stealing focus after staff clicks.
    window.setTimeout(focusNow, 0);
    window.requestAnimationFrame(focusNow);
  }, []);

  const dispatch = useCallback(function(action) {
    let act = action;
    if (action.type === 'SET_SELECTION' && action.selection) {
      act = Object.assign({}, action, {
        selection: normalizeSelectionPayload(sessionRef.current, action.selection),
      });
    }
    const prevSession = sessionRef.current;
    const next = notationSessionReducer(prevSession, act);
    sessionRef.current = next;
    if (act.type === 'SET_SELECTION' && act.selection) {
      if (act.selection.eventIds && act.selection.eventIds.length) {
        lastNoteSelectionRef.current = {
          eventIds: act.selection.eventIds.slice(),
          toneIndex: act.selection.toneIndex,
          anchorId: act.selection.anchorId || act.selection.eventIds[0],
          startMs: act.selection.startMs,
          startBeat: act.selection.startBeat,
        };
      } else {
        lastNoteSelectionRef.current = { eventIds: [], toneIndex: null, anchorId: null };
      }
    } else if (act.type === 'LOAD_VOICE') {
      if (next.selection && next.selection.eventIds && next.selection.eventIds.length) {
        lastNoteSelectionRef.current = {
          eventIds: next.selection.eventIds.slice(),
          toneIndex: next.selection.toneIndex,
          anchorId: next.selection.anchorId || next.selection.eventIds[0],
          startBeat: next.selection.startBeat,
        };
      } else {
        lastNoteSelectionRef.current = { eventIds: [], toneIndex: null, anchorId: null };
      }
    }
    setSession(next);
  }, []);

  function normalizeSelectionPayload(session, selection) {
    if (!selection || !selection.eventIds || !selection.eventIds.length) {
      return selection;
    }
    const events = session && session.events ? session.events : [];
    const sorted = sortSelectionEventIdsByBeat(events, selection.eventIds);
    const anchorId = selection.anchorId && sorted.indexOf(selection.anchorId) >= 0
      ? selection.anchorId
      : sorted[0];
    let startBeat = selection.startBeat;
    if (startBeat == null && sorted.length) {
      const earliest = events.find(function(ev) { return ev.id === sorted[0]; });
      if (earliest && typeof earliest.startBeat === 'number') {
        startBeat = earliest.startBeat;
      }
    }
    return Object.assign({}, selection, {
      eventIds: sorted,
      anchorId: anchorId,
      startBeat: startBeat,
    });
  }

  const setCaretIndex = useCallback(function(index, insertAnchor) {
    if (insertAnchor && typeof insertAnchor.left === 'number') {
      setStaffInsertAnchor(insertAnchor);
    } else {
      setStaffInsertAnchor(null);
    }
    dispatch({ type: 'SET_CARET', index: index });
  }, [dispatch]);

  function setInsertCaret(index, insertAnchor) {
    setCaretIndex(index, insertAnchor || null);
  }

  function placeInsertCaretAtClientPoint(clientX, clientY) {
    const wrap = staffWrapRef.current;
    const s = sessionRef.current;
    if (!wrap || !s || s.mode === EDITOR_MODES.NOTE_INPUT) return false;
    const voiceStaffIdx = Math.max(0, displayedVoiceKeysRef.current.indexOf(props.voiceKey));
    const insertPos = caretIndexAndAnchorFromStaffClick(
      wrap,
      s.events,
      { clientX: clientX, clientY: clientY },
      null,
      voiceStaffIdx
    );
    if (!insertPos || typeof insertPos.caretIndex !== 'number') return false;
    setInsertCaret(insertPos.caretIndex, insertPos.anchor || null);
    clearSelectionClickRects();
    dispatch({ type: 'SET_SELECTION', selection: { eventIds: [], toneIndex: null, anchorId: null } });
    focusStaffEditor();
    return true;
  }
  function sessionWithEditSelection(session) {
    if (!session) return session;
    const resolved = resolveEditTargetIds(session, lastNoteSelectionRef.current);
    if (!resolved) return session;
    return Object.assign({}, session, { selection: resolved });
  }

  function clearSelectionClickRects() {
    /* Selection highlight is synced on abcjs drawables — no overlay click rects. */
  }

  function applyStaffPitchedNoteSelection(ev, sessionLike, caretIndex, startMs) {
    if (!ev || (ev.type !== 'note' && ev.type !== 'chord')) return;
    setStaffInsertAnchor(null);
    const idx = typeof caretIndex === 'number'
      ? caretIndex
      : sessionLike.events.findIndex(function(x) { return x.id === ev.id; });
    dispatch({
      type: 'SET_SELECTION',
      selection: {
        eventIds: [ev.id],
        toneIndex: null,
        anchorId: ev.id,
        startMs: typeof startMs === 'number' ? startMs : undefined,
        startBeat: typeof ev.startBeat === 'number' ? ev.startBeat : undefined,
      },
    });
    setCaretIndex(idx >= 0 ? idx : sessionLike.caretIndex);
    focusStaffEditor();
  }
  const [showQuantize, setShowQuantize] = useState(false);
  const [showTuneMeta, setShowTuneMeta] = useState(false);
  const [tuneMetaFocus, setTuneMetaFocus] = useState(null);
  const [inlineSigModal, setInlineSigModal] = useState(null);
  const [quantizeNoChangeHint, setQuantizeNoChangeHint] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [showVirtualPiano, setShowVirtualPiano] = useState(function() {
    try {
      return localStorage.getItem('notationVirtualPianoVisible') === 'true';
    } catch (err) {
      return false;
    }
  });
  const [abcDraft, setAbcDraft] = useState(props.voiceNotes || '');
  const [abcDrafts, setAbcDrafts] = useState(function() {
    const init = {};
    if (props.voiceKey) init[props.voiceKey] = props.voiceNotes || '';
    return init;
  });
  const [focusedAbcVoiceKey, setFocusedAbcVoiceKey] = useState(null);
  const [displayedVoiceIndices, setDisplayedVoiceIndices] = useState(function() {
    return activeVoiceIndicesFromTune(props.tune, props.voiceNames || []);
  });
  const [toggleSlot, setToggleSlot] = useState(null);
  const [splitRatio, setSplitRatio] = useState(function() {
    try {
      const stored = localStorage.getItem('notationSplitRatio');
      return stored ? Math.max(0.25, Math.min(0.75, parseFloat(stored))) : 0.55;
    } catch (err) {
      return 0.55;
    }
  });
  const splitDragRef = useRef(null);
  const commitDebounce = useRef(null);
  const abcSaveDebounce = useRef(null);
  const midiRecordBufferRef = useRef([]);
  const skipExternalLoad = useRef(false);
  const prevLoadedVoiceKeyRef = useRef(props.voiceKey);
  const prevLoadedVoiceBodyRef = useRef('');
  const textareaRefs = useRef({});
  const syncingTextarea = useRef(false);
  const abcDraftRef = useRef(props.voiceNotes || '');
  const abcDraftsRef = useRef({});
  const abcEditingRef = useRef(false);
  const prevViewRef = useRef(session.view);

  useEffect(function() {
    if (typeof props.onHelpModeChange === 'function') {
      props.onHelpModeChange(!!(showHelp || showWalkthrough));
    }
    return function() {
      if (typeof props.onHelpModeChange === 'function') {
        props.onHelpModeChange(false);
      }
    };
  }, [props.onHelpModeChange, showHelp, showWalkthrough]);

  useEffect(function() {
    function updateMarqueeRect(clientX, clientY) {
      const wrap = staffWrapRef.current;
      const m = staffMarqueeRef.current;
      if (!wrap || !m || typeof clientX !== 'number') return;
      const wr = wrap.getBoundingClientRect();
      setMarqueeClientRect({
        left: Math.min(m.clientX, clientX) - wr.left + (wrap.scrollLeft || 0),
        top: Math.min(m.clientY, clientY) - wr.top + (wrap.scrollTop || 0),
        right: Math.max(m.clientX, clientX) - wr.left + (wrap.scrollLeft || 0),
        bottom: Math.max(m.clientY, clientY) - wr.top + (wrap.scrollTop || 0),
      });
    }

    function resolvePendingGesture(e) {
      const pending = staffPendingGestureRef.current;
      if (!pending || typeof e.clientX !== 'number') return false;
      const dx = e.clientX - pending.clientX;
      const dy = e.clientY - pending.clientY;
      const slop = 6;
      const pitchMaxDx = 8;
      const pitchMinDy = 8;
      if (staffLongPressTimerRef.current
        && (Math.abs(dx) >= slop || Math.abs(dy) >= slop)) {
        clearStaffLongPress();
      }
      if (Math.abs(dx) < slop && Math.abs(dy) < slop) return true;
      staffPendingGestureRef.current = null;
      const shiftMarquee = isShiftMarqueeEnabled();
      const coarse = isCoarsePointerEvent(e);
      const staffMarqueeTool = sessionRef.current.staffSelectionTool === STAFF_SELECTION_TOOLS.MARQUEE;
      const allowLegacyMarquee = staffMarqueeTool
        || !shiftMarquee
        || coarse
        || staffLongPressArmedRef.current;
      // Pitch only on notehead + nearly pure vertical drag; any horizontal intent → marquee (legacy).
      const pitchEligible = pending.allowPitch
        && Math.abs(dx) < pitchMaxDx
        && Math.abs(dy) >= pitchMinDy;
      if (pitchEligible) {
        staffMarqueeRef.current = null;
        setMarqueeClientRect(null);
        staffDragPointerRef.current = {
          clientY: pending.clientY,
          lastClientY: e.clientY,
          stepPx: pending.stepPx,
        };
        staffDragTargetRef.current = pending.eventId;
        staffDragSuppressClickRef.current = false;
      } else if (allowLegacyMarquee) {
        staffDragPointerRef.current = null;
        staffDragTargetRef.current = null;
        setPitchDragPreview(null);
        staffMarqueeRef.current = {
          clientX: pending.clientX,
          clientY: pending.clientY,
          lastClientX: e.clientX,
          lastClientY: e.clientY,
        };
        staffDragSuppressClickRef.current = false;
        updateMarqueeRect(e.clientX, e.clientY);
      } else {
        staffDragPointerRef.current = null;
        staffDragTargetRef.current = null;
        setPitchDragPreview(null);
        staffMarqueeRef.current = null;
        setMarqueeClientRect(null);
        staffDragSuppressClickRef.current = false;
      }
      return true;
    }

    function onMove(e) {
      if (resolvePendingGesture(e)) {
        if (staffMarqueeRef.current && typeof e.clientX === 'number') {
          staffMarqueeRef.current.lastClientX = e.clientX;
          staffMarqueeRef.current.lastClientY = e.clientY;
          updateMarqueeRect(e.clientX, e.clientY);
        } else if (staffDragPointerRef.current && typeof e.clientY === 'number') {
          staffDragPointerRef.current.lastClientY = e.clientY;
        } else {
          return;
        }
      }
      if (staffMarqueeRef.current && typeof e.clientX === 'number') {
        staffMarqueeRef.current.lastClientX = e.clientX;
        staffMarqueeRef.current.lastClientY = e.clientY;
        updateMarqueeRect(e.clientX, e.clientY);
        return;
      }
      if (!staffDragPointerRef.current) return;
      if (typeof e.clientY === 'number') staffDragPointerRef.current.lastClientY = e.clientY;
      const dragPointer = staffDragPointerRef.current;
      const stepPx = dragPointer.stepPx > 0 ? dragPointer.stepPx : 14;
      const dragSteps = resolveDragStaffSteps({
        pointerDeltaY: dragPointer.lastClientY - dragPointer.clientY,
        stepPx: stepPx,
        clampAbs: 4,
      });
      const targetId = staffDragTargetRef.current;
      const s = sessionRef.current;
      const selIds = (s
        && s.selection
        && s.selection.eventIds
        && s.selection.eventIds.length
        && s.selection.eventIds.indexOf(targetId) >= 0)
        ? s.selection.eventIds.slice()
        : (targetId ? [targetId] : null);
      setPitchDragPreview(function(prev) {
        if (!selIds || !selIds.length) return null;
        if (prev
          && prev.staffSteps === dragSteps
          && prev.stepPx === stepPx
          && prev.eventIds
          && prev.eventIds.length === selIds.length
          && prev.eventIds.every(function(id, i) { return id === selIds[i]; })) {
          return prev;
        }
        return {
          eventIds: selIds,
          staffSteps: dragSteps,
          stepPx: stepPx,
        };
      });
    }
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('mousemove', onMove, true);
    return function() {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('mousemove', onMove, true);
    };
  }, []);

  useEffect(function() {
    midiRecordBufferRef.current = session.midiRecordBuffer || [];
  }, [session.midiRecordBuffer]);

  useEffect(function() {
    abcDraftRef.current = abcDraft;
  }, [abcDraft]);

  useEffect(function() {
    abcDraftsRef.current = abcDrafts;
  }, [abcDrafts]);

  useLayoutEffect(function() {
    if (!props.hideViewSelector) {
      setToggleSlot(document.getElementById('notation-view-toggle-slot'));
    }
  });


  useEffect(function() {
    if (!props.controlledView || props.controlledView === session.view) return;
    dispatch({ type: 'SET_VIEW', view: props.controlledView });
  }, [props.controlledView, session.view]);

  useEffect(function() {
    const notes = props.voiceNotes || '';
    const voiceKeyChanged = prevLoadedVoiceKeyRef.current !== props.voiceKey;
    prevLoadedVoiceKeyRef.current = props.voiceKey;
    // Own save echo: keep the textarea draft and caret. Parent echo may go through
    // justNotes (strip/reformat) or lag behind further keystrokes; rewriting drafts
    // here resets selection to the end and can cancel an in-flight abcSaveDebounce.
    if (skipExternalLoad.current && !voiceKeyChanged) {
      skipExternalLoad.current = false;
      const voiceBody = voiceBodyForSession(props.voiceNotes);
      const s = sessionRef.current;
      if (s && Array.isArray(s.events)) {
        const raw = serializeVoiceEvents(s.events, tuneMeta);
        const body = commitBodyWithMidi(raw, props.voiceKey).trim();
        const incoming = String(voiceBody || '').trim();
        if (incoming === body || incoming === String(raw).trim()) {
          return;
        }
      }
    }
    clearTimeout(abcSaveDebounce.current);
    abcEditingRef.current = false;
    skipExternalLoad.current = false;
    const ta = textareaRefs.current[props.voiceKey];
    const restoreSel = ta && document.activeElement === ta
      ? { start: ta.selectionStart, end: ta.selectionEnd }
      : null;
    abcDraftRef.current = notes;
    setAbcDraft(notes);
    setAbcDrafts(function(prev) {
      if (prev[props.voiceKey] === notes) return prev;
      return Object.assign({}, prev, { [props.voiceKey]: notes });
    });
    if (restoreSel) {
      window.requestAnimationFrame(function() {
        const el = textareaRefs.current[props.voiceKey];
        if (!el || document.activeElement !== el) return;
        const max = el.value.length;
        const start = Math.max(0, Math.min(restoreSel.start, max));
        const end = Math.max(0, Math.min(restoreSel.end, max));
        el.setSelectionRange(start, end);
      });
    }
    const voiceBody = voiceBodyForSession(props.voiceNotes);
    let sessionOutOfSync = false;
    const s = sessionRef.current;
    if (!voiceKeyChanged && s && Array.isArray(s.events)) {
      const raw = serializeVoiceEvents(s.events, tuneMeta);
      const sessionBody = commitBodyWithMidi(raw, props.voiceKey).trim();
      const incoming = String(voiceBody || '').trim();
      sessionOutOfSync = incoming !== sessionBody && incoming !== String(raw).trim();
    }
    if (!voiceKeyChanged && !sessionOutOfSync && voiceBody === prevLoadedVoiceBodyRef.current) {
      return;
    }
    prevLoadedVoiceBodyRef.current = voiceBody;
    clearSelectionClickRects();
    const bodyTrim = String(voiceBody || '').replace(/^%%MIDI[^\n]*\n?/m, '').trim();
    if (bodyTrim) {
      const trial = parseVoiceEvents(voiceBody, tuneMeta);
      if (!trial.length) return;
    }
    dispatch({ type: 'LOAD_VOICE', tuneMeta: tuneMeta, voiceBody: voiceBody });
  }, [props.voiceKey, props.voiceNotes, tuneMeta]);

  useEffect(function() {
    setDisplayedVoiceIndices(activeVoiceIndicesFromTune(props.tune, props.voiceNames || []));
  }, [props.tune && props.tune.id, props.voiceNames]);

  useEffect(function() {
    if (session.view !== EDITOR_VIEWS.ABC) {
      prevViewRef.current = session.view;
      return;
    }
    if (prevViewRef.current !== EDITOR_VIEWS.ABC && !abcEditingRef.current) {
      const el = textareaRefs.current[props.voiceKey];
      if (el) {
        const range = abcCharRangeForEventIndex(session.events, session.caretIndex, tuneMeta);
        syncingTextarea.current = true;
        el.setSelectionRange(range.start, range.end || range.start);
        syncingTextarea.current = false;
      }
    }
    prevViewRef.current = session.view;
  }, [session.view, session.caretIndex, session.events, props.voiceKey, tuneMeta]);

  const lastCommittedAbcRef = useRef('');

  const commitBodyWithMidi = useCallback(function(body, voiceKey) {
    const vk = voiceKey != null ? voiceKey : props.voiceKey;
    const program = activeVoiceMidiProgram(props.tune, vk);
    return withMidiProgramPrefix(body, program);
  }, [props.tune, props.voiceKey]);

  const commitToAbc = useCallback(function(events, label, voiceKey, commitOpts) {
    const vk = voiceKey != null ? voiceKey : props.voiceKey;
    const options = commitOpts || {};
    clearTimeout(commitDebounce.current);
    const eventsSnapshot = events;
    const pushChange = function() {
      const raw = serializeVoiceEvents(eventsSnapshot, tuneMeta);
      const body = commitBodyWithMidi(raw, vk);
      lastCommittedAbcRef.current = body;
      skipExternalLoad.current = true;
      props.onVoiceNotesChange(vk, body, label, options.immediate ? { immediate: true } : undefined);
    };
    if (options.immediate) {
      pushChange();
      return;
    }
    commitDebounce.current = setTimeout(pushChange, 50);
  }, [props, tuneMeta, commitBodyWithMidi]);

  useEffect(function() {
    if (!session.dirty) return;
    const raw = serializeVoiceEvents(session.events, tuneMeta).trim();
    const body = commitBodyWithMidi(raw, props.voiceKey).trim();
    const external = String(props.voiceNotes || '').trim();
    if (external === body || external === raw) {
      dispatch({ type: 'SET_DIRTY', dirty: false });
    }
  }, [props.voiceNotes, props.voiceKey, session.events, session.dirty, tuneMeta, commitBodyWithMidi]);

  const flushCommit = useCallback(function(voiceKey) {
    clearTimeout(commitDebounce.current);
    const s = sessionRef.current;
    if (!s || !Array.isArray(s.events)) return;
    const vk = voiceKey != null ? voiceKey : props.voiceKey;
    const raw = serializeVoiceEvents(s.events, tuneMeta);
    const body = commitBodyWithMidi(raw, vk);
    lastCommittedAbcRef.current = body;
    skipExternalLoad.current = true;
    props.onVoiceNotesChange(vk, body, 'Edit notation', { immediate: true });
  }, [props, tuneMeta, commitBodyWithMidi]);

  useEffect(function() {
    if (typeof props.onRegisterFlushCommit === 'function') {
      props.onRegisterFlushCommit(flushCommit);
      return function() { props.onRegisterFlushCommit(null); };
    }
    return undefined;
  }, [props.onRegisterFlushCommit, flushCommit]);

  const flushAbcDraft = useCallback(function(voiceKey) {
    clearTimeout(abcSaveDebounce.current);
    abcEditingRef.current = false;
    const vk = voiceKey || props.voiceKey;
    const drafts = abcDraftsRef.current;
    const text = drafts[vk] != null ? drafts[vk] : abcDraftRef.current;
    skipExternalLoad.current = true;
    props.onVoiceNotesChange(vk, text, 'Edit ABC text');
  }, [props]);

  const flushAllAbcDrafts = useCallback(function() {
    clearTimeout(abcSaveDebounce.current);
    abcEditingRef.current = false;
    const drafts = abcDraftsRef.current || {};
    Object.keys(drafts).forEach(function(vk) {
      skipExternalLoad.current = true;
      props.onVoiceNotesChange(vk, drafts[vk], 'Edit ABC text');
    });
  }, [props]);

  const applyEvents = useCallback(function(patch, sourceView, label, opts) {
    const options = opts || {};
    dispatch({
      type: 'SET_EVENTS',
      events: patch.events,
      caretIndex: patch.caretIndex,
      lastEvent: patch.lastEvent,
      selection: patch.selection,
      sourceView: sourceView,
    });
    if (patch.tupletMode !== undefined) {
      dispatch({ type: 'SET_TUPLET_MODE', tupletMode: patch.tupletMode });
    }
    if (patch.slurMode !== undefined) {
      dispatch({ type: 'SET_SLUR_MODE', value: patch.slurMode });
    }
    if (patch.slurPendingStartId !== undefined) {
      dispatch({ type: 'SET_SLUR_PENDING', id: patch.slurPendingStartId });
    }
    if (patch.accidentalCarry !== undefined) {
      dispatch({ type: 'SET_ACCIDENTAL_CARRY', value: patch.accidentalCarry });
    }
    if (patch.pitchCarry !== undefined) {
      dispatch({ type: 'SET_PITCH_CARRY', pitch: patch.pitchCarry });
    }
    if (!options.deferCommit) {
      const immediate = options.deferHistory !== true;
      const commitOpts = immediate ? { immediate: true } : undefined;
      commitToAbc(patch.events, label || 'Edit notation', props.voiceKey, commitOpts);
    }
    focusStaffEditor();
  }, [dispatch, commitToAbc, focusStaffEditor]);

  // Keep latest commit helpers in refs so window pointerup is registered once
  // and not torn down mid-drag when React re-renders (e.g. pitch-preview setState).
  const commitStaffPointerUpRef = useRef(null);
  commitStaffPointerUpRef.current = function(endClientX, endClientY) {
    clearStaffLongPress();
    staffLongPressArmedRef.current = false;
    // Tap without drag: select the note and preview (click may be suppressed by pointer capture).
    if (staffPendingGestureRef.current) {
      const pending = staffPendingGestureRef.current;
      staffPendingGestureRef.current = null;
      const s = sessionRef.current;
      const endY = typeof endClientY === 'number' ? endClientY : pending.clientY;
      const endX = typeof endClientX === 'number' ? endClientX : pending.clientX;
      const moved = Math.abs(endY - pending.clientY) >= 4 || Math.abs(endX - pending.clientX) >= 4;
      if (pending.emptyGap && s && s.mode !== EDITOR_MODES.NOTE_INPUT) {
        if (placeInsertCaretAtClientPoint(endX, endY)) {
          staffDragSuppressClickRef.current = true;
          window.setTimeout(function() { staffDragSuppressClickRef.current = false; }, 50);
        }
        return;
      }
      if (!moved && s && s.mode !== EDITOR_MODES.NOTE_INPUT && pending.eventId) {
        const ev = s.events.find(function(e) { return e.id === pending.eventId; });
        if (ev && (ev.type === 'note' || ev.type === 'chord')) {
          const idx = s.events.findIndex(function(e) { return e.id === ev.id; });
          applyStaffPitchedNoteSelection(ev, s, idx, null);
          if (auditionEventRef.current) {
            auditionEventRef.current(ev, null);
          }
          staffDragSuppressClickRef.current = true;
          window.setTimeout(function() { staffDragSuppressClickRef.current = false; }, 50);
        }
      }
      return;
    }
    if (staffMarqueeRef.current) {
      const marquee = staffMarqueeRef.current;
      staffMarqueeRef.current = null;
      setMarqueeClientRect(null);
      const s = sessionRef.current;
      if (!s || s.mode === EDITOR_MODES.NOTE_INPUT) return;
      const wrap = staffWrapRef.current;
      if (!wrap || !marquee) return;
      const endX = typeof endClientX === 'number' ? endClientX
        : (typeof marquee.lastClientX === 'number' ? marquee.lastClientX : marquee.clientX);
      const endY = typeof endClientY === 'number' ? endClientY
        : (typeof marquee.lastClientY === 'number' ? marquee.lastClientY : marquee.clientY);
      if (Math.abs(endX - marquee.clientX) < 4 && Math.abs(endY - marquee.clientY) < 4) {
        if (placeInsertCaretAtClientPoint(endX, endY)) {
          staffDragSuppressClickRef.current = true;
          window.setTimeout(function() { staffDragSuppressClickRef.current = false; }, 50);
        }
        return;
      }
      const voiceStaffIdx = Math.max(0, displayedVoiceKeysRef.current.indexOf(props.voiceKey));
      const ids = staffMarqueeSelectEventIds(wrap, s.events, {
        left: Math.min(marquee.clientX, endX),
        right: Math.max(marquee.clientX, endX),
        top: Math.min(marquee.clientY, endY),
        bottom: Math.max(marquee.clientY, endY),
      }, voiceStaffIdx);
      staffDragSuppressClickRef.current = true;
      if (!ids.length) {
        dispatch({ type: 'SET_SELECTION', selection: { eventIds: [], toneIndex: null, anchorId: null } });
        clearSelectionClickRects();
      } else {
        dispatch({
          type: 'SET_SELECTION',
          selection: { eventIds: ids, toneIndex: null, anchorId: ids[0] },
        });
        let minIdx = s.events.length;
        ids.forEach(function(id) {
          const i = s.events.findIndex(function(ev) { return ev.id === id; });
          if (i >= 0 && i < minIdx) minIdx = i;
        });
        setCaretIndex(minIdx);
        clearSelectionClickRects();
        focusStaffEditor();
      }
      window.setTimeout(function() { staffDragSuppressClickRef.current = false; }, 50);
      return;
    }

    const dragPointer = staffDragPointerRef.current;
    if (!dragPointer) return;
    if (slurDragRef.current) {
      staffDragPointerRef.current = null;
      staffDragTargetRef.current = null;
      setPitchDragPreview(null);
      return;
    }
    staffDragPointerRef.current = null;
    setPitchDragPreview(null);
    const s = sessionRef.current;
    if (!s || s.mode === EDITOR_MODES.NOTE_INPUT) {
      staffDragTargetRef.current = null;
      return;
    }
    const endY = typeof endClientY === 'number'
      ? endClientY
      : (typeof dragPointer.lastClientY === 'number' ? dragPointer.lastClientY : dragPointer.clientY);
    const stepPx = dragPointer.stepPx > 0 ? dragPointer.stepPx : 14;
    const dragSteps = resolveDragStaffSteps({
      pointerDeltaY: endY - dragPointer.clientY,
      stepPx: stepPx,
      clampAbs: 4,
    });
    if (!dragSteps) {
      const tapId = staffDragTargetRef.current;
      staffDragPointerRef.current = null;
      staffDragTargetRef.current = null;
      setPitchDragPreview(null);
      if (tapId && s.mode !== EDITOR_MODES.NOTE_INPUT) {
        const tapEv = s.events.find(function(ev) { return ev.id === tapId; });
        if (tapEv && auditionEventRef.current) {
          auditionEventRef.current(tapEv, null);
        }
      }
      return;
    }
    let dragEv = null;
    let dragIdx = null;
    if (staffDragTargetRef.current) {
      const idx = s.events.findIndex(function(ev) { return ev.id === staffDragTargetRef.current; });
      if (idx >= 0) {
        const candidate = s.events[idx];
        if (candidate && (candidate.type === 'note' || candidate.type === 'chord')) {
          dragIdx = idx;
          dragEv = candidate;
        }
      }
    }
    staffDragTargetRef.current = null;
    if (!dragEv) return;
    const selIds = (s.selection.eventIds && s.selection.eventIds.length
      && s.selection.eventIds.indexOf(dragEv.id) >= 0)
      ? s.selection.eventIds.slice()
      : [dragEv.id];
    const sessionWithSelection = Object.assign({}, s, {
      selection: { eventIds: selIds, toneIndex: null, anchorId: dragEv.id },
    });
    const patch = transposeSelectionByStaffSteps(sessionWithSelection, dragSteps, null);
    if (!patch) return;
    staffDragSuppressClickRef.current = true;
    const nextCaret = dragIdx != null && dragIdx >= 0 ? dragIdx : s.caretIndex;
    window.setTimeout(function() {
      applyEvents(patch, EDITOR_VIEWS.STAFF, 'Drag pitch', { deferHistory: false });
      setCaretIndex(nextCaret);
      auditionSelection(Object.assign({}, sessionWithSelection, { events: patch.events, selection: sessionWithSelection.selection }));
      window.setTimeout(function() { staffDragSuppressClickRef.current = false; }, 50);
    }, 0);
  };

  useEffect(function() {
    function onUp(e) {
      if (typeof commitStaffPointerUpRef.current === 'function') {
        commitStaffPointerUpRef.current(
          e && typeof e.clientX === 'number' ? e.clientX : null,
          e && typeof e.clientY === 'number' ? e.clientY : null
        );
      }
    }
    // Prefer pointerup; mouseup is a Puppeteer/legacy fallback when pointer events are missing.
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('mouseup', onUp, true);
    return function() {
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('mouseup', onUp, true);
    };
  }, []);

  const pushMidiRecordNote = useCallback(function(payload, isNoteOn) {
    const buffer = appendMidiRecordNote(midiRecordBufferRef.current, payload, isNoteOn);
    midiRecordBufferRef.current = buffer;
    dispatch({ type: 'SET_MIDI_RECORD', active: true, buffer: buffer });
  }, []);

  const handleMidiNoteOn = useCallback(function(payload) {
    const s = sessionRef.current;
    if (s.midiRecordActive) {
      pushMidiRecordNote({
        midi: payload.midi,
        velocity: payload.velocity,
        timeMs: performance.now(),
      }, true);
      return;
    }
    if (s.mode !== EDITOR_MODES.NOTE_INPUT) return;
    const method = s.noteInputMethod || NOTE_INPUT_METHODS.NOTE_NAME;
    const pitch = pitchFromMidi(payload.midi, s.tuneMeta);
    if (method === NOTE_INPUT_METHODS.DURATION || method === NOTE_INPUT_METHODS.RHYTHM) {
      dispatch({ type: 'SET_PITCH_CARRY', pitch: pitch });
      if (method === NOTE_INPUT_METHODS.RHYTHM) return;
      // Duration: wait for duration key (unless chord burst)
      if (!(payload.chord && payload.midis)) return;
    }
    if (method === NOTE_INPUT_METHODS.RE_PITCH) {
      const patch = rePitchAtCaret(s, pitch);
      if (patch) applyEvents(patch, EDITOR_VIEWS.STAFF, 'MIDI re-pitch');
      return;
    }
    let patch;
    if (payload.chord && payload.midis) {
      patch = insertMidiChordAtCaret(s, payload.midis);
    } else if (payload.addTone) {
      const idx = Math.max(0, s.caretIndex - 1);
      patch = addToneToEvent(s, idx, pitch);
      if (!patch) patch = insertMidiAtCaret(s, payload.midi);
    } else {
      patch = insertMidiAtCaret(s, payload.midi);
    }
    if (patch) {
      applyEvents(Object.assign({}, patch, { pitchCarry: pitch }), EDITOR_VIEWS.STAFF, 'MIDI note');
      dispatch({ type: 'SET_PITCH_CARRY', pitch: pitch });
    }
  }, [applyEvents, pushMidiRecordNote]);

  const handleMidiNoteOff = useCallback(function(payload) {
    const s = sessionRef.current;
    if (!s.midiRecordActive) return;
    pushMidiRecordNote({
      midi: payload.midi,
      timeMs: performance.now(),
    }, false);
  }, [pushMidiRecordNote]);

  const midi = useMidiInput({
    enabled: session.midiEnabled,
    selectedInputId: session.midiInputId,
    onNoteOn: handleMidiNoteOn,
    onNoteOff: handleMidiNoteOff,
    chordMode: session.midiChordMode,
    chordWindowMs: session.midiChordWindowMs,
    recordActive: session.midiRecordActive,
  });

  function sessionForCaretInsert(session) {
    const s = sessionWithEditSelection(session);
    return Object.assign({}, s, {
      caretIndex: layoutInsertIndex(s, lastNoteSelectionRef.current),
    });
  }

  function patchAfterLayoutInsert(session, patch) {
    if (!patch) return patch;
    const prepared = sessionWithEditSelection(session);
    if (prepared.mode === EDITOR_MODES.NOTE_INPUT) {
      return Object.assign({}, patch, {
        selection: { eventIds: [], toneIndex: null, anchorId: null },
      });
    }
    if (prepared.mode !== EDITOR_MODES.NORMAL
      || !prepared.selection.eventIds.length) return patch;
    const selId = prepared.selection.eventIds[0];
    const newIdx = patch.events.findIndex(function(ev) { return ev.id === selId; });
    return Object.assign({}, patch, {
      selection: prepared.selection,
      caretIndex: newIdx >= 0 ? newIdx : patch.caretIndex,
    });
  }

  function handleShortcutAction(action) {
    const s = sessionWithEditSelection(sessionRef.current);
    if (action.action === 'undo' || action.action === 'redo') {
      return;
    }
    if (action.action === 'toggleNoteInput') {
      const nextMode = s.mode === EDITOR_MODES.NOTE_INPUT ? EDITOR_MODES.NORMAL : EDITOR_MODES.NOTE_INPUT;
      dispatch({ type: 'SET_MODE', mode: nextMode });
      if (nextMode === EDITOR_MODES.NOTE_INPUT) {
        dispatch({
          type: 'SET_SELECTION',
          selection: { eventIds: [], toneIndex: null, anchorId: null },
        });
        clearSelectionClickRects();
        setCaretIndex(s.events.length);
      } else {
      }
      focusStaffEditor();
      return;
    }
    if (action.action === 'setNoteInputMethod') {
      const method = action.method || NOTE_INPUT_METHODS.NOTE_NAME;
      dispatch({ type: 'SET_NOTE_INPUT_METHOD', method: method });
      if (s.mode !== EDITOR_MODES.NOTE_INPUT) {
        dispatch({ type: 'SET_MODE', mode: EDITOR_MODES.NOTE_INPUT });
        dispatch({
          type: 'SET_SELECTION',
          selection: { eventIds: [], toneIndex: null, anchorId: null },
        });
        clearSelectionClickRects();
      }
      focusStaffEditor();
      return;
    }
    if (action.action === 'exitNoteInput') {
      if (annotEdit) {
        setAnnotEdit(null);
        return;
      }
      dispatch({ type: 'SET_MODE', mode: EDITOR_MODES.NORMAL });
      return;
    }
    if (action.action === 'togglePianoRoll') {
      const cycle = [EDITOR_VIEWS.STAFF, EDITOR_VIEWS.PIANO_ROLL, EDITOR_VIEWS.SPLIT];
      const idx = cycle.indexOf(s.view);
      const nextView = cycle[(idx + 1) % cycle.length];
      dispatch({ type: 'SET_VIEW', view: nextView });
      return;
    }
    if (action.action === 'setDuration') {
      dispatch({ type: 'SET_DURATION_KEY', key: action.key });
      const method = s.noteInputMethod || NOTE_INPUT_METHODS.NOTE_NAME;
      if (s.mode === EDITOR_MODES.NOTE_INPUT
        && (method === NOTE_INPUT_METHODS.DURATION || method === NOTE_INPUT_METHODS.RHYTHM)) {
        const pitch = s.pitchCarry || pitchFromMidi(60, s.tuneMeta);
        const withKey = Object.assign({}, s, { durationKey: action.key });
        const patch = insertPitchAtCaret(withKey, pitch);
        applyEvents(Object.assign({}, patch, { pitchCarry: pitch }), EDITOR_VIEWS.STAFF, 'Insert note');
        dispatch({ type: 'SET_PITCH_CARRY', pitch: pitch });
      }
      return;
    }
    if (action.action === 'toggleDot') {
      const editSession = sessionWithEditSelection(s);
      if (editSession.selection && editSession.selection.eventIds && editSession.selection.eventIds.length) {
        const patch = toggleDotOnSelection(editSession);
        if (patch) {
          applyEvents(patch, EDITOR_VIEWS.STAFF, 'Toggle dot');
          return;
        }
      }
      dispatch({ type: 'TOGGLE_DOT' });
      return;
    }
    if (action.action === 'toggleSnap') {
      dispatch({ type: 'SET_MIDI_STATE', patch: { snapEnabled: !s.snapEnabled } });
      return;
    }
    if (action.action === 'insertRest') {
      if (s.mode === EDITOR_MODES.NOTE_INPUT) {
        applyEvents(insertRestAtCaret(s), EDITOR_VIEWS.STAFF, 'Insert rest');
      }
      return;
    }
    if (action.action === 'insertBarline') {
      const prepared = sessionForCaretInsert(s);
      applyEvents(
        patchAfterLayoutInsert(s, insertBarlineAtCaret(prepared, action.barToken || BARLINE_TOKENS.SINGLE, prepared.caretIndex)),
        s.view,
        'Insert bar line'
      );
      return;
    }
    if (action.action === 'insertSystemBreak') {
      const prepared = sessionForCaretInsert(s);
      applyEvents(
        patchAfterLayoutInsert(s, insertSystemBreakAtCaret(prepared, prepared.caretIndex)),
        s.view,
        'Insert system break'
      );
      return;
    }
    if (action.action === 'insertPitch' || action.action === 'addChordTone') {
      const pitch = pitchFromLetter(action.letter, s);
      const method = s.noteInputMethod || NOTE_INPUT_METHODS.NOTE_NAME;
      if (s.mode === EDITOR_MODES.NOTE_INPUT) {
        if (method === NOTE_INPUT_METHODS.DURATION) {
          dispatch({ type: 'SET_PITCH_CARRY', pitch: pitch });
          return;
        }
        if (method === NOTE_INPUT_METHODS.RE_PITCH) {
          const patch = rePitchAtCaret(s, pitch);
          if (patch) applyEvents(patch, EDITOR_VIEWS.STAFF, 'Re-pitch');
          return;
        }
        if (method === NOTE_INPUT_METHODS.RHYTHM) {
          dispatch({ type: 'SET_PITCH_CARRY', pitch: pitch });
          return;
        }
        // NOTE_NAME / INSERT — insert at caret
        dispatch({ type: 'SET_CHORD_BUILD', value: action.action === 'addChordTone' });
        const patch = insertPitchAtCaret(
          Object.assign({}, s, { chordBuild: action.action === 'addChordTone' }),
          pitch
        );
        applyEvents(Object.assign({}, patch, { pitchCarry: pitch }), EDITOR_VIEWS.STAFF, 'Insert note');
        dispatch({ type: 'SET_PITCH_CARRY', pitch: pitch });
        return;
      }
      if (s.selection.eventIds.length) {
        if (action.action === 'addChordTone') {
          const selId = s.selection.anchorId || s.selection.eventIds[0];
          const idx = s.events.findIndex(function(ev) { return ev.id === selId; });
          if (idx >= 0) {
            const patch = addToneToEvent(s, idx, pitch);
            if (patch) applyEvents(patch, EDITOR_VIEWS.STAFF, 'Add chord tone');
          }
          return;
        }
        const patch = replaceSelectionPitch(s, pitch);
        if (patch) applyEvents(patch, EDITOR_VIEWS.STAFF, 'Replace pitch');
      }
      return;
    }
    if (action.action === 'accidental') {
      const editSession = sessionWithEditSelection(s);
      if (editSession.selection && editSession.selection.eventIds && editSession.selection.eventIds.length) {
        const patch = applyAccidentalToSelection(editSession, action.value);
        if (patch) {
          applyEvents(patch, EDITOR_VIEWS.STAFF, action.value == null ? 'Clear accidental' : 'Accidental');
          return;
        }
      }
      if (s.mode === EDITOR_MODES.NOTE_INPUT || action.value == null) {
        dispatch({ type: 'SET_ACCIDENTAL_CARRY', value: action.value });
      }
      return;
    }
    if (action.action === 'selectAll') {
      if (!s.events.length) return;
      const patch = selectAllPitchedEvents(s);
      clearSelectionClickRects();
      dispatch({
        type: 'SET_SELECTION',
        selection: patch.selection,
      });
      dispatch({ type: 'SET_CARET', index: patch.caretIndex });
      focusStaffEditor();
      return;
    }
    if (action.action === 'copy') {
      const ids = s.selection.eventIds;
      const evs = s.events.filter(function(ev) { return ids.indexOf(ev.id) >= 0; });
      if (evs.length) {
        copyToClipboard(evs, tuneMeta, props.voiceIndex);
        setClipboardEpoch(function(n) { return n + 1; });
      }
      return;
    }
    if (action.action === 'cut') {
      const ids = s.selection.eventIds;
      if (!ids.length) return;
      const remaining = cutToClipboard(s.events, ids, tuneMeta, props.voiceIndex);
      setClipboardEpoch(function(n) { return n + 1; });
      applyEvents(
        Object.assign({}, s, { events: remaining, selection: { eventIds: [], toneIndex: null, anchorId: null } }),
        EDITOR_VIEWS.STAFF,
        'Cut'
      );
      return;
    }
    if (action.action === 'paste') {
      const editSession = sessionWithEditSelection(s);
      const replaceIds = (editSession.selection && editSession.selection.eventIds) || [];
      const replacing = replaceIds.length > 0;
      let caret;
      if (s.view === EDITOR_VIEWS.PIANO_ROLL || s.view === EDITOR_VIEWS.SPLIT) {
        const prepared = sessionForCaretInsert(editSession);
        caret = prepared.caretIndex;
        if (replacing) {
          let minBeat = Infinity;
          replaceIds.forEach(function(id) {
            const hit = prepared.events.find(function(x) { return x.id === id; });
            if (hit && typeof hit.startBeat === 'number' && hit.startBeat < minBeat) {
              minBeat = hit.startBeat;
            }
          });
          if (Number.isFinite(minBeat)) {
            caret = caretIndexForStartBeat(prepared.events, minBeat);
          }
        } else if (prepared.selection.eventIds.length) {
          const ev = prepared.events.find(function(x) { return x.id === prepared.selection.eventIds[0]; });
          if (ev) caret = caretIndexForStartBeat(prepared.events, ev.startBeat || 0);
        }
      } else {
        caret = replacing
          ? layoutInsertIndex(editSession, lastNoteSelectionRef.current)
          : pasteInsertIndex(editSession, lastNoteSelectionRef.current);
      }
      if (hasClipboardContent()) {
        const range = defaultPasteFromBar(
          editSession.events,
          caret,
          replacing ? replaceIds : null,
          tuneMeta
        );
        setPasteModal({
          mode: 'merge',
          fromBar: range.fromBar,
          toBar: range.toBar,
          events: editSession.events,
          view: s.view,
        });
        return;
      }
      const pasted = pasteFromClipboard(editSession.events, caret, tuneMeta, replacing ? replaceIds : null);
      if (pasted) {
        applyEvents(Object.assign({}, editSession, pasted, {
          selection: { eventIds: [], toneIndex: null, anchorId: null },
        }), s.view, 'Paste');
      }
      return;
    }
    if (action.action === 'swapClipboard') {
      const swapped = swapWithClipboard(s.events, s.selection.eventIds, s.caretIndex, tuneMeta, props.voiceIndex);
      if (swapped) {
        setClipboardEpoch(function(n) { return n + 1; });
        applyEvents(Object.assign({}, s, swapped), EDITOR_VIEWS.STAFF, 'Swap clipboard');
      }
      return;
    }
    if (action.action === 'editChordSymbol' || action.action === 'editFingering') {
      openAnnotEditor(action.action === 'editFingering' ? 'finger' : 'chord');
      return;
    }
    if (action.action === 'repeat') {
      const ids = s.selection.eventIds;
      let patch;
      if (ids.length) patch = repeatSelectionAtCaret(s.events, ids, s.caretIndex);
      else patch = repeatLast(s);
      if (patch) applyEvents(Object.assign({}, s, patch), EDITOR_VIEWS.STAFF, 'Repeat');
      return;
    }
    if (action.action === 'prevEvent' || action.action === 'nextEvent') {
      const delta = action.action === 'nextEvent' ? 1 : -1;
      // Note input: move insert caret only (MuseScore note-input cursor).
      if (s.mode === 'noteInput') {
        setCaretIndex(moveCaret(s, delta).caretIndex);
        return;
      }
      // Normal mode: select previous/next event (MuseScore Select previous/next chord).
      if (!s.events.length) return;
      let fromIdx = -1;
      if (s.selection.eventIds && s.selection.eventIds.length) {
        const indices = [];
        for (let i = 0; i < s.selection.eventIds.length; i += 1) {
          const id = s.selection.eventIds[i];
          const found = s.events.findIndex(function(ev) { return ev.id === id; });
          if (found >= 0) indices.push(found);
        }
        if (indices.length) {
          fromIdx = delta > 0
            ? Math.max.apply(null, indices)
            : Math.min.apply(null, indices);
        }
      }
      if (fromIdx < 0) {
        if (s.caretIndex >= s.events.length) {
          fromIdx = s.events.length - 1;
        } else if (s.caretIndex > 0 && delta < 0) {
          fromIdx = s.caretIndex;
        } else {
          fromIdx = Math.min(s.caretIndex, s.events.length - 1);
        }
      }
      const targetIdx = Math.max(0, Math.min(fromIdx + delta, s.events.length - 1));
      const ev = s.events[targetIdx];
      if (!ev) return;
      clearSelectionClickRects();
      dispatch({ type: 'SET_CARET', index: targetIdx });
      dispatch({
        type: 'SET_SELECTION',
        selection: { eventIds: [ev.id], toneIndex: null, anchorId: ev.id },
      });
      return;
    }
    if (action.action === 'extendSelection') {
      if (s.mode === 'noteInput' || !s.events.length) return;
      const delta = action.delta || 1;
      const anchorId = s.selection.anchorId
        || (s.selection.eventIds && s.selection.eventIds[0])
        || null;
      let fromIdx = -1;
      if (s.selection.eventIds && s.selection.eventIds.length) {
        const indices = [];
        for (let i = 0; i < s.selection.eventIds.length; i += 1) {
          const found = s.events.findIndex(function(ev) { return ev.id === s.selection.eventIds[i]; });
          if (found >= 0) indices.push(found);
        }
        if (indices.length) {
          fromIdx = delta > 0
            ? Math.max.apply(null, indices)
            : Math.min.apply(null, indices);
        }
      }
      if (fromIdx < 0) fromIdx = Math.min(s.caretIndex, s.events.length - 1);
      const targetIdx = Math.max(0, Math.min(fromIdx + delta, s.events.length - 1));
      const target = s.events[targetIdx];
      if (!target) return;
      const anchor = anchorId || target.id;
      const ids = selectEventRange(s.events, anchor, target.id);
      clearSelectionClickRects();
      dispatch({ type: 'SET_CARET', index: targetIdx });
      dispatch({
        type: 'SET_SELECTION',
        selection: { eventIds: ids, toneIndex: null, anchorId: anchor },
      });
      return;
    }
    if (action.action === 'prevMeasure' || action.action === 'nextMeasure') {
      const bpb = beatsPerBarFromMeter(tuneMeta.meter);
      const cur = s.events[s.caretIndex];
      const beat = cur ? (cur.startBeat || 0) : 0;
      const target = action.action === 'nextMeasure'
        ? Math.floor(beat / bpb + 1) * bpb
        : Math.floor(beat / bpb - 1) * bpb;
      let idx = 0;
      for (let i = 0; i < s.events.length; i += 1) {
        if ((s.events[i].startBeat || 0) >= target) { idx = i; break; }
        idx = i + 1;
      }
      setCaretIndex(idx);
      return;
    }
    if (action.action === 'transposeChromatic' || action.action === 'transposeOctave' || action.action === 'transposeDiatonic') {
      let delta = action.delta;
      if (action.action === 'transposeOctave') delta *= 12;
      if (action.action === 'transposeDiatonic') delta *= 2;
      const patch = transposeSelection(s, delta, s.selection.toneIndex);
      applyEvents(patch, EDITOR_VIEWS.STAFF, 'Transpose');
      if (patch) auditionSelection(Object.assign({}, s, { events: patch.events }));
      return;
    }
    if (action.action === 'insertMeasure') {
      applyEvents(patchAfterLayoutInsert(s, insertEmptyMeasureAtCaret(sessionForCaretInsert(s))), s.view, 'Insert measure');
      return;
    }
    if (action.action === 'respellEnharmonic') {
      const editSession = sessionWithEditSelection(s);
      const patch = respellEnharmonicSelection(editSession);
      if (patch) applyEvents(patch, EDITOR_VIEWS.STAFF, 'Enharmonic respell');
      return;
    }
    if (action.action === 'beamBreak') {
      const editSession = sessionWithEditSelection(s);
      const patch = setBeamBreakBeforeSelection(editSession);
      if (patch) applyEvents(patch, EDITOR_VIEWS.STAFF, 'Beam break');
      return;
    }
    if (action.action === 'deleteToRest') {
      const patch = deleteSelectionToRest(s, { backward: action.backward !== false });
      if (patch) {
        applyEvents(patch, EDITOR_VIEWS.STAFF, deleteToRestUndoLabel(s, action));
      }
      return;
    }
    if (action.action === 'removeRange') {
      const patch = removeSelection(s);
      if (patch) applyEvents(patch, EDITOR_VIEWS.STAFF, 'Remove');
      return;
    }
    if (action.action === 'toggleTie') {
      const patch = toggleTie(s);
      if (patch) applyEvents(patch, EDITOR_VIEWS.STAFF, 'Toggle tie');
      return;
    }
    if (action.action === 'halveDurationDotAware' || action.action === 'doubleDurationDotAware') {
      applyEvents(scaleDuration(s, action.action.includes('halve') ? 0.5 : 2, true), EDITOR_VIEWS.STAFF, 'Change duration');
      return;
    }
    if (action.action === 'halveDuration' || action.action === 'doubleDuration') {
      applyEvents(scaleDuration(s, action.action === 'halveDuration' ? 0.5 : 2, false), EDITOR_VIEWS.STAFF, 'Change duration');
      return;
    }
    if (action.action === 'setDuration' && s.selection.eventIds.length) {
      applyEvents(
        changeSelectedDuration(s, action.key, s.dotted),
        EDITOR_VIEWS.STAFF,
        restDurationChangeLabel(s, action.key, s.dotted)
      );
    }
  }

  function handleAbcPreviewClick(abcelem, tuneNumber, classes, analysis, drag, mouseEvent, renderedAbc) {
    if (!abcelem || abcelem.startChar == null) return;
    const voiceIdx = analysis && typeof analysis.voice === 'number' ? analysis.voice : 0;
    const mapped = mapAbcClickToVoiceCursor(
      renderedAbc || abcPreviewAbc,
      displayedVoiceKeys,
      voiceIdx,
      abcelem.startChar
    );
    if (!mapped || !mapped.voiceKey) return;
    const voiceKey = mapped.voiceKey;
    const voiceIdxInTune = voiceNames.indexOf(voiceKey);
    if (voiceIdxInTune >= 0 && voiceIdxInTune !== props.voiceIndex) {
      handleVoiceSelect(voiceIdxInTune);
    }
    const textareaEl = textareaRefs.current[voiceKey];
    if (!textareaEl) return;
    const text = textareaEl.value || '';
    const pos = Math.max(0, Math.min(mapped.offset, text.length));
    window.setTimeout(function() {
      const el = textareaRefs.current[voiceKey];
      if (!el) return;
      el.focus();
      el.setSelectionRange(pos, pos);
    }, 0);
  }

  function voiceBodyForKey(voiceKey) {
    if (voiceKey === props.voiceKey) {
      return serializeVoiceEvents(sessionRef.current.events, tuneMeta);
    }
    return voiceNotesForKey(voiceKey);
  }

  function eventsForVoiceKey(voiceKey) {
    return eventsFromVoiceBody(voiceBodyForSession(voiceBodyForKey(voiceKey)), tuneMeta);
  }

  function switchToVoiceKeyIfNeeded(targetKey) {
    const voiceNamesList = props.voiceNames || [];
    const idx = voiceNamesList.indexOf(targetKey);
    if (idx >= 0 && idx !== props.voiceIndex) {
      handleVoiceSelect(idx);
    }
    const keys = displayedVoiceKeysRef.current.length
      ? displayedVoiceKeysRef.current
      : displayedVoiceKeys;
    return Math.max(0, keys.indexOf(targetKey));
  }

  /** Resolve click in target-voice space, switch session, return indices mapped to loaded session. */
  function resolveStaffInteraction(e, analysis, abcelem, renderedAbc) {
    const keys = displayedVoiceKeysRef.current.length
      ? displayedVoiceKeysRef.current
      : displayedVoiceKeys;
    const targetKey = voiceKeyFromStaffAnalysis(keys, analysis, e, props.voiceKey);
    const targetEvents = eventsForVoiceKey(targetKey);
    const fullAbc = renderedAbc || displayAbc;
    const pointerEvent = e && typeof e.clientX === 'number'
      ? e
      : (staffPointerRef.current || e);
    const resolved = resolveStaffClickForVoice({
      targetVoiceKey: targetKey,
      targetEvents: targetEvents,
      displayedVoiceKeys: keys,
      wrapEl: staffWrapRef.current,
      mouseEvent: pointerEvent,
      abcelem: abcelem,
      analysis: analysis,
      tuneMeta: tuneMeta,
      fullAbc: fullAbc,
    });
    const voiceStaffIdx = switchToVoiceKeyIfNeeded(targetKey);
    const s = sessionRef.current;
    if (process.env.NODE_ENV !== 'production') {
      resolverDebugRef.current = {
        source: resolved.source,
        eventIndex: resolved.eventIndex,
        caretIndex: resolved.caretIndex,
        targetVoiceKey: targetKey,
      };
    }
    return { resolved: resolved, targetKey: targetKey, voiceStaffIdx: voiceStaffIdx, session: s };
  }

  function resolveStaffClickFromEditor(e, analysis, abcelem, renderedAbc) {
    return resolveStaffInteraction(e, analysis, abcelem, renderedAbc).resolved;
  }

  function placeNoteInputCaretFromPointer(e, analysis, renderedAbc) {
    const s = sessionRef.current;
    if (s.mode !== EDITOR_MODES.NOTE_INPUT) return false;

    const resolved = resolveStaffClickFromEditor(e, analysis, null, renderedAbc);
    if (!resolved) return false;

    dispatch({ type: 'SET_CARET', index: resolved.caretIndex });
    dispatch({
      type: 'SET_SELECTION',
      selection: { eventIds: [], toneIndex: null, anchorId: null },
    });
    focusStaffEditor();
    return true;
  }

  function staffPointerAnalysis(e) {
    const noteEl = e.target && e.target.closest && e.target.closest('.abcjs-note, .abcjs-rest');
    return noteEl ? { selectableElement: noteEl } : null;
  }

  function measureStaffStepPx(wrap) {
    if (!wrap || !wrap.querySelector) return 14;
    // Prefer adjacent staff-line spacing ÷ 2 (one diatonic step = half a staff space).
    // Note-group getBoundingClientRect tops are ~4px apart here too, but staff lines are stable
    // across glyphs / stems and do not require abcjs-dN (often a fixed "d0-25" class).
    const staff = wrap.querySelector('.abcjs-staff');
    if (staff) {
      const lineEls = Array.from(staff.querySelectorAll('path, line')).filter(function(el) {
        const cls = String(el.className && (el.className.baseVal || el.className) || '');
        // Staff lines are nearly horizontal hairlines.
        const r = el.getBoundingClientRect();
        return r.height <= 3 && r.width > 20 && cls.indexOf('ledger') < 0;
      });
      const tops = lineEls.map(function(el) { return el.getBoundingClientRect().top; })
        .sort(function(a, b) { return a - b; });
      const uniq = [];
      tops.forEach(function(t) {
        if (!uniq.length || Math.abs(t - uniq[uniq.length - 1]) > 2) uniq.push(t);
      });
      if (uniq.length >= 2) {
        let best = null;
        for (let i = 0; i < uniq.length - 1; i += 1) {
          const space = uniq[i + 1] - uniq[i];
          if (space >= 5 && space <= 28) {
            if (best == null || space < best) best = space;
          }
        }
        if (best != null) return best / 2;
      }
      const h = staff.getBoundingClientRect().height;
      if (h > 16) {
        const step = h / 8; // 4 spaces → 8 diatonic steps
        if (step >= 3 && step <= 20) return step;
      }
    }
    // Fallback: notehead centers (ignore stems/ledgers).
    const notes = Array.from(wrap.querySelectorAll('.abcjs-note'));
    const headYs = notes.map(function(n) {
      const paths = Array.from(n.querySelectorAll('path')).filter(function(p) {
        const cls = String(p.className && (p.className.baseVal || p.className) || '');
        return cls.indexOf('stem') < 0 && cls.indexOf('ledger') < 0;
      });
      let best = null;
      paths.forEach(function(p) {
        const r = p.getBoundingClientRect();
        if (r.width < 4 || r.height < 4 || r.height > 16) return;
        const y = r.top + r.height * 0.5;
        if (best == null || r.width > best.w) best = { y: y, w: r.width };
      });
      return best ? best.y : null;
    }).filter(function(y) { return y != null; })
      .sort(function(a, b) { return a - b; });
    for (let i = 0; i < headYs.length - 1; i += 1) {
      const dy = headYs[i + 1] - headYs[i];
      if (dy >= 3 && dy <= 20) return dy;
    }
    return 14;
  }

  function beginStaffMarquee(clientX, clientY, captureEl, pointerId) {
    staffPendingGestureRef.current = null;
    staffDragPointerRef.current = null;
    staffDragTargetRef.current = null;
    setPitchDragPreview(null);
    staffMarqueeRef.current = {
      clientX: clientX,
      clientY: clientY,
      lastClientX: clientX,
      lastClientY: clientY,
    };
    staffDragSuppressClickRef.current = false;
    try {
      if (captureEl && pointerId != null) {
        captureEl.setPointerCapture(pointerId);
      }
    } catch (err) { /* ignore */ }
  }

  function handleStaffWrapPointerMove(e) {
    if (staffPendingGestureRef.current) {
      // Window-level pointermove resolves pending → marquee/pitch.
      return;
    }
    if (staffMarqueeRef.current) {
      staffMarqueeRef.current.lastClientX = e.clientX;
      staffMarqueeRef.current.lastClientY = e.clientY;
      return;
    }
    if (!staffDragPointerRef.current) return;
    staffDragPointerRef.current.lastClientY = e.clientY;
  }

  function handleStaffWrapPointerDown(e) {
    const s = sessionRef.current;
    // Capture-phase listener runs before overlay handles: ignore slur-handle hits
    // so we do not start a vertical pitch drag and steal the gesture.
    if (e && e.target && e.target.closest && e.target.closest('.notation-slur-endpoint-handle')) {
      return;
    }
    if (slurDragRef.current) return;
    if (e && e.target && isStaffHeaderDomTarget(e.target)) {
      staffPendingGestureRef.current = null;
      staffDragPointerRef.current = null;
      staffMarqueeRef.current = null;
      setMarqueeClientRect(null);
      return;
    }
    staffPointerRef.current = { clientX: e.clientX, clientY: e.clientY };
    const pointerAnalysis = staffPointerAnalysis(e);
    if (s.mode !== EDITOR_MODES.NOTE_INPUT) {
      const wrap = staffWrapRef.current;
      if (wrap && wrap.contains(e.target) && e.button === 0) {
        // Already tracking this gesture (pointerdown + mousedown both fire).
        if (staffDragPointerRef.current || staffMarqueeRef.current || staffPendingGestureRef.current) return;

        const keys = displayedVoiceKeysRef.current;
        const targetKey = voiceKeyFromStaffAnalysis(keys, pointerAnalysis, e, props.voiceKey);
        switchToVoiceKeyIfNeeded(targetKey);
        const voiceStaffIdx = Math.max(0, keys.indexOf(targetKey));
        const activeSession = sessionRef.current;
        const resolved = resolveStaffClickFromEditor(e, pointerAnalysis, null, displayAbc);
        let eventId = null;
        if (resolved && resolved.selectedFromNoteHit
          && resolved.eventIndex >= 0 && resolved.eventIndex < activeSession.events.length) {
          const hitEv = activeSession.events[resolved.eventIndex];
          if (hitEv && (hitEv.type === 'note' || hitEv.type === 'chord')) {
            eventId = hitEv.id;
          }
        }
        if (!eventId) {
          eventId = eventIdFromStaffNoteElement(wrap, activeSession.events, e, pointerAnalysis, voiceStaffIdx);
        }
        const noteEl = findStaffClickNoteEl(wrap, pointerAnalysis, e);
        const pitchedEv = eventId
          ? activeSession.events.find(function(ev) { return ev.id === eventId; })
          : null;
        const noteHit = !!(pitchedEv && (pitchedEv.type === 'note' || pitchedEv.type === 'chord'));
        const glyphUnderPointer = !!(noteEl || pitchedEv);
        const modToggle = !!(e.ctrlKey || e.metaKey);
        const modRange = !!e.shiftKey;
        const shiftMarquee = isShiftMarqueeEnabled();
        const coarse = isCoarsePointerEvent(e);
        const staffMarqueeTool = activeSession.staffSelectionTool === STAFF_SELECTION_TOOLS.MARQUEE;
        const desktopShiftMarquee = shiftMarquee && !coarse && !staffMarqueeTool;

        // Shift+drag or marquee tool → marquee anywhere (including over notes).
        if ((modRange || staffMarqueeTool) && e.button === 0) {
          clearStaffLongPress();
          beginStaffMarquee(e.clientX, e.clientY, e.currentTarget, e.pointerId);
          e.preventDefault();
          return;
        }

        // Ctrl/Cmd clicks wait for click handler (toggle) — no gesture capture.
        if (modToggle) {
          clearStaffLongPress();
          staffPendingGestureRef.current = null;
          staffDragPointerRef.current = null;
          staffDragTargetRef.current = null;
          staffMarqueeRef.current = null;
          setPitchDragPreview(null);
          setMarqueeClientRect(null);
          staffDragSuppressClickRef.current = false;
          return;
        }

        if (noteHit) {
          if (staffMarqueeTool) {
            clearStaffLongPress();
            beginStaffMarquee(e.clientX, e.clientY, e.currentTarget, e.pointerId);
            e.preventDefault();
            return;
          }
          const isSelected = !!(activeSession.selection
            && activeSession.selection.eventIds
            && activeSession.selection.eventIds.indexOf(eventId) >= 0);
          const noteheadHit = !!(noteEl && clickHitsNotehead(noteEl, e.clientX, e.clientY));
          const stepPx = measureStaffStepPx(wrap);
          staffMarqueeRef.current = null;
          setMarqueeClientRect(null);
          staffDragPointerRef.current = null;
          staffDragTargetRef.current = null;
          setPitchDragPreview(null);
          staffPendingGestureRef.current = {
            clientX: e.clientX,
            clientY: e.clientY,
            eventId: eventId,
            stepPx: stepPx,
            allowPitch: isSelected && noteheadHit,
          };
          staffDragSuppressClickRef.current = false;
          if (coarse && shiftMarquee) {
            scheduleStaffLongPressMarquee(e, e.currentTarget, e.pointerId);
          }
          try {
            if (e.currentTarget && e.pointerId != null) {
              e.currentTarget.setPointerCapture(e.pointerId);
            }
          } catch (err) { /* ignore */ }
          return;
        }

        // On a glyph we couldn't map to a pitched event (rest / bar / miss) — do not
        // start marquee; let click selection handle it.
        if (glyphUnderPointer) {
          staffPendingGestureRef.current = null;
          staffDragPointerRef.current = null;
          staffDragTargetRef.current = null;
          staffMarqueeRef.current = null;
          setPitchDragPreview(null);
          setMarqueeClientRect(null);
          return;
        }

        // Empty staff / gap.
        if (desktopShiftMarquee) {
          clearStaffLongPress();
          staffMarqueeRef.current = null;
          setMarqueeClientRect(null);
          staffDragPointerRef.current = null;
          staffDragTargetRef.current = null;
          setPitchDragPreview(null);
          staffPendingGestureRef.current = {
            clientX: e.clientX,
            clientY: e.clientY,
            eventId: null,
            stepPx: 0,
            allowPitch: false,
            emptyGap: true,
          };
          staffDragSuppressClickRef.current = false;
          try {
            if (e.currentTarget && e.pointerId != null) {
              e.currentTarget.setPointerCapture(e.pointerId);
            }
          } catch (err) { /* ignore */ }
          return;
        }
        if (coarse && shiftMarquee) {
          scheduleStaffLongPressMarquee(e, e.currentTarget, e.pointerId);
          e.preventDefault();
          return;
        }
        // Legacy: empty staff drag starts marquee immediately.
        beginStaffMarquee(e.clientX, e.clientY, e.currentTarget, e.pointerId);
        e.preventDefault();
      }
      return;
    }

    staffPendingGestureRef.current = null;
    staffDragPointerRef.current = null;
    staffMarqueeRef.current = null;
    setPitchDragPreview(null);
    setMarqueeClientRect(null);

    const wrap = staffWrapRef.current;
    if (!wrap || !wrap.contains(e.target)) return;

    if (e.button === 2) {
      e.preventDefault();
      e.stopPropagation();
      const resolved = resolveStaffClickFromEditor(e, pointerAnalysis, null, null);
      const idx = resolved ? resolved.caretIndex : s.caretIndex;
      applyEvents(insertRestAtCaret(Object.assign({}, s, { caretIndex: idx })), EDITOR_VIEWS.STAFF, 'Insert rest');
      staffInputHandledRef.current = true;
      return;
    }

    if (e.button !== 0) return;

    if (e.shiftKey && s.selection.anchorId) {
      return;
    }

    if (placeNoteInputCaretFromPointer(e, null, null)) {
      staffInputHandledRef.current = true;
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function openSignatureDialogFromStaffClick(abcelem, mouseEvent, renderedAbc, domKind) {
    const headerType = abcelem && (abcelem.el_type || abcelem.type);
    const signatureHeaderTypes = ['keySignature', 'timeSignature', 'key', 'meter'];
    let kind = domKind;
    if (!kind) {
      if (headerType === 'clef') kind = 'clef';
      else if (headerType === 'timeSignature' || headerType === 'meter') kind = 'meter';
      else if (headerType === 'keySignature' || headerType === 'key') kind = 'key';
    }
    if (!kind || kind === 'tempo') return false;

    staffPendingGestureRef.current = null;
    staffMarqueeRef.current = null;
    setMarqueeClientRect(null);
    setStaffInsertAnchor(null);
    staffDragPointerRef.current = null;
    staffDragTargetRef.current = null;
    staffDragSuppressClickRef.current = true;
    window.setTimeout(function() { staffDragSuppressClickRef.current = false; }, 50);

    if (kind !== 'clef') {
      const voiceStaffIdx = Math.max(0, displayedVoiceKeysRef.current.indexOf(props.voiceKey));
      const inlineEv = inlineSignatureEventAtStaffClick(
        sessionRef.current.events,
        tuneMeta,
        renderedAbc,
        displayedVoiceKeysRef.current,
        voiceStaffIdx,
        abcelem
      );
      if (inlineEv) {
        setInlineSigModal({
          kind: inlineEv.type === 'keyChange' ? 'key' : 'meter',
          eventId: inlineEv.id,
          initialKey: inlineEv.key,
          initialMeter: inlineEv.meter,
        });
        return true;
      }
    }
    setTuneMetaFocus(kind === 'clef' ? 'clef' : kind === 'meter' ? 'meter' : 'key');
    setShowTuneMeta(true);
    return true;
  }

  function handleStaffClick(abcelem, tuneNumber, classes, analysis, drag, mouseEvent, renderedAbc) {
    const domKind = staffHeaderKindFromDomTarget(mouseEvent && mouseEvent.target);
    if (domKind && domKind !== 'tempo') {
      if (openSignatureDialogFromStaffClick(abcelem, mouseEvent, renderedAbc, domKind)) return;
    }
    const headerType = abcelem && (abcelem.el_type || abcelem.type);
    const signatureHeaderTypes = ['keySignature', 'timeSignature', 'key', 'meter'];
    if (headerType && (headerType === 'clef' || signatureHeaderTypes.indexOf(headerType) >= 0)) {
      if (openSignatureDialogFromStaffClick(abcelem, mouseEvent, renderedAbc, null)) return;
    }
    if (headerType && ['tempo', 'part'].indexOf(headerType) >= 0) {
      return;
    }
    staffPendingGestureRef.current = null;
    if (staffDragSuppressClickRef.current) {
      staffDragSuppressClickRef.current = false;
      staffDragPointerRef.current = null;
      staffDragTargetRef.current = null;
      staffMarqueeRef.current = null;
      setPitchDragPreview(null);
      return;
    }
    // Window pointerup commits pitch/marquee. Never clear an active drag pin here —
    // that raced pointerup and dropped live-drag commits.
    if (staffMarqueeRef.current) {
      return;
    }
    if (staffDragPointerRef.current) {
      if (pitchDragPreview) {
        return;
      }
      staffDragPointerRef.current = null;
      staffDragTargetRef.current = null;
    }
    const interaction = resolveStaffInteraction(mouseEvent, analysis, abcelem, renderedAbc);
    const s = interaction.session;
    const resolved = interaction.resolved;
    const voiceStaffIdx = interaction.voiceStaffIdx;
    const idx = resolved.eventIndex;
    const ev = resolveClickedNoteEvent(resolved, s.events, abcelem);
    if (process.env.NODE_ENV !== 'production') {
      resolverDebugRef.current = Object.assign({}, resolverDebugRef.current || {}, {
        selectedFromNoteHit: !!resolved.selectedFromNoteHit,
        mode: s.mode,
      });
    }
    if (s.slurMode && ev) {
      const slurPatch = handleSlurModeClick(s, ev.id);
      if (slurPatch && slurPatch.events) {
        applyEvents(slurPatch, EDITOR_VIEWS.STAFF, 'Slur');
      } else if (slurPatch) {
        dispatch({ type: 'SET_SLUR_PENDING', id: slurPatch.slurPendingStartId });
      }
      return;
    }
    if (s.mode === EDITOR_MODES.NOTE_INPUT) {
      if (staffInputHandledRef.current) {
        staffInputHandledRef.current = false;
        return;
      }
      if (mouseEvent && mouseEvent.shiftKey && s.selection.anchorId) {
        const targetEv = ev || (idx > 0 ? s.events[idx - 1] : null);
        const ids = selectEventRange(s.events, s.selection.anchorId, targetEv && targetEv.id);
        dispatch({ type: 'SET_SELECTION', selection: { eventIds: ids, toneIndex: null, anchorId: s.selection.anchorId } });
        clearSelectionClickRects();
        focusStaffEditor();
        staffInputHandledRef.current = true;
        return;
      }
      if (mouseEvent && mouseEvent.button === 2) {
        return;
      }
      if (abcelem && abcelem.midi != null) {
        const pitch = pitchFromMidi(abcelem.midi, tuneMeta);
        let beat = null;
        const clickEv = resolveClickedNoteEvent(resolved, s.events, abcelem);
        if (clickEv && typeof clickEv.startBeat === 'number') {
          beat = clickEv.startBeat;
        } else if (idx >= 0 && idx < s.events.length && typeof s.events[idx].startBeat === 'number') {
          beat = s.events[idx].startBeat;
        }
        if (beat != null) {
          const patch = writeNoteAtBeat(s, beat, pitch, {
            addChordTone: !!(mouseEvent && mouseEvent.shiftKey),
          });
          if (patch) {
            applyEvents(patch, EDITOR_VIEWS.STAFF, 'Insert note');
          }
          staffInputHandledRef.current = true;
          focusStaffEditor();
          return;
        }
      }
      placeNoteInputCaretFromPointer(mouseEvent, analysis, renderedAbc);
      return;
    }

    const wrap = staffWrapRef.current;
    const barEv = (!ev && mouseEvent)
      ? findBarlineEventAtClick(wrap, s.events, mouseEvent, voiceStaffIdx)
      : null;
    const targetEv = ev
      || barEv
      || (idx >= 0 && idx < s.events.length ? s.events[idx] : null);

    if (mouseEvent && mouseEvent.detail >= 2 && targetEv && targetEv.id) {
      // Double-click: select containing measure (MuseScore-style).
      const ids = selectMeasureContaining(s.events, targetEv.id);
      if (ids.length) {
        dispatch({
          type: 'SET_SELECTION',
          selection: { eventIds: ids, toneIndex: null, anchorId: targetEv.id },
        });
        clearSelectionClickRects();
        setCaretIndex(s.events.findIndex(function(x) { return x.id === targetEv.id; }));
        focusStaffEditor();
      }
      return;
    }

    if (mouseEvent && (mouseEvent.ctrlKey || mouseEvent.metaKey) && targetEv
      && (targetEv.type === 'note' || targetEv.type === 'chord' || targetEv.type === 'barline' || targetEv.type === 'rest')) {
      const nextSel = toggleSelectionEventId(s.selection, targetEv.id);
      dispatch({ type: 'SET_SELECTION', selection: nextSel });
      clearSelectionClickRects();
      focusStaffEditor();
      return;
    }

    // Touch / coarse pointers have no Shift/Ctrl: tap toggles notes into the selection
    // once one note is already selected (same as Ctrl+click on desktop).
    const coarseOrTouch = !!(mouseEvent && (
      mouseEvent.pointerType === 'touch'
      || (typeof window !== 'undefined'
        && window.matchMedia
        && window.matchMedia('(pointer: coarse)').matches)
    ));
    if (
      coarseOrTouch
      && targetEv
      && (targetEv.type === 'note' || targetEv.type === 'chord' || targetEv.type === 'rest')
      && s.selection
      && s.selection.eventIds
      && s.selection.eventIds.length > 0
    ) {
      const nextSel = toggleSelectionEventId(s.selection, targetEv.id);
      dispatch({ type: 'SET_SELECTION', selection: nextSel });
      clearSelectionClickRects();
      if (nextSel.eventIds.indexOf(targetEv.id) >= 0
        && (targetEv.type === 'note' || targetEv.type === 'chord')) {
        auditionEvent(targetEv, null, abcelem && abcelem.midi);
      }
      focusStaffEditor();
      return;
    }

    if (mouseEvent && mouseEvent.shiftKey && s.selection.anchorId) {
      const rangeTarget = targetEv || (idx > 0 ? s.events[idx - 1] : null);
      const ids = selectEventRange(s.events, s.selection.anchorId, rangeTarget && rangeTarget.id);
      dispatch({
        type: 'SET_SELECTION',
        selection: { eventIds: ids, toneIndex: null, anchorId: s.selection.anchorId },
      });
      clearSelectionClickRects();
      focusStaffEditor();
      return;
    }

    if (barEv) {
      const measureIds = selectMeasureContaining(s.events, barEv.id);
      if (measureIds.length) {
        dispatch({
          type: 'SET_SELECTION',
          selection: { eventIds: measureIds, toneIndex: null, anchorId: barEv.id },
        });
      } else {
        dispatch({
          type: 'SET_SELECTION',
          selection: { eventIds: [barEv.id], toneIndex: null, anchorId: barEv.id },
        });
      }
      clearSelectionClickRects();
      setCaretIndex(s.events.findIndex(function(x) { return x.id === barEv.id; }));
      focusStaffEditor();
      return;
    }

    if (!ev || (ev.type !== 'note' && ev.type !== 'chord')) {
      const insertPos = caretIndexAndAnchorFromStaffClick(
        wrap,
        s.events,
        mouseEvent,
        analysis,
        voiceStaffIdx
      );
      const caretIdx = insertPos && typeof insertPos.caretIndex === 'number'
        ? insertPos.caretIndex
        : resolved.caretIndex;
      setInsertCaret(caretIdx, insertPos && insertPos.anchor ? insertPos.anchor : null);
      clearSelectionClickRects();
      dispatch({ type: 'SET_SELECTION', selection: { eventIds: [], toneIndex: null, anchorId: null } });
      focusStaffEditor();
      return;
    }

    const startMs = abcElemStartMs(abcelem);
    applyStaffPitchedNoteSelection(ev, s, idx, startMs);
    auditionEvent(ev, null, abcelem && abcelem.midi);
    focusStaffEditor();
    return;
  }

  function handleSlurHandlePointerDown(e, which, slurGroup) {
    if (!e || !slurGroup) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    // Cancel any pitch/marquee gesture the wrap capture listener may have started.
    staffDragPointerRef.current = null;
    staffDragTargetRef.current = null;
    staffMarqueeRef.current = null;
    setPitchDragPreview(null);
    setMarqueeClientRect(null);
    const fixedId = which === 'start' ? slurGroup.endId : slurGroup.startId;
    slurDragRef.current = {
      fixedId: fixedId,
      movingEnd: which,
      groupId: slurGroup.groupId,
      snapId: which === 'start' ? slurGroup.startId : slurGroup.endId,
    };
    setSlurSnapEventId(slurDragRef.current.snapId);
    staffDragSuppressClickRef.current = true;
    if (e.currentTarget && e.currentTarget.setPointerCapture && e.pointerId != null) {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }

    function onMove(ev) {
      const drag = slurDragRef.current;
      if (!drag) return;
      ev.preventDefault();
      const wrap = staffWrapRef.current;
      const s = sessionRef.current;
      if (!wrap || !s) return;
      const voiceStaffIdx = Math.max(0, displayedVoiceKeysRef.current.indexOf(props.voiceKey));
      const hitId = eventIdFromStaffNoteElement(wrap, s.events, ev, null, voiceStaffIdx);
      if (!hitId || hitId === drag.fixedId) return;
      const hitEv = s.events.find(function(x) { return x.id === hitId; });
      if (!hitEv || (hitEv.type !== 'note' && hitEv.type !== 'chord')) return;
      drag.snapId = hitId;
      setSlurSnapEventId(hitId);
    }

    function onUp(ev) {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('mouseup', onUp, true);
      const drag = slurDragRef.current;
      slurDragRef.current = null;
      setSlurSnapEventId(null);
      window.setTimeout(function() { staffDragSuppressClickRef.current = false; }, 50);
      if (!drag || !drag.snapId || drag.snapId === drag.fixedId) return;
      const s = sessionRef.current;
      const patch = reassignSlurEndpoints(s, drag.fixedId, drag.snapId, drag.groupId);
      if (patch) applyEvents(patch, EDITOR_VIEWS.STAFF, 'Move slur end');
    }

    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('mouseup', onUp, true);
  }

  function handleAbcTextChange(voiceKey, value) {
    abcEditingRef.current = true;
    abcDraftRef.current = value;
    setAbcDraft(value);
    setAbcDrafts(function(prev) {
      return Object.assign({}, prev, { [voiceKey]: value });
    });
    clearTimeout(abcSaveDebounce.current);
    abcSaveDebounce.current = setTimeout(function() {
      skipExternalLoad.current = true;
      props.onVoiceNotesChange(voiceKey, value, 'Edit ABC text');
      if (voiceKey === props.voiceKey) {
        const parsed = eventsFromVoiceBody(value, tuneMeta);
        dispatch({
          type: 'SET_EVENTS',
          events: parsed,
          sourceView: EDITOR_VIEWS.ABC,
        });
      }
      abcEditingRef.current = false;
    }, 300);
  }

  function voiceNotesForKey(voiceKey) {
    if (voiceKey === props.voiceKey) return props.voiceNotes || '';
    const voice = props.tune && props.tune.voices && props.tune.voices[voiceKey];
    if (!voice) return '';
    return Array.isArray(voice.notes) ? voice.notes.join('\n') : String(voice.notes || '');
  }

  function handleDisplayedVoicesChange(indices) {
    const nextIndices = Array.isArray(indices) ? indices.slice().sort(function(a, b) { return a - b; }) : [];
    setDisplayedVoiceIndices(nextIndices);
    const voiceNamesList = props.voiceNames || [];
    const activeVoices = nextIndices
      .map(function(vi) { return voiceNamesList[vi]; })
      .filter(Boolean);
    if (props.onActiveVoicesChange) props.onActiveVoicesChange(activeVoices);
  }

  function handleVoiceSelect(index) {
    if (index === props.voiceIndex) return;
    const leavingVoiceKey = props.voiceKey;
    // ABC Notes is source of truth for its textarea; staff/roll commit via events.
    // Always running flushCommit after ABC edits used to drop chord symbols and
    // other text the event model did not round-trip.
    if (sessionRef.current.view === EDITOR_VIEWS.ABC) {
      flushAbcDraft(leavingVoiceKey);
    } else {
      flushCommit(leavingVoiceKey);
    }
    const voiceNamesList = props.voiceNames || [];
    const newKey = voiceNamesList[index];
    if (newKey) {
      const voiceBody = voiceBodyForSession(voiceNotesForKey(newKey));
      skipExternalLoad.current = true;
      dispatch({ type: 'LOAD_VOICE', tuneMeta: tuneMeta, voiceBody: voiceBody });
    }
    if (props.onVoiceSelect) props.onVoiceSelect(index);
  }

  function handleNotationViewChange(nextView) {
    if (typeof props.onEditorViewChange === 'function') {
      props.onEditorViewChange(notationViewToEditorViewMode(nextView));
      return;
    }
    dispatch({ type: 'SET_VIEW', view: nextView });
  }

  function insertLayout(actionFn, label) {
    const s = sessionWithEditSelection(sessionRef.current);
    const prepared = sessionForCaretInsert(s);
    const patch = actionFn(prepared, prepared.caretIndex);
    if (patch) applyEvents(patchAfterLayoutInsert(s, patch), s.view, label);
  }

  function openInlineSignatureModal(kind) {
    const s = sessionWithEditSelection(sessionRef.current);
    const sel = s.selection && s.selection.eventIds ? s.selection.eventIds : [];
    if (sel.length === 1) {
      const ev = s.events.find(function(e) { return e.id === sel[0]; });
      if (kind === 'key' && ev && ev.type === 'keyChange') {
        setInlineSigModal({ kind: 'key', eventId: ev.id, initialKey: ev.key });
        return;
      }
      if (kind === 'meter' && ev && ev.type === 'meterChange') {
        setInlineSigModal({ kind: 'meter', eventId: ev.id, initialMeter: ev.meter });
        return;
      }
    }
    setInlineSigModal({ kind: kind });
  }

  function applyInlineSignature(value) {
    const modal = inlineSigModal;
    if (!modal) return;
    const s = sessionWithEditSelection(sessionRef.current);
    let patch = null;
    let label = modal.kind === 'key' ? 'Key change' : 'Time signature change';
    if (modal.eventId) {
      patch = modal.kind === 'key'
        ? updateKeyChangeEvent(s, modal.eventId, value)
        : updateMeterChangeEvent(s, modal.eventId, value);
      label = modal.kind === 'key' ? 'Edit key change' : 'Edit time signature change';
    } else {
      const prepared = sessionForCaretInsert(s);
      patch = modal.kind === 'key'
        ? insertKeyChangeAtCaret(prepared, value, prepared.caretIndex)
        : insertMeterChangeAtCaret(prepared, value, prepared.caretIndex);
      patch = patchAfterLayoutInsert(s, patch);
      label = modal.kind === 'key' ? 'Insert key change' : 'Insert time signature change';
    }
    if (patch) applyEvents(patch, s.view, label);
    setInlineSigModal(null);
  }

  function handleToggleTie() {
    const patch = toggleTie(sessionWithEditSelection(sessionRef.current));
    if (patch) applyEvents(patch, EDITOR_VIEWS.STAFF, 'Toggle tie');
  }

  function handleMarkAction(key) {
    const s = sessionWithEditSelection(sessionRef.current);
    if (key === '_tie') {
      handleToggleTie();
      return;
    }
    if (key === '_slurMode') {
      if (s.slurMode) {
        dispatch({ type: 'SET_SLUR_MODE', value: false });
        return;
      }
      const result = applySlurFromSelection(s);
      if (result && result.events) {
        applyEvents(result, EDITOR_VIEWS.STAFF, 'Slur');
        return;
      }
      if (result && result.enterMode) {
        if (result.pendingStartId) {
          dispatch({ type: 'SET_SLUR_PENDING', id: result.pendingStartId });
        }
        dispatch({ type: 'SET_SLUR_MODE', value: true });
      }
      return;
    }
    if (key === '_clearSlur') {
      const patch = clearSlurOnSelection(s);
      if (patch) applyEvents(patch, EDITOR_VIEWS.STAFF, 'Clear slur');
      return;
    }
    if (key === '_graceAcci') {
      const patch = insertGraceBeforeSelection(s, true);
      if (patch) applyEvents(patch, EDITOR_VIEWS.STAFF, 'Grace note');
      return;
    }
    if (key === '_graceApp') {
      const patch = insertGraceBeforeSelection(s, false);
      if (patch) applyEvents(patch, EDITOR_VIEWS.STAFF, 'Grace note');
      return;
    }
    if (isFingerDecorationKey(key)) {
      const patch = setFingerOnSelection(s, key);
      if (patch) applyEvents(patch, EDITOR_VIEWS.STAFF, 'Fingering');
      return;
    }
    const patch = toggleDecoration(s, key);
    if (patch) applyEvents(patch, EDITOR_VIEWS.STAFF, 'Toggle mark');
  }

  function clearChordSymbolOnSelection() {
    const s = sessionWithEditSelection(sessionRef.current);
    const patch = setChordSymbolOnSelection(s, '');
    if (patch) applyEvents(patch, EDITOR_VIEWS.STAFF, 'Clear chord symbol');
  }

  function openAnnotEditor(mode) {
    const s = sessionWithEditSelection(sessionRef.current);
    const ids = (s.selection && s.selection.eventIds) || [];
    let eventId = ids[0];
    if (!eventId && s.caretIndex > 0) {
      const prev = s.events[s.caretIndex - 1];
      if (prev && (prev.type === 'note' || prev.type === 'chord' || prev.type === 'rest')) {
        eventId = prev.id;
      }
    }
    if (!eventId) return;
    const ev = s.events.find(function(e) { return e.id === eventId; });
    if (!ev) return;
    let value = '';
    if (mode === 'chord') {
      value = (ev.chordSymbols && ev.chordSymbols[0]) || '';
    } else {
      value = fingeringLabelFromEvent(ev);
    }
    let left = 24;
    let top = 24;
    try {
      const rects = selectionRectsForEventIds(
        staffWrapRef.current,
        s.events,
        [eventId],
        typeof activeVoiceStaffIndex === 'number' ? activeVoiceStaffIndex : 0
      );
      if (rects && rects[0]) {
        left = rects[0].left;
        top = Math.max(0, rects[0].top - 28);
      }
    } catch (err) { /* position fallback */ }
    dispatch({
      type: 'SET_SELECTION',
      selection: { eventIds: [eventId], toneIndex: null, anchorId: eventId },
    });
    setAnnotEdit({ mode: mode, value: value, eventId: eventId, left: left, top: top });
  }

  function clearAnnotEdit() {
    const edit = annotEdit;
    if (!edit) return;
    const s = Object.assign({}, sessionRef.current, {
      selection: { eventIds: [edit.eventId], toneIndex: null, anchorId: edit.eventId },
    });
    let patch = null;
    if (edit.mode === 'chord') {
      patch = setChordSymbolOnSelection(s, '');
    } else {
      patch = setFingerOnSelection(s, null);
    }
    if (patch) {
      applyEvents(patch, EDITOR_VIEWS.STAFF, edit.mode === 'chord' ? 'Clear chord symbol' : 'Clear fingering');
    }
    setAnnotEdit(null);
  }

  function commitAnnotEdit(options) {
    const opts = options || {};
    const edit = annotEdit;
    if (!edit) return;
    const s = Object.assign({}, sessionRef.current, {
      selection: { eventIds: [edit.eventId], toneIndex: null, anchorId: edit.eventId },
    });
    let patch = null;
    if (edit.mode === 'chord') {
      patch = setChordSymbolOnSelection(s, edit.value);
    } else {
      patch = setFingerOnSelection(s, String(edit.value || '').trim());
    }
    if (patch) {
      if (opts.advance) {
        const advanced = advanceSelectionToNextNote(Object.assign({}, s, patch));
        applyEvents(Object.assign({}, patch, {
          caretIndex: advanced.caretIndex,
          selection: advanced.selection,
        }), EDITOR_VIEWS.STAFF, edit.mode === 'chord' ? 'Chord symbol' : 'Fingering');
        const nextId = advanced.selection && advanced.selection.eventIds && advanced.selection.eventIds[0];
        if (nextId) {
          const nextEv = advanced.events
            ? advanced.events.find(function(e) { return e.id === nextId; })
            : sessionRef.current.events.find(function(e) { return e.id === nextId; });
          let value = '';
          if (edit.mode === 'chord') {
            value = (nextEv && nextEv.chordSymbols && nextEv.chordSymbols[0]) || '';
          } else {
            value = fingeringLabelFromEvent(nextEv);
          }
          setAnnotEdit(Object.assign({}, edit, { eventId: nextId, value: value }));
          return;
        }
      } else {
        applyEvents(patch, EDITOR_VIEWS.STAFF, edit.mode === 'chord' ? 'Chord symbol' : 'Fingering');
      }
    }
    setAnnotEdit(null);
  }

  function handleTupletAction(action) {
    const s = sessionWithEditSelection(sessionRef.current);
    if (action === '_endTuplet') {
      const patch = clearTupletModeAndSelection(s);
      if (patch && patch.events) {
        applyEvents(patch, EDITOR_VIEWS.STAFF, 'End tuplet');
      } else {
        dispatch({ type: 'SET_TUPLET_MODE', tupletMode: null });
      }
      return;
    }
    if (action === '_beamBreak') {
      const patch = setBeamBreakBeforeSelection(s);
      if (patch) applyEvents(patch, EDITOR_VIEWS.STAFF, 'Beam break');
      return;
    }
    const noteSelCount = ((s.selection && s.selection.eventIds) || []).filter(function(id) {
      const ev = s.events.find(function(e) { return e.id === id; });
      return ev && (ev.type === 'note' || ev.type === 'chord' || ev.type === 'rest');
    }).length;

    function startOrApplyTuplet(preset) {
      if (noteSelCount >= 2) {
        const patch = applyTupletToSelection(s, preset);
        if (patch) applyEvents(patch, EDITOR_VIEWS.STAFF, 'Apply tuplet');
        return;
      }
      dispatch({
        type: 'SET_TUPLET_MODE',
        tupletMode: {
          num: preset.num,
          den: preset.den,
          groupId: createEventId('tup'),
          notesEntered: 0,
          size: preset.size || preset.num,
        },
      });
      if (s.mode !== EDITOR_MODES.NOTE_INPUT) {
        dispatch({ type: 'SET_MODE', mode: EDITOR_MODES.NOTE_INPUT });
      }
    }

    if (action === '_triplet') {
      startOrApplyTuplet({ num: 3, den: 2, size: 3 });
      return;
    }
    if (action === '_graceAcci') {
      const patch = insertGraceBeforeSelection(s, true);
      if (patch) applyEvents(patch, EDITOR_VIEWS.STAFF, 'Grace note');
      return;
    }
    if (action === '_graceApp') {
      const patch = insertGraceBeforeSelection(s, false);
      if (patch) applyEvents(patch, EDITOR_VIEWS.STAFF, 'Grace note');
      return;
    }
    if (action && action.num) {
      startOrApplyTuplet(action);
    }
  }

  function handleToggleRecord() {
    const s = sessionRef.current;
    if (s.midiRecordActive) {
      dispatch({ type: 'SET_MIDI_RECORD', active: false, buffer: midiRecordBufferRef.current });
      return;
    }
    midiRecordBufferRef.current = [];
    dispatch({ type: 'SET_MIDI_RECORD', active: true, buffer: [] });
  }

  function handleApplyRecord() {
    const s = sessionRef.current;
    const baseOpts = s.lastQuantizeOptions || {
      strength: 1,
      slotsPerBeat: s.snapSlotsPerBeat || 4,
      quantizeStart: true,
      quantizeDuration: true,
    };
    const result = midiRecordBufferToEvents(midiRecordBufferRef.current, s, baseOpts);
    applyEvents(Object.assign({}, s, result), EDITOR_VIEWS.STAFF, 'MIDI record');
    midiRecordBufferRef.current = [];
    dispatch({ type: 'SET_MIDI_RECORD', active: false, buffer: [] });
  }

  function handleDiscardRecord() {
    midiRecordBufferRef.current = [];
    dispatch({ type: 'SET_MIDI_RECORD', active: false, buffer: [] });
  }

  const pendingRecordCount = (session.midiRecordBuffer || []).filter(function(n) {
    return n.endMs != null;
  }).length;

  const liveVoiceBody = useMemo(function() {
    return serializeVoiceEvents(session.events, tuneMeta);
  }, [session.events, tuneMeta]);

  const displayedVoiceKeys = useMemo(function() {
    const voiceNames = props.voiceNames || [];
    return displayedVoiceIndices
      .map(function(vi) { return voiceNames[vi]; })
      .filter(Boolean);
  }, [props.voiceNames, displayedVoiceIndices]);

  useEffect(function() {
    displayedVoiceKeysRef.current = displayedVoiceKeys;
  }, [displayedVoiceKeys]);

  function voiceBodyForDisplay(voiceKey) {
    if (session.view === EDITOR_VIEWS.ABC) {
      if (abcDrafts[voiceKey] != null) return abcDrafts[voiceKey];
      return voiceNotesForKey(voiceKey);
    }
    // Active voice must always match serializeVoiceEvents(session.events) so
    // abcjs startChar offsets map to the same tokens as the session model.
    if (voiceKey === props.voiceKey) {
      return liveVoiceBody;
    }
    return voiceNotesForKey(voiceKey);
  }

  const displayedVoiceBodiesKey = useMemo(function() {
    return displayedVoiceKeys.map(function(vk) {
      return vk + '\u0001' + voiceBodyForDisplay(vk);
    }).join('\u0002');
  }, [
    displayedVoiceKeys,
    liveVoiceBody,
    props.voiceKey,
    abcDrafts,
    props.voiceNotes,
    session.view,
    session.dirty,
    props.tune,
  ]);

  const displayAbc = useMemo(function() {
    const bodies = {};
    displayedVoiceKeys.forEach(function(vk) {
      bodies[vk] = voiceBodyForDisplay(vk);
    });
    const staffPlaceholder = session.view === EDITOR_VIEWS.STAFF || session.view === EDITOR_VIEWS.SPLIT;
    return buildAbcPreviewFromBodies(props.tune, props.tunebook, displayedVoiceKeys, bodies, {
      staffPlaceholder: staffPlaceholder,
    });
  }, [props.tune, props.tunebook, displayedVoiceKeys, displayedVoiceBodiesKey, session.view]);

  const liveBodiesForCheck = useMemo(function() {
    const bodies = {};
    const voiceNames = props.voiceNames || [];
    voiceNames.forEach(function(vk) {
      bodies[vk] = voiceBodyForDisplay(vk);
    });
    return bodies;
  }, [displayedVoiceBodiesKey, props.voiceNames, props.voiceKey, liveVoiceBody, abcDrafts, props.voiceNotes, session.view, session.dirty, props.tune]);

  const parseAndRenderAbc = useCallback(function(abc) {
    const parsed = abcjsParser.parse(abc);
    return abcjsParser.render(parsed, abc);
  }, [abcjsParser]);

  const notationCheck = useNotationCheck(props.tune, liveBodiesForCheck, {
    abcTools: props.tunebook && props.tunebook.abcTools,
    hasChords: props.tunebook && props.tunebook.abcTools
      ? props.tunebook.abcTools.hasChords.bind(props.tunebook.abcTools)
      : null,
    parseAndRender: parseAndRenderAbc,
    skipRenderAbc: true,
  });

  const handleNavigateIssue = useCallback(function(issueItem) {
    if (!issueItem) return;
    const s = sessionRef.current;
    if (issueItem.barIndex != null) {
      const beat = (issueItem.barIndex - 1) * beatsPerBarFromMeter(tuneMeta.meter);
      setCaretIndex(caretIndexForStartBeat(s.events, beat));
      return;
    }
    if (issueItem.lineIndex != null && session.view === EDITOR_VIEWS.ABC) {
      const ta = textareaRefs.current[props.voiceKey];
      if (ta) ta.focus();
    }
  }, [tuneMeta.meter, props.voiceKey]);

  const handleFixTuneSaved = useCallback(function(nextTune) {
    if (!props.tunebook || !nextTune) return;
    props.tunebook.saveTune(nextTune, false, { historyLabel: 'Notation fix', immediate: true });
    if (props.forceRefresh) props.forceRefresh();
    notationCheck.refresh();
  }, [props.tunebook, props.forceRefresh, notationCheck]);

  const abcPreviewAbc = displayAbc;

  const backgroundPianoRollEvents = useMemo(function() {
    const voiceNames = props.voiceNames || [];
    const activeIndex = props.voiceIndex || 0;
    let merged = [];
    displayedVoiceIndices.forEach(function(vi) {
      if (vi === activeIndex) return;
      const vk = voiceNames[vi];
      if (!vk) return;
      const body = voiceBodyForDisplay(vk);
      merged = merged.concat(eventsFromVoiceBody(body, tuneMeta));
    });
    return merged;
  }, [
    displayedVoiceIndices,
    props.voiceIndex,
    props.voiceNames,
    props.voiceKey,
    liveVoiceBody,
    abcDrafts,
    props.voiceNotes,
    tuneMeta,
    session.dirty,
    session.view,
  ]);

  const voiceNames = props.voiceNames || [];
  const isStaffView = session.view === EDITOR_VIEWS.STAFF;
  const isSplitView = session.view === EDITOR_VIEWS.SPLIT;
  const isPianoRollView = session.view === EDITOR_VIEWS.PIANO_ROLL;
  const isStaffLikeView = isStaffView || isSplitView;
  const isPianoRollVisible = isPianoRollView || isSplitView;
  const isAbcView = session.view === EDITOR_VIEWS.ABC;

  useLayoutEffect(function() {
    const mc = props.mediaController;
    if (!mc || !mc.setNotationMidiOwner) return undefined;
    mc.setNotationMidiOwner(true);
    return function() {
      mc.setNotationMidiOwner(false);
      if (mc.clearNotationPlayRetry) mc.clearNotationPlayRetry();
    };
  }, [props.mediaController]);

  const resolvePlaybackContext = useCallback(function() {
    const s = sessionRef.current;
    if (s.view !== EDITOR_VIEWS.ABC) return null;
    return {
      view: 'abc',
      getAbcCaretIndex: function() {
        const vk = props.voiceKey;
        const ta = textareaRefs.current[vk];
        if (!ta) return null;
        const events = eventsFromVoiceBody(voiceBodyForSession(ta.value || ''), tuneMeta);
        return {
          caretIndex: eventIndexFromAbcCharPosition(events, tuneMeta, ta.selectionStart),
          events: events,
        };
      },
    };
  }, [props.voiceKey, tuneMeta]);

  function syncAbcCaretFromTextarea(voiceKey) {
    if (voiceKey !== props.voiceKey) return;
    const ta = textareaRefs.current[voiceKey];
    if (!ta) return;
    const events = eventsFromVoiceBody(voiceBodyForSession(ta.value || ''), tuneMeta);
    const caretIndex = eventIndexFromAbcCharPosition(events, tuneMeta, ta.selectionStart);
    setCaretIndex(caretIndex);
  }

  function handlePianoRollSelect(eventId, opts) {
    const s = sessionRef.current;
    const eventIds = opts && opts.eventIds ? opts.eventIds : [eventId];
    const ev = s.events.find(function(x) { return x.id === eventId; });
    const caretIndex = ev ? caretIndexForStartBeat(s.events, ev.startBeat || 0) : s.caretIndex;
    clearSelectionClickRects();
    dispatch({
      type: 'SET_SELECTION',
      selection: { eventIds: eventIds, toneIndex: null, anchorId: eventId },
    });
    setCaretIndex(caretIndex);
    const wrap = staffWrapRef.current;
    if (wrap) {
      syncStaffSelectionHighlight(
        wrap,
        s.events,
        eventIds,
        activeVoiceStaffIndex
      );
    }
  }

  function handlePianoRollAlign(action) {
    const s = sessionRef.current;
    const ids = s.selection.eventIds || [];
    let next = s.events;

    if (action === 'slideSelection') {
      const selected = ids.length
        ? next.filter(function(ev) { return ids.indexOf(ev.id) >= 0; })
        : next.filter(function(ev) { return ev.type === 'note' || ev.type === 'chord'; });
      if (selected.length) {
        const start = Math.min.apply(null, selected.map(function(ev) { return ev.startBeat || 0; }));
        const end = Math.max.apply(null, selected.map(function(ev) {
          return (ev.startBeat || 0) + (ev.durationBeats || 0);
        }));
        next = slideSelection(next, start, end, 0.25, tuneMeta);
      }
    } else if (action === 'downbeatFromPlayhead' && props.mediaController) {
      const progress = props.mediaController.getPlaybackProgress ? props.mediaController.getPlaybackProgress() : null;
      if (progress) {
        const linkStart = props.mediaController.getLinkStartAt ? props.mediaController.getLinkStartAt() : 0;
        const seconds = Math.max(0, (progress.currentTime || 0) - linkStart);
        const beat = seconds * (tuneMeta.tempo || 120) / 60;
        const minStart = next.reduce(function(min, ev) {
          if (ev.type !== 'note' && ev.type !== 'chord') return min;
          return Math.min(min, ev.startBeat || 0);
        }, Number.POSITIVE_INFINITY);
        if (minStart < Number.POSITIVE_INFINITY) {
          next = applyDownbeatOffset(next, tuneMeta, beat - minStart);
        }
      }
    } else if (action === 'snapRegionStart' && props.mediaController) {
      const linkStart = props.mediaController.getLinkStartAt ? props.mediaController.getLinkStartAt() : 0;
      const regionBeat = linkStart * (tuneMeta.tempo || 120) / 60;
      next = snapToPlaybackRegionStart(next, ids, regionBeat, tuneMeta);
    }

    applyEvents(Object.assign({}, s, { events: next }), s.view, 'Align notes');
  }

  function handlePianoRollChange(events, caretIndex, opts) {
    const s = sessionRef.current;
    applyEvents(
      Object.assign({}, s, {
        events: events,
        caretIndex: typeof caretIndex === 'number' ? caretIndex : s.caretIndex,
      }),
      sessionRef.current.view,
      (opts && opts.historyLabel) || 'Piano roll edit',
      opts
    );
  }

  function handleSplitResizerPointerDown(e) {
    e.preventDefault();
    const container = e.currentTarget.parentElement;
    if (!container) return;
    splitDragRef.current = {
      startY: e.clientY,
      startRatio: splitRatio,
      height: container.getBoundingClientRect().height,
    };
    function onMove(moveEvent) {
      const drag = splitDragRef.current;
      if (!drag) return;
      const delta = moveEvent.clientY - drag.startY;
      const next = Math.max(0.25, Math.min(0.75, drag.startRatio + delta / drag.height));
      setSplitRatio(next);
    }
    function onUp() {
      splitDragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      try {
        localStorage.setItem('notationSplitRatio', String(splitRatio));
      } catch (err) { /* ignore */ }
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  useEffect(function() {
    try {
      localStorage.setItem('notationSplitRatio', String(splitRatio));
    } catch (err) { /* ignore */ }
  }, [splitRatio]);

  useEffect(function() {
    if (process.env.NODE_ENV === 'production') return undefined;
    window.__abc2bookNotationTest = {
      getVoiceAbc: function() {
        return serializeVoiceEvents(sessionRef.current.events, tuneMeta);
      },
      getCommittedVoiceAbc: function() {
        return lastCommittedAbcRef.current || serializeVoiceEventsViaParser(
          sessionRef.current.events,
          tuneMeta,
          abcjsParser
        );
      },
      getSessionEvents: function() {
        return JSON.parse(JSON.stringify(sessionRef.current.events));
      },
      getSelection: function() {
        return Object.assign({}, sessionRef.current.selection);
      },
      getMode: function() {
        return sessionRef.current.mode;
      },
      getView: function() {
        return sessionRef.current.view;
      },
      getCaretIndex: function() {
        return sessionRef.current.caretIndex;
      },
      getVoiceKey: function() {
        return props.voiceKey;
      },
      getDurationKey: function() {
        return sessionRef.current.durationKey;
      },
      getDotted: function() {
        return sessionRef.current.dotted;
      },
      getAccidentalCarry: function() {
        return sessionRef.current.accidentalCarry;
      },
      getTupletMode: function() {
        return sessionRef.current.tupletMode
          ? JSON.parse(JSON.stringify(sessionRef.current.tupletMode))
          : null;
      },
      getSlurMode: function() {
        return sessionRef.current.slurMode;
      },
      getSlurPendingStartId: function() {
        return sessionRef.current.slurPendingStartId;
      },
      getSnapEnabled: function() {
        return sessionRef.current.snapEnabled;
      },
      getPianoRollTool: function() {
        return sessionRef.current.pianoRollTool;
      },
      selectNoteByStep: function(stepLetter) {
        const s = sessionRef.current;
        let targetIdx = -1;
        for (let i = 0; i < s.events.length; i += 1) {
          const ev = s.events[i];
          if ((ev.type === 'note' || ev.type === 'chord') && ev.pitch && ev.pitch.step === stepLetter) {
            targetIdx = i;
            break;
          }
        }
        if (targetIdx < 0) return false;
        const ev = s.events[targetIdx];
        const selection = { eventIds: [ev.id], toneIndex: null, anchorId: ev.id };
        dispatch({ type: 'SET_SELECTION', selection: selection });
        dispatch({ type: 'SET_CARET', index: targetIdx });
        return true;
      },
      setCaretIndex: function(index) {
        const idx = Math.max(0, Math.min(index, sessionRef.current.events.length));
        dispatch({ type: 'SET_CARET', index: idx });
        return idx;
      },
      setCaretAtEnd: function() {
        const len = sessionRef.current.events.length;
        dispatch({ type: 'SET_CARET', index: len });
        return len;
      },
      getResolverDebug: function() {
        const dbg = resolverDebugRef.current ? Object.assign({}, resolverDebugRef.current) : null;
        if (!dbg) return null;
        const s = sessionRef.current;
        const ev = typeof dbg.eventIndex === 'number' ? s.events[dbg.eventIndex] : null;
        dbg.eventSummary = ev
          ? (ev.type + (ev.pitch && ev.pitch.step ? ':' + ev.pitch.step : ''))
          : null;
        dbg.selectionIds = s.selection.eventIds.slice();
        dbg.mode = s.mode;
        dbg.sessionCaretIndex = s.caretIndex;
        return dbg;
      },
      debugCaretAt: function(clientX, clientY) {
        const wrap = staffWrapRef.current;
        const s = sessionRef.current;
        const voiceStaffIdx = Math.max(0, displayedVoiceKeys.indexOf(props.voiceKey));
        const pos = caretIndexAndAnchorFromStaffClick(
          wrap,
          s.events,
          { clientX: clientX, clientY: clientY },
          null,
          voiceStaffIdx
        );
        const resolved = resolveStaffClick({
          wrapEl: wrap,
          events: s.events,
          mouseEvent: { clientX: clientX, clientY: clientY },
          abcelem: null,
          analysis: null,
          voiceStaffIndex: voiceStaffIdx,
          tuneMeta: tuneMeta,
          fullAbc: displayAbc,
          displayedVoiceKeys: displayedVoiceKeys,
        });
        return { pos: pos, resolved: resolved, eventsLen: s.events.length, sessionCaret: s.caretIndex };
      },
    };
    return function() {
      delete window.__abc2bookNotationTest;
    };
  }, [tuneMeta, props.voiceKey]);

  const staffAbcSelectTypes = session.mode === EDITOR_MODES.NOTE_INPUT
    ? ['note', 'rest']
    : ['note', 'clef', 'keySignature', 'timeSignature', 'key', 'meter'];

  const activeVoiceStaffIndex = useMemo(function() {
    const idx = displayedVoiceKeys.indexOf(props.voiceKey);
    return idx >= 0 ? idx : 0;
  }, [displayedVoiceKeys, props.voiceKey]);

  useLayoutEffect(function() {
    if (session.mode === EDITOR_MODES.NOTE_INPUT) {
      syncStaffSelectionHighlight(staffWrapRef.current, session.events, [], activeVoiceStaffIndex);
      return undefined;
    }
    function sync() {
      syncStaffSelectionHighlight(
        staffWrapRef.current,
        session.events,
        session.selection && session.selection.eventIds ? session.selection.eventIds : [],
        activeVoiceStaffIndex
      );
    }
    sync();
    const raf = requestAnimationFrame(sync);
    return function() { cancelAnimationFrame(raf); };
  }, [
    session.mode,
    session.events,
    session.selection,
    displayAbc,
    activeVoiceStaffIndex,
  ]);

  const staffPanel = (
      <div
      ref={staffWrapRef}
      className={'notation-staff-wrap' + (session.mode === EDITOR_MODES.NOTE_INPUT ? ' notation-staff-wrap--note-input' : '')}
      data-testid="notation-staff-wrap"
      onPointerDownCapture={handleStaffWrapPointerDown}
      onPointerMove={handleStaffWrapPointerMove}
      onMouseDownCapture={function(e) {
        // Puppeteer/some browsers may not synthesize pointerdown for mouse drags.
        if (!staffDragPointerRef.current && !staffMarqueeRef.current && !staffPendingGestureRef.current) {
          handleStaffWrapPointerDown(e);
        }
      }}
      onContextMenu={function(e) {
        if (session.mode === EDITOR_MODES.NOTE_INPUT) e.preventDefault();
      }}
    >
      <Abc
        key={'notation-staff-' + session.mode + '-' + displayedVoiceKeys.join('-')}
        showRepeats={true}
        mediaController={props.mediaController}
        audioRenderTimeout={30000}
        tunebook={props.tunebook}
        abc={displayAbc}
        onWarnings={props.onWarnings}
        distempo={tuneMeta.tempo > 0 ? tuneMeta.tempo : null}
        showTempoSlider={true}
        editableTempo={true}
        meter={tuneMeta.meter}
        disableTablature={true}
        autoPrime={true}
        playbackEngine={false}
        mirrorNotationPlaybackCursor={true}
        staffDisplayControlRef={notationStaffDisplayControlRef}
        warp={props.mediaController ? props.mediaController.playbackSpeed : 1}
        repeat={props.tune && props.tune.repeats > 0 ? props.tune.repeats : 1}
        // Disable abcjs live rubber-band drag: it flies glyphs off-staff while the pointer
        // moves, then our clamped commit snaps them back (looks like a leap / vanish).
        // Pitch changes still come from our pointer tracking in handleStaffClick.
        dragging={false}
        selectTypes={staffAbcSelectTypes}
        onClick={handleStaffClick}
        suppressPlaybackSeek={true}
        hidePlayer={true}
      />
      <StaffCaretOverlay
        containerRef={staffWrapRef}
        session={session}
        displayAbc={displayAbc}
        voiceStaffIndex={activeVoiceStaffIndex}
        insertAnchor={staffInsertAnchor}
      />
      <StaffSelectionOverlay
        containerRef={staffWrapRef}
        session={session}
        displayAbc={displayAbc}
        voiceStaffIndex={activeVoiceStaffIndex}
        dragPreview={pitchDragPreview}
        marqueeRect={marqueeClientRect}
        slurSnapEventId={slurSnapEventId}
        onSlurHandlePointerDown={handleSlurHandlePointerDown}
        issueBarIndices={notationCheck.issueBarIndices}
      />
      <GhostNoteOverlay session={session} />
      <NotationFingeringLabelsOverlay
        containerRef={staffWrapRef}
        session={session}
        displayAbc={displayAbc}
        voiceStaffIndex={activeVoiceStaffIndex}
      />
      {annotEdit ? (
        <NotationAnnotOverlay
          mode={annotEdit.mode}
          value={annotEdit.value}
          left={annotEdit.left}
          top={annotEdit.top}
          onChange={function(next) {
            setAnnotEdit(Object.assign({}, annotEdit, { value: next }));
          }}
          onCommit={function() { commitAnnotEdit({ advance: false }); }}
          onAdvance={function() { commitAnnotEdit({ advance: true }); }}
          onCancel={function() { setAnnotEdit(null); }}
          onClear={clearAnnotEdit}
        />
      ) : null}
    </div>
  );

  const pianoRollPanel = (
    <PianoRollEditor
      session={session}
      tuneMeta={tuneMeta}
      tune={props.tune}
      mediaController={props.mediaController}
      backgroundEvents={backgroundPianoRollEvents}
      dispatch={dispatch}
      onSelect={handlePianoRollSelect}
      onChange={handlePianoRollChange}
      onFlushCommit={flushCommit}
      onQuantize={function() { setShowQuantize(true); }}
      onAlignAction={handlePianoRollAlign}
      issueBarIndices={notationCheck.issueBarIndices}
    />
  );

  const viewToggle = !props.hideViewSelector ? (
    <NotationViewSelector
      tunebook={props.tunebook}
      view={session.view}
      onChange={function(view) { dispatch({ type: 'SET_VIEW', view: view }); }}
    />
  ) : null;

  return (
    <div
      className={'notation-editor'
        + (isStaffLikeView ? ' notation-editor-staff-view' : '')
        + (session.mode === EDITOR_MODES.NOTE_INPUT ? ' notation-editor-note-input' : '')}
      ref={staffRef}
      tabIndex={0}
      data-testid="notation-editor"
    >
      {props.mediaController ? (
        <div className="notation-playback-engine-host" aria-hidden="true">
          <Abc
            key={'notation-playback-' + displayedVoiceKeys.join('-')}
            showRepeats={true}
            mediaController={props.mediaController}
            audioRenderTimeout={30000}
            tunebook={props.tunebook}
            abc={displayAbc}
            onWarnings={props.onWarnings}
            distempo={tuneMeta.tempo > 0 ? tuneMeta.tempo : null}
            meter={tuneMeta.meter}
            disableTablature={true}
            autoPrime={false}
            playbackEngine={true}
            metronomeCountIn={false}
            metronomeDuringPlayback={false}
            playbackControlRef={notationPlaybackControlRef}
            warp={props.mediaController.playbackSpeed}
            repeat={props.tune && props.tune.repeats > 0 ? props.tune.repeats : 1}
            suppressPlaybackSeek={true}
            suppressPlaybackVisuals={true}
            hideSvg={true}
            hidePlayer={true}
            onEnded={function() {
              if (props.mediaController && props.mediaController.onEnded) {
                props.mediaController.onEnded()
              }
            }}
          />
        </div>
      ) : null}

      {viewToggle && (toggleSlot ? createPortal(viewToggle, toggleSlot) : viewToggle)}

      {!isStaffLikeView ? (
        <div className="notation-nonstaff-controls notation-nonstaff-controls-main mb-2 d-flex align-items-center gap-2 flex-wrap">
          <NotationPlaybackControls
            mediaController={props.mediaController}
            tune={props.tune}
            tunebook={props.tunebook}
            getSession={function() { return sessionWithEditSelection(sessionRef.current); }}
            getLastNoteSelection={function() { return lastNoteSelectionRef.current; }}
            tempo={tuneMeta.tempo}
            playbackContext={resolvePlaybackContext()}
            playbackControlRef={notationPlaybackControlRef}
            onRefresh={props.forceRefresh}
          />
          <NotationVoicesDropdown
            tune={props.tune}
            voiceNames={voiceNames}
            voiceIndex={props.voiceIndex}
            displayedVoiceIndices={displayedVoiceIndices}
            onVoiceSelect={handleVoiceSelect}
            onDisplayedVoicesChange={handleDisplayedVoicesChange}
            onVoiceNameChange={props.onVoiceMetaChange}
            onVoiceNotesChange={props.onVoiceNotesChange}
            onAddVoice={function() {
              if (sessionRef.current.view === EDITOR_VIEWS.ABC) {
                flushAllAbcDrafts();
              } else {
                flushCommit();
              }
              if (props.onAddVoice) props.onAddVoice();
            }}
            onDeleteVoice={props.onDeleteVoice}
            onReorderVoices={props.onReorderVoices}
          />
          {props.historyControls ? (
            <span className="notation-toolbar-history">{props.historyControls}</span>
          ) : null}
          <NotationViewSelector
            variant="buttonGroup"
            tunebook={props.tunebook}
            view={session.view}
            onChange={handleNotationViewChange}
          />
          {props.toolbarEnd ? (
            <div className="notation-toolbar-end">
              {props.toolbarEnd}
            </div>
          ) : null}
        </div>
      ) : null}

      {isStaffLikeView ? (
        <div className="notation-editing-controls" ref={editingControlsRef}>
          <div className="notation-editing-controls-main">
            <NotationToolbar
                session={session}
                tunebook={props.tunebook}
                midi={midi}
                dispatch={dispatch}
                tune={props.tune}
                mediaController={props.mediaController}
                tempo={tuneMeta.tempo}
                getSession={function() { return sessionWithEditSelection(sessionRef.current); }}
                getLastNoteSelection={function() { return lastNoteSelectionRef.current; }}
                playbackContext={resolvePlaybackContext()}
                playbackControlRef={notationPlaybackControlRef}
                onRefresh={props.forceRefresh}
                voiceNames={voiceNames}
                voiceIndex={props.voiceIndex}
                displayedVoiceIndices={displayedVoiceIndices}
                historyControls={props.historyControls}
                onVoiceSelect={handleVoiceSelect}
                onDisplayedVoicesChange={handleDisplayedVoicesChange}
                onVoiceNameChange={props.onVoiceMetaChange}
                onVoiceNotesChange={props.onVoiceNotesChange}
                onAddVoice={function() {
                  if (sessionRef.current.view === EDITOR_VIEWS.ABC) {
                    flushAllAbcDrafts();
                  } else {
                    flushCommit();
                  }
                  if (props.onAddVoice) props.onAddVoice();
                }}
                onDeleteVoice={props.onDeleteVoice}
                onReorderVoices={props.onReorderVoices}
                onViewChange={handleNotationViewChange}
                clipboardEpoch={clipboardEpoch}
                onClipboardAction={function(clipboardAction) {
                  if (clipboardAction === 'deleteToRest') {
                    handleShortcutAction({ action: 'deleteToRest', backward: false });
                    return;
                  }
                  handleShortcutAction({ action: clipboardAction });
                }}
                onOpenWizard={function() { setShowWizard(true); }}
                onOpenHelp={function() { setShowHelp(true); }}
                onQuantize={function() {
                  setQuantizeNoChangeHint(null);
                  setShowQuantize(true);
                }}
                onInsertSystemBreak={function() {
                  insertLayout(insertSystemBreakAtCaret, 'Insert system break');
                }}
                onInsertBarline={function(barToken) {
                  insertLayout(function(s, insertAt) { return insertBarlineAtCaret(s, barToken, insertAt); }, 'Insert bar line');
                }}
                onInsertKeyChange={function() { openInlineSignatureModal('key'); }}
                onInsertMeterChange={function() { openInlineSignatureModal('meter'); }}
                onInsertMeasure={function() {
                  handleShortcutAction({ action: 'insertMeasure' });
                }}
                onBeamBreak={function() {
                  handleShortcutAction({ action: 'beamBreak' });
                }}
                onToggleTie={handleToggleTie}
                onMarkAction={handleMarkAction}
                onTupletAction={handleTupletAction}
                onApplyAccidental={function(value) {
                  handleShortcutAction({ action: 'accidental', value: value });
                }}
                onEditChordSymbol={function() {
                  handleShortcutAction({ action: 'editChordSymbol' });
                }}
                onClearChordSymbol={clearChordSymbolOnSelection}
                onToggleRecord={handleToggleRecord}
                onApplyRecord={handleApplyRecord}
                onDiscardRecord={handleDiscardRecord}
                pendingRecordCount={pendingRecordCount}
                expandFlags={expandFlags}
                showVirtualPiano={showVirtualPiano}
                onToggleVirtualPiano={function() {
                  setShowVirtualPiano(function(prev) {
                    const next = !prev;
                    try {
                      localStorage.setItem('notationVirtualPianoVisible', next ? 'true' : 'false');
                    } catch (err) { /* ignore */ }
                    return next;
                  });
                }}
              />
              <NotationDurationToolbar
            session={session}
            dispatch={dispatch}
            expandFlags={expandFlags}
            onToggleNoteInput={function() {
              handleShortcutAction({ action: 'toggleNoteInput' });
            }}
            onApplyDuration={function(key) {
              const s = sessionRef.current;
              const method = s.noteInputMethod || NOTE_INPUT_METHODS.NOTE_NAME;
              if (s.mode === EDITOR_MODES.NOTE_INPUT
                && (method === NOTE_INPUT_METHODS.DURATION || method === NOTE_INPUT_METHODS.RHYTHM)) {
                handleShortcutAction({ action: 'setDuration', key: key });
                return;
              }
              if (s.selection.eventIds.length) {
                applyEvents(
                  changeSelectedDuration(s, key, s.dotted),
                  EDITOR_VIEWS.STAFF,
                  restDurationChangeLabel(s, key, s.dotted)
                );
              } else if (s.mode === EDITOR_MODES.NORMAL && s.events.length) {
                let focusIdx = s.caretIndex > 0 ? s.caretIndex - 1 : 0;
                if (focusIdx >= s.events.length) focusIdx = s.events.length - 1;
                const focusEv = s.events[focusIdx];
                if (focusEv && (focusEv.type === 'note' || focusEv.type === 'chord' || focusEv.type === 'rest')) {
                  const withSel = Object.assign({}, s, {
                    selection: {
                      eventIds: [focusEv.id],
                      toneIndex: null,
                      anchorId: focusEv.id,
                    },
                  });
                  applyEvents(
                    changeSelectedDuration(withSel, key, s.dotted),
                    EDITOR_VIEWS.STAFF,
                    restDurationChangeLabel(withSel, key, s.dotted)
                  );
                } else {
                  dispatch({ type: 'SET_DURATION_KEY', key: key });
                }
              } else {
                dispatch({ type: 'SET_DURATION_KEY', key: key });
              }
            }}
            onInsertSystemBreak={function() {
              insertLayout(insertSystemBreakAtCaret, 'Insert system break');
            }}
            onToggleDot={function() {
              handleShortcutAction({ action: 'toggleDot' });
            }}
          />
          </div>
          {props.toolbarEnd ? (
            <div className="notation-toolbar-end">
              {props.toolbarEnd}
            </div>
          ) : null}
          {showVirtualPiano ? (
            <div className="notation-virtual-piano-row">
              <VirtualPiano
                session={session}
                midiActiveNotes={midi.activeNotes}
                onPitch={function(pitch, addTone) {
                  let s = sessionRef.current;
                  if (s.mode !== EDITOR_MODES.NOTE_INPUT) {
                    dispatch({ type: 'SET_MODE', mode: EDITOR_MODES.NOTE_INPUT });
                    s = sessionRef.current;
                  }
                  const method = s.noteInputMethod || NOTE_INPUT_METHODS.NOTE_NAME;
                  if (method === NOTE_INPUT_METHODS.DURATION || method === NOTE_INPUT_METHODS.RHYTHM) {
                    dispatch({ type: 'SET_PITCH_CARRY', pitch: pitch });
                    return;
                  }
                  if (method === NOTE_INPUT_METHODS.RE_PITCH) {
                    const patch = rePitchAtCaret(s, pitch);
                    if (patch) applyEvents(patch, EDITOR_VIEWS.STAFF, 'Virtual piano re-pitch');
                    return;
                  }
                  const patch = insertPitchAtCaret(Object.assign({}, s, { chordBuild: !!addTone }), pitch);
                  applyEvents(Object.assign({}, patch, { pitchCarry: pitch }), EDITOR_VIEWS.STAFF, 'Virtual piano');
                  dispatch({ type: 'SET_PITCH_CARRY', pitch: pitch });
                }}
              />
            </div>
          ) : null}
          <NotationIssuesPanel
            tune={notationCheck.checkTune || props.tune}
            tunebook={props.tunebook}
            issues={notationCheck.issues}
            checkResults={notationCheck}
            parseAndRender={parseAndRenderAbc}
            onNavigateIssue={handleNavigateIssue}
            onTuneSaved={handleFixTuneSaved}
          />
        </div>
      ) : null}

      <NotationInputHandler
        containerRef={staffRef}
        onAction={handleShortcutAction}
        enabled={true}
        noteInputActive={session.mode === EDITOR_MODES.NOTE_INPUT}
      />

      {isStaffView ? staffPanel
      : isSplitView ? (
        <div className="notation-split-view">
          <div className="notation-split-staff" style={{ flex: splitRatio }}>
            {staffPanel}
          </div>
          <div
            className="notation-split-resizer"
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize staff and piano roll"
            data-testid="notation-split-resizer"
            onPointerDown={handleSplitResizerPointerDown}
          />
          <div className="notation-split-roll" style={{ flex: 1 - splitRatio }}>
            {pianoRollPanel}
          </div>
        </div>
      ) : isPianoRollView ? pianoRollPanel
      : session.view === EDITOR_VIEWS.ABC ? (
        <div className="notation-abc-view">
          <Row className="notation-abc-split g-2">
            <Col md={4} xs={12} className="notation-abc-text-col">
              <div className="notation-abc-textareas">
                {displayedVoiceKeys.length === 0 ? (
                  <div className="notation-abc-textarea-empty text-muted small">
                    Select one or more voices to edit.
                  </div>
                ) : displayedVoiceKeys.map(function(vk) {
                  return (
                    <div key={'abc-draft-wrap-' + vk} className="notation-abc-textarea-wrap">
                      <div className="notation-abc-textarea-label fw-semibold small text-muted">
                        {voiceDisplayLabel(props.tune, vk)}
                      </div>
                      <textarea
                        key={'abc-draft-' + vk}
                        ref={function(el) { textareaRefs.current[vk] = el; }}
                        value={abcDrafts[vk] != null ? abcDrafts[vk] : voiceNotesForKey(vk)}
                        className={'notation-abc-textarea' + (focusedAbcVoiceKey === vk ? ' notation-abc-textarea--focused' : '')}
                        rows={5}
                        data-testid="notation-abc-textarea"
                        aria-label={'ABC notes for ' + voiceDisplayLabel(props.tune, vk)}
                        onFocus={function() {
                          setFocusedAbcVoiceKey(vk);
                          const idx = voiceNames.indexOf(vk);
                          if (idx >= 0 && idx !== props.voiceIndex) handleVoiceSelect(idx);
                        }}
                        onBlur={function() {
                          setFocusedAbcVoiceKey(function(prev) { return prev === vk ? null : prev; });
                        }}
                        onChange={function(e) { handleAbcTextChange(vk, e.target.value); }}
                        onSelect={function() { syncAbcCaretFromTextarea(vk); }}
                        onKeyUp={function() { syncAbcCaretFromTextarea(vk); }}
                        onClick={function() { syncAbcCaretFromTextarea(vk); }}
                      />
                    </div>
                  );
                })}
              </div>
            </Col>
            <Col md={8} xs={12} className="notation-abc-preview-col">
              <div className="notation-abc-preview" key={'abc-preview-' + displayedVoiceKeys.join('-')} data-testid="notation-abc-preview">
                <Abc
                  showRepeats={false}
                  hidePlayer={true}
                  suppressPlaybackSeek={true}
                  playbackEngine={false}
                  tunebook={props.tunebook}
                  abc={abcPreviewAbc}
                  onWarnings={props.onWarnings}
                  meter={tuneMeta.meter}
                  onClick={handleAbcPreviewClick}
                  disableTablature={true}
                />
              </div>
            </Col>
          </Row>
          <p className="notation-abc-hint text-muted small">
            Edit ABC note text for each selected voice. Check voice boxes to show them in the preview.
            Line breaks (Enter) split the music across rows in the preview.
          </p>
        </div>
      ) : null}

      <NotationEditorHelpModal
        show={showHelp}
        onHide={function() { setShowHelp(false); }}
        onOpenWalkthrough={function() { setShowWalkthrough(true); }}
      />

      <NotationEditorWalkthroughModal
        show={showWalkthrough}
        onHide={function() { setShowWalkthrough(false); }}
      />

      <WizardOptionsModal
        triggerOnly={true}
        show={showWizard}
        onHide={function() { setShowWizard(false); }}
        abc={props.abc}
        tune={props.tune}
        tunebook={props.tunebook}
        forceRefresh={props.forceRefresh}
      />

      <NotationTuneMetaModal
        show={showTuneMeta}
        onHide={function() { setShowTuneMeta(false); setTuneMetaFocus(null); }}
        tune={props.tune}
        tunebook={props.tunebook}
        voiceKey={props.voiceKey}
        focusField={tuneMetaFocus}
        forceRefresh={props.forceRefresh}
      />

      <NotationInlineSignatureModal
        show={!!inlineSigModal}
        kind={inlineSigModal ? inlineSigModal.kind : 'key'}
        eventId={inlineSigModal ? inlineSigModal.eventId : null}
        initialKey={inlineSigModal ? inlineSigModal.initialKey : null}
        initialMeter={inlineSigModal ? inlineSigModal.initialMeter : null}
        tunebook={props.tunebook}
        onHide={function() { setInlineSigModal(null); }}
        onApply={applyInlineSignature}
      />

      <NotationPasteModeModal
        show={!!pasteModal}
        mode={pasteModal && pasteModal.mode}
        fromBar={pasteModal && pasteModal.fromBar}
        toBar={pasteModal && pasteModal.toBar}
        targetNotes={pasteModal ? eventsToNoteLines(pasteModal.events, tuneMeta) : []}
        sourceNotes={pasteModal && hasClipboardContent()
          ? eventsToNoteLines(getNotationClipboard().events, tuneMeta)
          : []}
        tune={props.tune}
        onHide={function() { setPasteModal(null); }}
        onConfirm={function() {
          if (!pasteModal) return;
          const clip = getNotationClipboard();
          if (!clip || !clip.events.length) {
            setPasteModal(null);
            return;
          }
          const nextEvents = applyBarPasteToEvents(
            pasteModal.events,
            clip.events,
            props.tune,
            pasteModal.mode,
            pasteModal.fromBar,
            pasteModal.toBar
          );
          const s = sessionRef.current;
          applyEvents(Object.assign({}, s, {
            events: nextEvents,
            selection: { eventIds: [], toneIndex: null, anchorId: null },
          }), pasteModal.view || s.view, 'Paste');
          setPasteModal(null);
        }}
        onModeChange={function(mode) {
          setPasteModal(function(current) {
            return current ? Object.assign({}, current, { mode: mode }) : current;
          });
        }}
        onFromBarChange={function(value) {
          setPasteModal(function(current) {
            return current
              ? Object.assign({}, current, { fromBar: Math.max(1, parseInt(value, 10) || 1) })
              : current;
          });
        }}
        onToBarChange={function(value) {
          setPasteModal(function(current) {
            if (!current) return current;
            return Object.assign({}, current, {
              toBar: value === '' || value == null ? null : Math.max(current.fromBar, parseInt(value, 10) || current.fromBar),
            });
          });
        }}
      />
      <QuantizeDialog
        show={showQuantize}
        noChangeHint={quantizeNoChangeHint}
        onHide={function() {
          setShowQuantize(false);
          setQuantizeNoChangeHint(null);
        }}
        onApply={function(opts) {
          const s = sessionRef.current;
          dispatch({ type: 'SET_LAST_QUANTIZE_OPTIONS', options: opts });
          const ids = s.selection.eventIds;
          const target = ids.length
            ? s.events.filter(function(ev) { return ids.indexOf(ev.id) >= 0; })
            : s.events;
          const rest = ids.length
            ? s.events.filter(function(ev) { return ids.indexOf(ev.id) < 0; })
            : [];
          const quantized = quantizeVoiceEvents(target, Object.assign({}, tuneMeta, opts, {
            beatsPerBar: beatsPerBarFromMeter(tuneMeta.meter),
            tempo: tuneMeta.tempo,
          }));
          if (quantized.unchanged) {
            setQuantizeNoChangeHint(
              'Already on the grid — nothing changed. Nudge notes off the beat (or lower subdivision) to hear a difference.'
            );
            return;
          }
          setQuantizeNoChangeHint(null);
          const merged = rest.concat(quantized).sort(function(a, b) {
            return (a.startBeat || 0) - (b.startBeat || 0);
          });
          applyEvents(Object.assign({}, s, { events: merged }), s.view, 'Quantize');
          setShowQuantize(false);
        }}
      />
    </div>
  );
}
