import { eventIndexFromStaffAbcElem } from './voiceEventTiming';

export function isStaffDrawableEvent(event) {
  return !!(event && (event.type === 'note' || event.type === 'chord' || event.type === 'rest'));
}

export function isBarlineEvent(event) {
  return !!(event && event.type === 'barline');
}

export function countDrawablesBefore(events, index) {
  let count = 0;
  for (let i = 0; i < index && i < events.length; i += 1) {
    if (isStaffDrawableEvent(events[i])) count += 1;
  }
  return count;
}

export function countBarlinesBefore(events, index) {
  let count = 0;
  for (let i = 0; i < index && i < events.length; i += 1) {
    if (isBarlineEvent(events[i])) count += 1;
  }
  return count;
}

export function eventIndexForBarDomIndex(events, barDomIndex) {
  if (typeof barDomIndex !== 'number' || barDomIndex < 0) return events.length;
  let seen = -1;
  for (let i = 0; i < events.length; i += 1) {
    if (!isBarlineEvent(events[i])) continue;
    seen += 1;
    if (seen === barDomIndex) return i;
  }
  return events.length;
}

const LINE_Y_TOLERANCE = 16;

function elementClassName(el) {
  if (!el || !el.className) return '';
  if (typeof el.className === 'string') return el.className;
  if (el.className.baseVal != null) return el.className.baseVal;
  return '';
}

function elementHasClass(el, className) {
  return elementClassName(el).split(/\s+/).indexOf(className) >= 0;
}

function elementClassNumber(el, prefix) {
  const parts = elementClassName(el).split(/\s+/);
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].indexOf(prefix) === 0 && parts[i].length > prefix.length) {
      const num = parseInt(parts[i].slice(prefix.length), 10);
      if (!isNaN(num)) return num;
    }
  }
  return null;
}

function sortDrawablesReadingOrder(elements) {
  return elements.slice().sort(function(a, b) {
    const lineA = elementClassNumber(a, 'abcjs-l');
    const lineB = elementClassNumber(b, 'abcjs-l');
    if (lineA != null && lineB != null && lineA !== lineB) return lineA - lineB;
    const noteA = elementClassNumber(a, 'abcjs-n');
    const noteB = elementClassNumber(b, 'abcjs-n');
    if (noteA != null && noteB != null && noteA !== noteB) return noteA - noteB;
    return a.getBoundingClientRect().left - b.getBoundingClientRect().left;
  });
}

function sortLineDrawablesInReadingOrder(drawables, lineDrawables) {
  return lineDrawables.slice().sort(function(a, b) {
    const ia = drawables.indexOf(a);
    const ib = drawables.indexOf(b);
    if (ia >= 0 && ib >= 0 && ia !== ib) return ia - ib;
    return a.getBoundingClientRect().left - b.getBoundingClientRect().left;
  });
}

function lineVerticalSpan(elements) {
  if (!elements.length) return { top: 0, bottom: 0, height: 0 };
  let top = Infinity;
  let bottom = -Infinity;
  elements.forEach(function(el) {
    const rect = el.getBoundingClientRect();
    top = Math.min(top, rect.top);
    bottom = Math.max(bottom, rect.bottom);
  });
  return { top: top, bottom: bottom, height: Math.max(bottom - top, 12) };
}

function groupDrawablesBySystemLine(drawables) {
  const buckets = {};
  drawables.forEach(function(el) {
    const lineIdx = elementClassNumber(el, 'abcjs-l');
    const key = lineIdx != null
      ? 'l' + lineIdx
      : 'y' + Math.round(el.getBoundingClientRect().top / 24);
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(el);
  });
  return Object.keys(buckets)
    .sort()
    .map(function(key) { return sortDrawablesReadingOrder(buckets[key]); });
}

function staffRenderRoot(wrapEl) {
  if (!wrapEl) return null;
  return wrapEl.querySelector('#abc_music_viewer')
    || wrapEl.querySelector('.abcjs-container')
    || wrapEl;
}

function noteElementsIn(root) {
  if (!root) return [];
  const direct = Array.from(root.querySelectorAll('.abcjs-note, .abcjs-rest'));
  if (direct.length) return direct;
  return Array.from(root.querySelectorAll('[class*="abcjs-note"], [class*="abcjs-rest"]'));
}

function barlineElementsIn(root) {
  if (!root) return [];
  return Array.from(root.querySelectorAll('.abcjs-bar'));
}

function elementsOnSameSystemLine(elements, clickY, tolerance) {
  if (!elements.length) return [];
  if (clickY == null) return elements;
  const tol = typeof tolerance === 'number' ? tolerance : LINE_Y_TOLERANCE;
  return elements.filter(function(el) {
    const rect = el.getBoundingClientRect();
    return clickY >= rect.top - tol && clickY <= rect.bottom + tol;
  });
}

function staffElementAtClick(wrapEl, clickY) {
  const root = staffRenderRoot(wrapEl) || wrapEl;
  const staffs = Array.from(root.querySelectorAll('.abcjs-staff, .abcjs-top-line'));
  if (!staffs.length) return null;
  if (clickY == null) return staffs[0];

  const tolerance = 14;
  let best = null;
  let bestDist = Infinity;
  staffs.forEach(function(staff) {
    const rect = staff.getBoundingClientRect();
    if (clickY >= rect.top - tolerance && clickY <= rect.bottom + tolerance) {
      const dist = Math.abs(clickY - (rect.top + rect.height / 2));
      if (dist < bestDist) {
        bestDist = dist;
        best = staff;
      }
    }
  });
  if (best) return best;

  staffs.forEach(function(staff) {
    const rect = staff.getBoundingClientRect();
    const dist = Math.abs(clickY - (rect.top + rect.height / 2));
    if (dist < bestDist) {
      bestDist = dist;
      best = staff;
    }
  });
  return best;
}

function systemLineForClick(drawables, clickY, wrapEl) {
  const lines = groupDrawablesBySystemLine(drawables);
  if (!lines.length) return [];

  if (clickY != null) {
    for (let i = 0; i < lines.length; i += 1) {
      const span = lineVerticalSpan(lines[i]);
      if (clickY >= span.top - LINE_Y_TOLERANCE && clickY <= span.bottom + LINE_Y_TOLERANCE) {
        return lines[i];
      }
    }

    const staff = staffElementAtClick(wrapEl, clickY);
    if (staff) {
      const staffRect = staff.getBoundingClientRect();
      let bestLine = lines[0];
      let bestDist = Infinity;
      lines.forEach(function(line) {
        const span = lineVerticalSpan(line);
        const dist = Math.abs(span.top - staffRect.top);
        if (dist < bestDist) {
          bestDist = dist;
          bestLine = line;
        }
      });
      return bestLine;
    }

    let bestLine = lines[0];
    let bestDist = Infinity;
    lines.forEach(function(line) {
      const span = lineVerticalSpan(line);
      const center = span.top + span.height / 2;
      const dist = Math.abs(center - clickY);
      if (dist < bestDist) {
        bestDist = dist;
        bestLine = line;
      }
    });
    return bestLine;
  }

  return lines[0];
}

/**
 * All note/rest elements for one displayed voice, in reading order across system lines.
 * voiceStaffIndex matches abcjs voice class suffix (abcjs-v0, abcjs-v1, …).
 */
export function drawableElementsForVoice(wrapEl, voiceStaffIndex) {
  const root = staffRenderRoot(wrapEl);
  const all = noteElementsIn(root);
  if (!all.length) return all;

  const voiceClass = 'abcjs-v' + (typeof voiceStaffIndex === 'number' && voiceStaffIndex >= 0 ? voiceStaffIndex : 0);
  const filtered = all.filter(function(el) {
    return elementHasClass(el, voiceClass);
  });

  if (filtered.length) {
    return sortDrawablesReadingOrder(filtered);
  }

  const lines = groupDrawablesBySystemLine(all);
  const idx = typeof voiceStaffIndex === 'number' && voiceStaffIndex >= 0
    ? Math.min(voiceStaffIndex, lines.length - 1)
    : 0;
  return lines[idx] || [];
}

/** Bar line SVG elements for one voice, in reading order. */
export function barlineElementsForVoice(wrapEl, voiceStaffIndex) {
  const root = staffRenderRoot(wrapEl);
  const all = barlineElementsIn(root);
  if (!all.length) return all;

  const voiceClass = 'abcjs-v' + (typeof voiceStaffIndex === 'number' && voiceStaffIndex >= 0 ? voiceStaffIndex : 0);
  const filtered = all.filter(function(el) {
    return elementHasClass(el, voiceClass);
  });

  if (filtered.length) {
    return sortDrawablesReadingOrder(filtered);
  }

  const lines = groupDrawablesBySystemLine(all);
  const idx = typeof voiceStaffIndex === 'number' && voiceStaffIndex >= 0
    ? Math.min(voiceStaffIndex, lines.length - 1)
    : 0;
  return lines[idx] || all;
}

export function findStaffClickNoteEl(wrapEl, analysis, mouseEvent) {
  if (!wrapEl) return null;
  if (mouseEvent && typeof document.elementFromPoint === 'function') {
    const hit = document.elementFromPoint(mouseEvent.clientX, mouseEvent.clientY);
    let node = hit;
    while (node && node !== wrapEl) {
      if (node.classList) {
        if (node.classList.contains('abcjs-note') || node.classList.contains('abcjs-rest')) return node;
        for (let i = 0; i < node.classList.length; i += 1) {
          if (node.classList[i].indexOf('abcjs-note') >= 0 || node.classList[i].indexOf('abcjs-rest') >= 0) return node;
        }
      }
      node = node.parentNode;
    }
  }
  if (analysis && analysis.selectableElement) {
    const sel = analysis.selectableElement;
    if (sel.closest) {
      const note = sel.closest('.abcjs-note, .abcjs-rest, [class*="abcjs-note"], [class*="abcjs-rest"]');
      if (note && wrapEl.contains(note)) return note;
    }
    if (sel.classList) {
      const cls = sel.classList;
      if (cls.contains('abcjs-note') || cls.contains('abcjs-rest')) return sel;
      for (let i = 0; i < cls.length; i += 1) {
        if (cls[i].indexOf('abcjs-note') >= 0 || cls[i].indexOf('abcjs-rest') >= 0) return sel;
      }
    }
  }
  return null;
}

function anchorFromRect(rect, wrapRect, insertAfter, wrapEl) {
  const scrollLeft = wrapEl && wrapEl.scrollLeft ? wrapEl.scrollLeft : 0;
  const scrollTop = wrapEl && wrapEl.scrollTop ? wrapEl.scrollTop : 0;
  return {
    left: (insertAfter ? rect.right + 2 : rect.left) - wrapRect.left + scrollLeft,
    top: rect.top - wrapRect.top + scrollTop,
    height: Math.max(rect.height, 12),
  };
}

function anchorAtClick(clickX, clickY, lineDrawables, wrapRect, wrapEl) {
  const span = lineVerticalSpan(lineDrawables);
  const scrollLeft = wrapEl && wrapEl.scrollLeft ? wrapEl.scrollLeft : 0;
  const scrollTop = wrapEl && wrapEl.scrollTop ? wrapEl.scrollTop : 0;
  const top = clickY != null
    ? clickY - span.height / 2
    : span.top;
  return {
    left: clickX - wrapRect.left + scrollLeft,
    top: top - wrapRect.top + scrollTop,
    height: span.height,
  };
}

function caretIndexForDrawableDomIndex(events, domIdx, insertAfter) {
  let drawableSeen = -1;
  for (let i = 0; i < events.length; i += 1) {
    if (!isStaffDrawableEvent(events[i])) continue;
    drawableSeen += 1;
    if (drawableSeen === domIdx) {
      return insertAfter ? i + 1 : i;
    }
  }
  return insertAfter ? events.length : Math.max(0, events.length);
}

/** Match a clicked SVG node to its index in drawableElementsForVoice. */
export function findDrawableDomIndex(drawables, noteEl) {
  if (!noteEl || !drawables || !drawables.length) return -1;
  let idx = drawables.indexOf(noteEl);
  if (idx >= 0) return idx;
  for (let i = 0; i < drawables.length; i += 1) {
    const drawable = drawables[i];
    if (drawable.contains && drawable.contains(noteEl)) return i;
    if (noteEl.contains && noteEl.contains(drawable)) return i;
    const dr = drawable.getBoundingClientRect && drawable.getBoundingClientRect();
    const nr = noteEl.getBoundingClientRect && noteEl.getBoundingClientRect();
    if (dr && nr
      && dr.width > 0
      && nr.width > 0
      && Math.abs(dr.left - nr.left) < 3
      && Math.abs(dr.top - nr.top) < 3
      && Math.abs(dr.width - nr.width) < 3) {
      return i;
    }
  }
  let nNum = elementClassNumber(noteEl, 'abcjs-n');
  let lNum = elementClassNumber(noteEl, 'abcjs-l');
  if (nNum == null && noteEl.parentNode) {
    nNum = elementClassNumber(noteEl.parentNode, 'abcjs-n');
    lNum = elementClassNumber(noteEl.parentNode, 'abcjs-l');
  }
  if (nNum != null) {
    const clickedLine = lNum;
    for (let j = 0; j < drawables.length; j += 1) {
      if (elementClassNumber(drawables[j], 'abcjs-n') !== nNum) continue;
      const drawableLine = elementClassNumber(drawables[j], 'abcjs-l');
      if (clickedLine != null) {
        if (drawableLine === clickedLine) return j;
        continue;
      }
      return j;
    }
  }
  return -1;
}

/** Map a rendered note/rest DOM element to an editor event index. */
export function eventIndexFromStaffNoteElement(wrapEl, events, mouseEvent, analysis, voiceStaffIndex) {
  const noteEl = findStaffClickNoteEl(wrapEl, analysis, mouseEvent);
  if (!noteEl) return null;
  const drawables = drawableElementsForVoice(wrapEl, voiceStaffIndex);
  const domIdx = findDrawableDomIndex(drawables, noteEl);
  if (domIdx < 0) return null;
  return caretIndexForDrawableDomIndex(events, domIdx, false);
}

/** Stable event id for drag — abcjs selectable index order can differ from pitch order. */
export function eventIdFromStaffNoteElement(wrapEl, events, mouseEvent, analysis, voiceStaffIndex) {
  const idx = eventIndexFromStaffNoteElement(wrapEl, events, mouseEvent, analysis, voiceStaffIndex);
  if (idx == null || idx < 0 || !events[idx]) return null;
  return events[idx].id || null;
}

function clickHitsNote(noteEl, clickX, clickY) {
  if (clickX == null || clickY == null) return false;
  const rect = noteEl.getBoundingClientRect();
  return clickX >= rect.left - 1
    && clickX <= rect.right + 1
    && clickY >= rect.top - 1
    && clickY <= rect.bottom + 1;
}

/**
 * Map a horizontal click on one system line to a caret slot between/around notes and barlines.
 */
function caretFromLineDrawables(list, drawables, bars, lineDrawables, lineBars, clickX, clickY, wrapRect, wrapEl) {
  if (clickX == null) return null;

  const sortedNotes = sortLineDrawablesInReadingOrder(drawables, lineDrawables);

  for (let i = 0; i < sortedNotes.length; i += 1) {
    const rect = sortedNotes[i].getBoundingClientRect();
    const domIdx = findDrawableDomIndex(drawables, sortedNotes[i]);
    if (domIdx < 0) continue;

    if (clickX < rect.left) {
      return {
        caretIndex: caretIndexForDrawableDomIndex(list, domIdx, false),
        anchor: anchorAtClick(clickX, clickY, sortedNotes, wrapRect, wrapEl),
      };
    }

    if (clickX <= rect.right) {
      const insertAfter = clickX >= rect.left + rect.width * 0.5;
      return {
        caretIndex: caretIndexForDrawableDomIndex(list, domIdx, insertAfter),
        anchor: insertAfter
          ? anchorFromRect(rect, wrapRect, true, wrapEl)
          : anchorFromRect(rect, wrapRect, false, wrapEl),
      };
    }
  }

  const sortedBars = lineBars.slice().sort(function(a, b) {
    return a.getBoundingClientRect().left - b.getBoundingClientRect().left;
  });

  for (let bi = 0; bi < sortedBars.length; bi += 1) {
    const barEl = sortedBars[bi];
    const rect = barEl.getBoundingClientRect();
    const barDomIdx = bars.indexOf(barEl);
    if (barDomIdx < 0) continue;
    const barEventIdx = eventIndexForBarDomIndex(list, barDomIdx);

    if (clickX < rect.left) {
      return {
        caretIndex: barEventIdx,
        anchor: anchorFromRect(rect, wrapRect, false, wrapEl),
      };
    }

    if (clickX <= rect.right + 4) {
      const insertAfter = clickX >= rect.left + rect.width * 0.5;
      return {
        caretIndex: insertAfter ? barEventIdx + 1 : barEventIdx,
        anchor: insertAfter
          ? anchorFromRect(rect, wrapRect, true, wrapEl)
          : anchorFromRect(rect, wrapRect, false, wrapEl),
      };
    }
  }

  if (sortedNotes.length) {
    const last = sortedNotes[sortedNotes.length - 1];
    const lastDomIdx = findDrawableDomIndex(drawables, last);
    if (lastDomIdx >= 0) {
      return {
        caretIndex: caretIndexForDrawableDomIndex(list, lastDomIdx, true),
        anchor: anchorAtClick(clickX, clickY, sortedNotes, wrapRect, wrapEl),
      };
    }
  }

  if (sortedBars.length) {
    const lastBar = sortedBars[sortedBars.length - 1];
    const barDomIdx = bars.indexOf(lastBar);
    if (barDomIdx >= 0) {
      const barEventIdx = eventIndexForBarDomIndex(list, barDomIdx);
      return {
        caretIndex: barEventIdx + 1,
        anchor: anchorFromRect(lastBar.getBoundingClientRect(), wrapRect, true, wrapEl),
      };
    }
  }

  return null;
}

function caretIndexBeforeLine(drawables, events, lineDrawables) {
  if (!lineDrawables.length) return events.length > 0 ? events.length : 0;
  const domIdx = findDrawableDomIndex(drawables, lineDrawables[0]);
  if (domIdx <= 0) return 0;
  return caretIndexForDrawableDomIndex(events, domIdx, false);
}

/**
 * Derive caret index and on-screen anchor from where the user clicked on the staff.
 * Uses rendered SVG note/rest elements so the caret tracks clicks reliably.
 */
export function caretIndexAndAnchorFromStaffClick(wrapEl, events, mouseEvent, analysis, voiceStaffIndex) {
  if (!wrapEl) return null;
  const wrapRect = wrapEl.getBoundingClientRect();
  const drawables = drawableElementsForVoice(wrapEl, voiceStaffIndex);
  const bars = barlineElementsForVoice(wrapEl, voiceStaffIndex);
  const list = Array.isArray(events) ? events : [];
  const clickX = mouseEvent ? mouseEvent.clientX : null;
  const clickY = mouseEvent ? mouseEvent.clientY : null;
  const lineDrawables = systemLineForClick(drawables, clickY, wrapEl);
  const lineBars = elementsOnSameSystemLine(bars, clickY);

  if (clickX != null && (lineDrawables.length || lineBars.length)) {
    const fromLine = caretFromLineDrawables(
      list, drawables, bars, lineDrawables, lineBars, clickX, clickY, wrapRect, wrapEl
    );
    if (fromLine) return fromLine;
  }

  const target = findStaffClickNoteEl(wrapEl, analysis, mouseEvent);
  if (target) {
    const domIdx = findDrawableDomIndex(drawables, target);
    if (domIdx >= 0 && clickHitsNote(target, clickX, clickY)) {
      const rect = target.getBoundingClientRect();
      const insertAfter = clickX != null && clickX >= rect.left + rect.width * 0.5;
      return {
        caretIndex: caretIndexForDrawableDomIndex(list, domIdx, insertAfter),
        anchor: anchorFromRect(rect, wrapRect, insertAfter, wrapEl),
      };
    }
  }

  if (clickX != null && clickY != null) {
    const staff = staffElementAtClick(wrapEl, clickY);
    if (staff) {
      const staffRect = staff.getBoundingClientRect();
      if (
        clickX >= staffRect.left - 8
        && clickX <= staffRect.right + 8
        && clickY >= staffRect.top - 8
        && clickY <= staffRect.bottom + 8
      ) {
        const insertAtEnd = clickX > staffRect.left + staffRect.width * 0.55;
        const caretIndex = insertAtEnd
          ? list.length
          : caretIndexBeforeLine(drawables, list, lineDrawables);
        return {
          caretIndex: caretIndex,
          anchor: anchorAtClick(
            insertAtEnd ? staffRect.right - 4 : staffRect.left + 24,
            clickY,
            lineDrawables.length ? lineDrawables : [staff],
            wrapRect,
            wrapEl
          ),
        };
      }
    }
  }

  return null;
}

/**
 * Single authoritative resolver: prefer rendered-DOM click mapping when available,
 * fall back to abc-based semantic mapping.
 */
export function eventIndexFromStaffClick(wrapEl, events, mouseEvent, abcelem, analysis, voiceStaffIndex, tuneMeta, fullAbc, displayedVoiceKeys) {
  // Prefer abcjs-provided semantic mapping when an `abcelem` is available
  // (this is the case for Abc's `onClick` handler). It is more stable
  // in headless/E2E environments where DOM positions may be unreliable.
  if (abcelem || (analysis && analysis.selectableElement)) {
    try {
      const abcElemToUse = abcelem || (analysis && analysis.selectableElement ? analysis.selectableElement : null);
      if (typeof eventIndexFromStaffAbcElem === 'function') {
        return eventIndexFromStaffAbcElem(events, tuneMeta, fullAbc, displayedVoiceKeys, voiceStaffIndex, abcElemToUse, analysis);
      }
    } catch (err) {
      // swallow and continue to DOM fallback
    }
  }

  // Fallback: prefer DOM-based resolution when we have a rendered wrap and a
  // real mouseEvent with coordinates.
  try {
    if (wrapEl && mouseEvent) {
      const pos = caretIndexAndAnchorFromStaffClick(wrapEl, events, mouseEvent, analysis, voiceStaffIndex);
      if (pos && typeof pos.caretIndex === 'number') {
        // Clamp to valid range
        const idx = Math.max(0, Math.min(pos.caretIndex, Array.isArray(events) ? events.length : 0));
        return idx;
      }
    }
  } catch (err) {
    // swallow and continue to final fallback
  }

  // Final fallback: return a safe caret index bounded to [0, events.length]
  const safeLen = Array.isArray(events) ? events.length : 0;
  return safeLen > 0 ? safeLen : 0;
}

/**
 * Locate the on-staff caret line for an event caret index.
 * Returns coordinates relative to the staff wrap element, or null when unknown.
 */
function anchorBeforeBarline(bars, events, barEventIndex, wrapRect, wrapEl) {
  if (barEventIndex < 0 || barEventIndex >= events.length) return null;
  if (!isBarlineEvent(events[barEventIndex])) return null;
  const barDomIdx = countBarlinesBefore(events, barEventIndex);
  if (!bars[barDomIdx]) return null;
  return anchorFromRect(bars[barDomIdx].getBoundingClientRect(), wrapRect, false, wrapEl);
}

function anchorAfterEventsPrefix(events, index, drawables, bars, wrapRect, wrapEl) {
  if (index <= 0) {
    if (drawables[0]) {
      return anchorFromRect(drawables[0].getBoundingClientRect(), wrapRect, false, wrapEl);
    }
    const staff = staffElementAtClick(wrapEl, null);
    if (staff) {
      const rect = staff.getBoundingClientRect();
      return {
        left: Math.max(0, rect.left - wrapRect.left + 24),
        top: rect.top - wrapRect.top,
        height: Math.max(rect.height, 48),
      };
    }
    return null;
  }

  for (let i = index - 1; i >= 0; i -= 1) {
    const ev = events[i];
    if (isBarlineEvent(ev)) {
      const barDomIdx = countBarlinesBefore(events, i);
      if (bars[barDomIdx]) {
        return anchorFromRect(bars[barDomIdx].getBoundingClientRect(), wrapRect, true, wrapEl);
      }
    }
    if (isStaffDrawableEvent(ev)) {
      const dIdx = countDrawablesBefore(events, i + 1) - 1;
      if (drawables[dIdx]) {
        return anchorFromRect(drawables[dIdx].getBoundingClientRect(), wrapRect, true, wrapEl);
      }
    }
  }

  return null;
}

export function staffCaretAnchorRect(wrapEl, events, caretIndex, voiceStaffIndex) {
  if (!wrapEl) return null;
  const wrapRect = wrapEl.getBoundingClientRect();
  const drawables = drawableElementsForVoice(wrapEl, voiceStaffIndex);
  const bars = barlineElementsForVoice(wrapEl, voiceStaffIndex);
  const list = Array.isArray(events) ? events : [];
  const index = Math.max(0, Math.min(caretIndex || 0, list.length));

  if (index < list.length) {
    const ev = list[index];
    if (isBarlineEvent(ev)) {
      const anchor = anchorBeforeBarline(bars, list, index, wrapRect, wrapEl);
      if (anchor) return anchor;
    }
    if (isStaffDrawableEvent(ev)) {
      const dIdx = countDrawablesBefore(list, index);
      if (drawables[dIdx]) {
        return anchorFromRect(drawables[dIdx].getBoundingClientRect(), wrapRect, false, wrapEl);
      }
    }
  }

  return anchorAfterEventsPrefix(list, index, drawables, bars, wrapRect, wrapEl);
}

/** Bounding boxes for selected events, relative to the staff wrap element. */
export function staffSelectionAnchorRects(wrapEl, events, eventIds, voiceStaffIndex) {
  if (!wrapEl || !Array.isArray(events) || !eventIds || !eventIds.length) return [];
  const drawables = drawableElementsForVoice(wrapEl, voiceStaffIndex);
  const wrapRect = wrapEl.getBoundingClientRect();
  const scrollLeft = wrapEl.scrollLeft || 0;
  const scrollTop = wrapEl.scrollTop || 0;
  const idSet = {};
  eventIds.forEach(function(id) { idSet[id] = true; });
  const rects = [];
  let drawableSeen = -1;

  events.forEach(function(ev) {
    if (!isStaffDrawableEvent(ev)) return;
    drawableSeen += 1;
    if (!idSet[ev.id]) return;
    const el = drawables[drawableSeen];
    if (!el) return;
    const rect = el.getBoundingClientRect();
    rects.push({
      left: rect.left - wrapRect.left + scrollLeft,
      top: rect.top - wrapRect.top + scrollTop,
      width: Math.max(rect.width, 8),
      height: Math.max(rect.height, 12),
    });
  });

  return rects;
}
