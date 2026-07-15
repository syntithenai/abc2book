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

function isNoteLike(ev) {
  return !!(ev && (ev.type === 'note' || ev.type === 'chord'));
}

/**
 * Unified staff click resolver.
 *
 * Selection (eventIndex):
 *   1. abcjs startChar when available (matches rendered ABC ↔ session events)
 *   2. Strict DOM glyph hit (pointer inside note/rest bbox)
 *   3. Geometry hitEventIndex when clicking a glyph via caret bisection
 *
 * Caret (caretIndex):
 *   Always prefer DOM geometry so empty-bar / between-note clicks place the insert slot.
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
  let selectedFromNoteHit = false;

  const abcElem = abcelem
    || (analysis && analysis.selectableElement && analysis.selectableElement.startChar != null
      ? analysis.selectableElement
      : null);

  // 1. Prefer abcjs startChar for selection — reliable when display ABC === serializeVoiceEvents.
  if (abcElem && typeof abcElem.startChar === 'number'
    && fullAbc && displayedVoiceKeys && displayedVoiceKeys.length) {
    const idx = eventIndexFromStaffAbcElem(
      list,
      tuneMeta,
      fullAbc,
      displayedVoiceKeys,
      voiceStaffIndex,
      abcElem,
      analysis
    );
    if (typeof idx === 'number' && idx >= 0 && idx < list.length && isNoteLike(list[idx])) {
      source = 'startChar';
      eventIndex = idx;
      caretIndex = idx;
      selectedFromNoteHit = true;
    }
  }

  // 2. Strict DOM glyph hit (pointer must be inside the note/rest box).
  if (!selectedFromNoteHit && wrapEl && mouseEvent) {
    const domIdx = eventIndexFromStaffNoteElement(
      wrapEl,
      list,
      mouseEvent,
      analysis,
      voiceStaffIndex
    );
    if (typeof domIdx === 'number' && domIdx >= 0 && domIdx < list.length) {
      const domEv = list[domIdx];
      if (isNoteLike(domEv) || (domEv && domEv.type === 'rest')) {
        source = 'dom';
        eventIndex = domIdx;
        caretIndex = domIdx;
        selectedFromNoteHit = isNoteLike(domEv);
      }
    }
  }

  // 3. Geometry caret for gaps / empty measures. Also recovers selection via hitEventIndex.
  if (wrapEl && mouseEvent) {
    const pos = caretIndexAndAnchorFromStaffClick(wrapEl, list, mouseEvent, analysis, voiceStaffIndex);
    if (pos && typeof pos.caretIndex === 'number') {
      caretIndex = Math.max(0, Math.min(pos.caretIndex, list.length));
      anchorRect = pos.anchor || null;
      if (!selectedFromNoteHit
        && typeof pos.hitEventIndex === 'number'
        && pos.hitEventIndex >= 0
        && pos.hitEventIndex < list.length
        && isNoteLike(list[pos.hitEventIndex])) {
        eventIndex = pos.hitEventIndex;
        selectedFromNoteHit = true;
        source = source === 'fallback' ? 'dom' : source;
      } else if (!selectedFromNoteHit) {
        // Gap / empty-bar click: caret only — do not invent a selection from caretIndex.
        source = source === 'fallback' ? 'dom' : source;
        eventIndex = Math.min(caretIndex, list.length > 0 ? list.length - 1 : 0);
      }
      // When we already have a note selection from startChar/DOM, keep eventIndex but
      // still allow geometry to move the caret (e.g. right-half → insert after).
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
    selectedFromNoteHit: selectedFromNoteHit,
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
