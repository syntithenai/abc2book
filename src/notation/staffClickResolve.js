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

function elementClassName(el) {
  if (!el || !el.className) return '';
  if (typeof el.className === 'string') return el.className;
  if (el.className.baseVal != null) return el.className.baseVal;
  return '';
}

/** Read abcjs voice staff index (abcjs-v0, abcjs-v1, …) from a DOM target. */
export function voiceStaffIndexFromDom(mouseEvent) {
  if (!mouseEvent || !mouseEvent.target || !mouseEvent.target.closest) return null;
  let node = mouseEvent.target.closest('.abcjs-note, .abcjs-rest, .abcjs-bar, .abcjs-staff');
  while (node) {
    const cls = elementClassName(node);
    const m = cls.match(/\babcjs-v(\d+)\b/);
    if (m) return parseInt(m[1], 10);
    node = node.parentElement;
  }
  return null;
}

/** Prefer abcjs analysis.voice; fall back to DOM class or an explicit default index. */
export function voiceStaffIndexFromAnalysisOrDom(analysis, mouseEvent, fallbackIndex) {
  if (analysis && typeof analysis.voice === 'number' && analysis.voice >= 0) {
    return analysis.voice;
  }
  const fromDom = voiceStaffIndexFromDom(mouseEvent);
  if (fromDom != null) return fromDom;
  return typeof fallbackIndex === 'number' && fallbackIndex >= 0 ? fallbackIndex : 0;
}

/** Map staff click metadata to a displayed voice key (original tune key). */
export function voiceKeyFromStaffAnalysis(displayedVoiceKeys, analysis, mouseEvent, fallbackVoiceKey) {
  const keys = Array.isArray(displayedVoiceKeys) ? displayedVoiceKeys : [];
  if (!keys.length) return fallbackVoiceKey || null;
  let fallbackIdx = 0;
  if (fallbackVoiceKey) {
    const fi = keys.indexOf(fallbackVoiceKey);
    if (fi >= 0) fallbackIdx = fi;
  }
  const idx = voiceStaffIndexFromAnalysisOrDom(analysis, mouseEvent, fallbackIdx);
  const clamped = Math.max(0, Math.min(idx, keys.length - 1));
  return keys[clamped];
}

/**
 * Resolve a staff click against a specific voice's events (cross-voice safe).
 * Caller supplies the target voice body as parsed events — not the active session.
 */
export function resolveStaffClickForVoice(params) {
  const {
    targetVoiceKey,
    targetEvents,
    displayedVoiceKeys,
    wrapEl,
    mouseEvent,
    abcelem,
    analysis,
    tuneMeta,
    fullAbc,
  } = params;
  const keys = displayedVoiceKeys || [];
  const voiceStaffIdx = Math.max(0, keys.indexOf(targetVoiceKey));
  return resolveStaffClick({
    wrapEl: wrapEl,
    events: targetEvents,
    mouseEvent: mouseEvent,
    abcelem: abcelem,
    analysis: analysis,
    voiceStaffIndex: voiceStaffIdx,
    tuneMeta: tuneMeta,
    fullAbc: fullAbc,
    displayedVoiceKeys: keys,
  });
}

/**
 * Unified staff click resolver.
 *
 * Selection (eventIndex):
 *   1. Strict DOM glyph hit (pointer inside note/rest bbox)
 *   2. abcjs startChar when DOM miss (matches rendered ABC ↔ session events)
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

  // 1. Strict DOM glyph hit — authoritative when pointer is inside a note/rest bbox.
  if (wrapEl && mouseEvent) {
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

  // 2. abcjs startChar when DOM miss — reliable when display ABC === serializeVoiceEvents.
  if (!selectedFromNoteHit && abcElem && typeof abcElem.startChar === 'number'
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
