import {
  caretIndexAndAnchorFromStaffClick,
  eventIndexFromStaffClick,
  eventIndexFromStaffNoteElement,
  staffCaretAnchorRect,
  staffSelectionAnchorRects,
} from './staffCaretPosition';
import { eventIndexFromStaffAbcElem } from './voiceEventTiming';

export { globalMeasureFromAnalysis } from './voiceEventTiming';

/** Default on after cutover; set localStorage notationClickResolverV2=0 to rollback. */
export function isClickResolverV2() {
  try {
    const v = localStorage.getItem('notationClickResolverV2');
    if (v === '0') return false;
    return true;
  } catch (err) {
    return true;
  }
}

/**
 * Unified staff click resolver — returns event index, caret index, anchor rect, and source.
 */
export function resolveStaffClick(params) {
  const {
    wrapEl,
    events,
    mouseEvent,
    abcelem,
    analysis,
    voiceStaffIndex,
    tuneMeta,
    fullAbc,
    displayedVoiceKeys,
  } = params;

  const list = Array.isArray(events) ? events : [];
  let source = 'fallback';
  let eventIndex = list.length > 0 ? list.length - 1 : 0;
  let caretIndex = list.length;
  let anchorRect = null;

  const abcElem = abcelem
    || (analysis && analysis.selectableElement ? analysis.selectableElement : null);

  if (abcElem && typeof abcElem.startChar === 'number' && fullAbc && displayedVoiceKeys && displayedVoiceKeys.length) {
    const idx = eventIndexFromStaffAbcElem(
      list,
      tuneMeta,
      fullAbc,
      displayedVoiceKeys,
      voiceStaffIndex,
      abcElem,
      analysis
    );
    if (typeof idx === 'number' && idx >= 0 && idx < list.length) {
      const ev = list[idx];
      if (ev && (ev.type === 'note' || ev.type === 'chord')) {
        source = 'startChar';
        eventIndex = idx;
        caretIndex = idx;
      }
    }
  }

  if (source === 'fallback' && wrapEl && mouseEvent) {
    const domIdx = eventIndexFromStaffNoteElement(
      wrapEl,
      list,
      mouseEvent,
      null,
      voiceStaffIndex
    );
    if (typeof domIdx === 'number' && domIdx >= 0 && domIdx < list.length) {
      const domEv = list[domIdx];
      if (domEv && (domEv.type === 'note' || domEv.type === 'chord')) {
        source = 'dom';
        eventIndex = domIdx;
        caretIndex = domIdx;
      }
    }
  }

  if (wrapEl && mouseEvent) {
    const pos = caretIndexAndAnchorFromStaffClick(wrapEl, list, mouseEvent, analysis, voiceStaffIndex);
    if (pos && typeof pos.caretIndex === 'number') {
      caretIndex = Math.max(0, Math.min(pos.caretIndex, list.length));
      anchorRect = pos.anchor || null;
      if (source === 'fallback') {
        source = 'dom';
        eventIndex = caretIndex;
      }
    }
  }

  if (source === 'fallback' && wrapEl) {
    const idx = eventIndexFromStaffClick(
      wrapEl,
      list,
      mouseEvent,
      abcelem,
      analysis,
      voiceStaffIndex,
      tuneMeta,
      fullAbc,
      displayedVoiceKeys
    );
    if (typeof idx === 'number') {
      eventIndex = Math.max(0, Math.min(idx, list.length));
      caretIndex = eventIndex;
      source = 'dom';
    }
  }

  return {
    eventIndex: Math.max(0, Math.min(eventIndex, list.length)),
    caretIndex: Math.max(0, Math.min(caretIndex, list.length)),
    anchorRect: anchorRect,
    source: source,
  };
}

/** Caret or selection anchor rect for an event index. */
export function rectForEventIndex(wrapEl, events, eventIndex, voiceStaffIndex) {
  if (!wrapEl || !Array.isArray(events)) return null;
  const idx = Math.max(0, Math.min(eventIndex, events.length));
  return staffCaretAnchorRect(wrapEl, events, idx, voiceStaffIndex);
}

/** Selection overlay rects for event ids. */
export function selectionRectsForEventIds(wrapEl, events, eventIds, voiceStaffIndex) {
  if (!wrapEl || !Array.isArray(events) || !eventIds || !eventIds.length) return [];
  return staffSelectionAnchorRects(wrapEl, events, eventIds, voiceStaffIndex);
}
