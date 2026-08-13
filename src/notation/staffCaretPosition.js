import { eventIndexFromStaffAbcElem } from './voiceEventTiming';
import { isLayoutEventType } from './inlineSignatureTokens';

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
    // Never sort by abcjs-n alone — that class resets every measure (Copper Kettle:
    // A2A2^F2BE| GGFE made second-measure notes collide with first-measure ordinals).
    const measureA = elementClassNumber(a, 'abcjs-m');
    const measureB = elementClassNumber(b, 'abcjs-m');
    if (measureA != null && measureB != null && measureA !== measureB) return measureA - measureB;
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

function dedupeInteractiveDrawables(elements) {
  if (!elements.length || typeof window === 'undefined' || !window.getComputedStyle) {
    return elements;
  }
  const byKey = {};
  elements.forEach(function(el) {
    const l = elementClassNumber(el, 'abcjs-l');
    const m = elementClassNumber(el, 'abcjs-m');
    const n = elementClassNumber(el, 'abcjs-n');
    if (n == null) return;
    const key = String(l != null ? l : 'x') + ':' + String(m != null ? m : 'x') + ':' + n;
    const pe = window.getComputedStyle(el).pointerEvents;
    const existing = byKey[key];
    if (!existing) {
      byKey[key] = el;
      return;
    }
    const existingPe = window.getComputedStyle(existing).pointerEvents;
    if (existingPe === 'none' && pe !== 'none') {
      byKey[key] = el;
      return;
    }
    if (pe !== 'none' && existingPe !== 'none') {
      const er = existing.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      if (r.top > er.top) byKey[key] = el;
    }
  });
  const deduped = elements.filter(function(el) {
    const l = elementClassNumber(el, 'abcjs-l');
    const m = elementClassNumber(el, 'abcjs-m');
    const n = elementClassNumber(el, 'abcjs-n');
    if (n == null) return true;
    const key = String(l != null ? l : 'x') + ':' + String(m != null ? m : 'x') + ':' + n;
    return byKey[key] === el;
  });
  return deduped.length ? deduped : elements;
}

function noteElementsIn(root) {
  if (!root) return [];
  const direct = Array.from(root.querySelectorAll('.abcjs-note, .abcjs-rest'));
  const raw = direct.length
    ? direct
    : Array.from(root.querySelectorAll('[class*="abcjs-note"], [class*="abcjs-rest"]'));
  // Grace notes are extra DOM glyphs and must not consume drawable ordinals.
  const filtered = raw.filter(function(el) {
    const cls = elementClassName(el);
    if (cls.indexOf('abcjs-grace') >= 0) return false;
    if (el.closest && el.closest('.abcjs-grace')) return false;
    return true;
  });
  return dedupeInteractiveDrawables(filtered);
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

/**
 * With abcjs dragging={false}, note paths often have no hit-testing, so
 * elementFromPoint lands on the parent <svg>. Fall back to bounding-box hit.
 */
function findStaffNoteElByGeometry(wrapEl, clientX, clientY) {
  if (!wrapEl || clientX == null || clientY == null) return null;
  const notes = noteElementsIn(staffRenderRoot(wrapEl));
  let best = null;
  let bestArea = Infinity;
  for (let i = 0; i < notes.length; i += 1) {
    const el = notes[i];
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    // Slight pad so stem/edge clicks still count as the glyph.
    if (clientX < rect.left - 2 || clientX > rect.right + 2
      || clientY < rect.top - 2 || clientY > rect.bottom + 2) {
      continue;
    }
    const area = rect.width * rect.height;
    if (area < bestArea) {
      bestArea = area;
      best = el;
    }
  }
  return best;
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
  if (mouseEvent) {
    return findStaffNoteElByGeometry(wrapEl, mouseEvent.clientX, mouseEvent.clientY);
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
    // Prefer exact line + measure match; abcjs-n alone resets every measure.
    const mNum = elementClassNumber(noteEl, 'abcjs-m')
      || (noteEl.parentNode ? elementClassNumber(noteEl.parentNode, 'abcjs-m') : null);
    let fallback = -1;
    for (let j = 0; j < drawables.length; j += 1) {
      if (elementClassNumber(drawables[j], 'abcjs-n') !== nNum) continue;
      const drawableLine = elementClassNumber(drawables[j], 'abcjs-l');
      const drawableMeasure = elementClassNumber(drawables[j], 'abcjs-m');
      if (lNum != null && drawableLine != null && drawableLine !== lNum) continue;
      if (mNum != null && drawableMeasure != null && drawableMeasure !== mNum) continue;
      if (lNum != null && drawableLine != null && drawableLine === lNum
        && (mNum == null || drawableMeasure == null || drawableMeasure === mNum)) {
        return j;
      }
      if (fallback < 0) fallback = j;
    }
    // Only accept no-line fallback when a single candidate shares abcjs-n.
    if (fallback >= 0) {
      let sameN = 0;
      for (let k = 0; k < drawables.length; k += 1) {
        if (elementClassNumber(drawables[k], 'abcjs-n') === nNum) sameN += 1;
      }
      if (sameN === 1) return fallback;
    }
  }
  return -1;
}

/** Map a rendered note/rest DOM element to an editor event index. */
export function eventIndexFromStaffNoteElement(wrapEl, events, mouseEvent, analysis, voiceStaffIndex) {
  const noteEl = findStaffClickNoteEl(wrapEl, analysis, mouseEvent);
  if (!noteEl) return null;
  const clickX = mouseEvent ? mouseEvent.clientX : null;
  const clickY = mouseEvent ? mouseEvent.clientY : null;
  // Reject "nearby" SVG hits — only accept when the pointer is inside the glyph box.
  if (clickX != null && clickY != null && !clickHitsNote(noteEl, clickX, clickY)) {
    return null;
  }
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

/** Which staff header was clicked (clef / key / meter / tempo), from DOM. */
export function staffHeaderKindFromDomTarget(target) {
  if (!target || !target.closest) return null;
  if (target.closest('.abcjs-clef')) return 'clef';
  if (target.closest('.abcjs-key-signature')) return 'key';
  if (target.closest('.abcjs-time-signature, .abcjs-meter')) return 'meter';
  if (target.closest('.abcjs-tempo')) return 'tempo';
  return null;
}

/** True when the click target is a staff header glyph (clef, key, meter, tempo). */
export function isStaffHeaderDomTarget(target) {
  return !!staffHeaderKindFromDomTarget(target);
}

/** Horizontal insert bounds from notehead geometry (ignores stem width). */
function noteInsertBounds(noteEl) {
  const rects = noteheadClientRects(noteEl);
  if (!rects.length) {
    const rect = noteEl.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      mid: rect.left + rect.width * 0.5,
    };
  }
  let left = Infinity;
  let right = -Infinity;
  rects.forEach(function(r) {
    left = Math.min(left, r.left);
    right = Math.max(right, r.right);
  });
  return {
    left: left,
    right: right,
    mid: left + (right - left) * 0.5,
  };
}

/** Client rects for noteheads (excludes stems). */
function noteheadClientRects(noteEl) {
  const rects = [];
  if (!noteEl) return rects;
  const paths = noteEl.querySelectorAll ? noteEl.querySelectorAll('path, ellipse') : [];
  for (let i = 0; i < paths.length; i += 1) {
    const p = paths[i];
    const cls = String(p.className && (p.className.baseVal || p.className) || '');
    if (cls.indexOf('stem') >= 0 || cls.indexOf('ledger') >= 0) continue;
    const r = p.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.height > 18) continue;
    rects.push(r);
  }
  if (rects.length) return rects;
  const rect = noteEl.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return rects;
  if (rect.height <= rect.width * 1.6) {
    rects.push(rect);
    return rects;
  }
  const headH = Math.min(14, rect.height * 0.35);
  rects.push({
    left: rect.left,
    right: rect.right,
    top: rect.bottom - headH,
    bottom: rect.bottom,
    width: rect.width,
    height: headH,
  });
  return rects;
}

function clientRectIntersectsMarquee(rect, left, right, top, bottom) {
  return rect.right >= left && rect.left <= right && rect.bottom >= top && rect.top <= bottom;
}

/** True when any notehead overlaps a client-space marquee. */
export function noteheadIntersectsMarquee(noteEl, left, right, top, bottom) {
  const rects = noteheadClientRects(noteEl);
  for (let i = 0; i < rects.length; i += 1) {
    if (clientRectIntersectsMarquee(rects[i], left, right, top, bottom)) return true;
  }
  return false;
}

/** True when the pointer is on the notehead, not the stem or empty stem padding. */
export function clickHitsNotehead(noteEl, clickX, clickY) {
  if (!noteEl || clickX == null || clickY == null) return false;
  const rects = noteheadClientRects(noteEl);
  for (let i = 0; i < rects.length; i += 1) {
    const r = rects[i];
    if (clickX >= r.left - 2 && clickX <= r.right + 2
      && clickY >= r.top - 2 && clickY <= r.bottom + 2) {
      return true;
    }
  }
  return false;
}

/**
 * Map a horizontal click on one system line to a caret slot between/around notes and barlines.
 * Notes and barlines are interleaved by X so clicks in empty measures (between bars) resolve
 * to the gap, not to the next note after later barlines.
 *
 * When the click lands on a note/rest glyph, also returns hitEventIndex (the event under the
 * pointer) so selection can pin that note even if caretIndex is "after" (right-half bisect).
 */
function onlyTrailingLayoutAfter(list, index) {
  for (let i = index; i < list.length; i += 1) {
    if (!isLayoutEventType(list[i].type)) return false;
  }
  return true;
}

function terminalAppendIndex(list, afterNoteIndex) {
  if (!onlyTrailingLayoutAfter(list, afterNoteIndex)) return afterNoteIndex;
  return list.length;
}

function caretFromLineDrawables(list, drawables, bars, lineDrawables, lineBars, clickX, clickY, wrapRect, wrapEl) {
  if (clickX == null) return null;

  const sortedNotes = sortLineDrawablesInReadingOrder(drawables, lineDrawables);
  const sortedBars = lineBars.slice().sort(function(a, b) {
    return a.getBoundingClientRect().left - b.getBoundingClientRect().left;
  });

  if (clickX != null && sortedNotes.length) {
    const firstRect = sortedNotes[0].getBoundingClientRect();
    if (clickX < firstRect.left - 4) {
      const firstDomIdx = findDrawableDomIndex(drawables, sortedNotes[0]);
      const caretIndex = firstDomIdx > 0
        ? caretIndexForDrawableDomIndex(list, firstDomIdx, false)
        : 0;
      return {
        caretIndex: caretIndex,
        anchor: anchorAtClick(clickX, clickY, sortedNotes, wrapRect, wrapEl),
      };
    }
  }

  const targets = [];
  let rightmostNoteDomIdx = -1;
  sortedNotes.forEach(function(el) {
    const domIdx = findDrawableDomIndex(drawables, el);
    if (domIdx >= 0 && domIdx >= rightmostNoteDomIdx) rightmostNoteDomIdx = domIdx;
  });
  sortedNotes.forEach(function(el) {
    const rect = el.getBoundingClientRect();
    const domIdx = findDrawableDomIndex(drawables, el);
    if (domIdx < 0) return;
    const head = noteInsertBounds(el);
    const afterNote = caretIndexForDrawableDomIndex(list, domIdx, true);
    const terminalNote = domIdx === rightmostNoteDomIdx
      && terminalAppendIndex(list, afterNote) === list.length;
    targets.push({
      kind: 'note',
      el: el,
      left: head.left,
      right: head.right + (terminalNote ? 72 : 4),
      mid: head.mid,
      rect: rect,
      domIdx: domIdx,
      terminalNote: terminalNote,
    });
  });
  sortedBars.forEach(function(el) {
    const rect = el.getBoundingClientRect();
    const barDomIdx = bars.indexOf(el);
    if (barDomIdx < 0) return;
    const barEventIdx = eventIndexForBarDomIndex(list, barDomIdx);
    const trailing = onlyTrailingLayoutAfter(list, barEventIdx);
    targets.push({
      kind: 'bar',
      el: el,
      left: rect.left,
      // Wide hit area past the final bar so "click after last note" can reach append.
      right: rect.right + (trailing ? 64 : 4),
      mid: rect.left + Math.max(rect.width, 1) * 0.5,
      rect: rect,
      barEventIdx: barEventIdx,
      trailing: trailing,
    });
  });

  targets.sort(function(a, b) {
    if (a.left !== b.left) return a.left - b.left;
    if (a.kind === b.kind) return 0;
    return a.kind === 'note' ? -1 : 1;
  });

  for (let i = 0; i < targets.length; i += 1) {
    const t = targets[i];

    if (clickX < t.left) {
      if (t.kind === 'note') {
        return {
          caretIndex: caretIndexForDrawableDomIndex(list, t.domIdx, false),
          hitEventIndex: caretIndexForDrawableDomIndex(list, t.domIdx, false),
          anchor: anchorAtClick(clickX, clickY, sortedNotes.length ? sortedNotes : [t.el], wrapRect, wrapEl),
        };
      }
      // Gap before bar: terminal trailing bar → append after |; mid-score empty measure → bar index.
      return {
        caretIndex: t.trailing ? list.length : t.barEventIdx,
        anchor: anchorFromRect(t.rect, wrapRect, !!t.trailing, wrapEl),
      };
    }

    if (clickX <= t.right) {
      const insertAfter = clickX >= t.mid;
      if (t.kind === 'note') {
        const noteIdx = caretIndexForDrawableDomIndex(list, t.domIdx, false);
        const afterNote = caretIndexForDrawableDomIndex(list, t.domIdx, insertAfter);
        // Right half of final note before only trailing bars → true end (after |).
        if (insertAfter && terminalAppendIndex(list, afterNote) === list.length) {
          return {
            caretIndex: list.length,
            hitEventIndex: noteIdx,
            anchor: anchorFromRect(t.rect, wrapRect, true, wrapEl),
          };
        }
        return {
          caretIndex: afterNote,
          hitEventIndex: noteIdx,
          anchor: insertAfter
            ? anchorFromRect(t.rect, wrapRect, true, wrapEl)
            : anchorFromRect(t.rect, wrapRect, false, wrapEl),
        };
      }
      // On/past a trailing final bar → always append at end.
      if (t.trailing) {
        return {
          caretIndex: list.length,
          anchor: anchorFromRect(t.rect, wrapRect, true, wrapEl),
        };
      }
      return {
        caretIndex: insertAfter ? t.barEventIdx + 1 : t.barEventIdx,
        anchor: insertAfter
          ? anchorFromRect(t.rect, wrapRect, true, wrapEl)
          : anchorFromRect(t.rect, wrapRect, false, wrapEl),
      };
    }
  }

  if (targets.length) {
    const last = targets[targets.length - 1];
    // Past every note on this line (with or without a trailing bar): append when no
    // further music events follow after that note — covers Copper-style `| GGFE` endings.
    const rightmostNote = targets.reduce(function(best, t) {
      if (t.kind !== 'note') return best;
      if (!best || t.right >= best.right) return t;
      return best;
    }, null);
    if (rightmostNote && clickX > rightmostNote.right) {
      const afterNote = caretIndexForDrawableDomIndex(list, rightmostNote.domIdx, true);
      let caret = afterNote;
      let musicAfter = false;
      for (let j = afterNote; j < list.length; j += 1) {
        if (isStaffDrawableEvent(list[j])) {
          musicAfter = true;
          break;
        }
      }
      if (!musicAfter) caret = list.length;
      return {
        caretIndex: caret,
        anchor: anchorAtClick(
          clickX,
          clickY,
          sortedNotes.length ? sortedNotes : [rightmostNote.el],
          wrapRect,
          wrapEl
        ),
      };
    }
    if (last.kind === 'bar') {
      return {
        caretIndex: last.trailing ? list.length : Math.min(last.barEventIdx + 1, list.length),
        anchor: anchorFromRect(last.rect, wrapRect, true, wrapEl),
      };
    }
    const afterNote = caretIndexForDrawableDomIndex(list, last.domIdx, true);
    return {
      caretIndex: terminalAppendIndex(list, afterNote),
      anchor: anchorAtClick(
        clickX,
        clickY,
        sortedNotes.length ? sortedNotes : [last.el],
        wrapRect,
        wrapEl
      ),
    };
  }

  return null;
}

function caretIndexBeforeLine(drawables, events, lineDrawables) {
  if (!lineDrawables.length) {
    if (drawables.length) {
      const domIdx = findDrawableDomIndex(drawables, drawables[0]);
      return domIdx > 0 ? caretIndexForDrawableDomIndex(events, domIdx, false) : 0;
    }
    return 0;
  }
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
  let lineDrawables = systemLineForClick(drawables, clickY, wrapEl);
  if (!lineDrawables.length) {
    lineDrawables = elementsOnSameSystemLine(drawables, clickY, 48);
  }
  // Bars are thin vertical strokes — widen Y so a click at notehead height still sees them.
  const lineBars = elementsOnSameSystemLine(bars, clickY, 48);

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
      const noteIdx = caretIndexForDrawableDomIndex(list, domIdx, false);
      return {
        caretIndex: caretIndexForDrawableDomIndex(list, domIdx, insertAfter),
        hitEventIndex: noteIdx,
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
        // Prefer nearest barline/note on this staff Y rather than coarse 55% start/end.
        const nearBars = elementsOnSameSystemLine(bars, clickY, 48);
        const nearNotes = elementsOnSameSystemLine(drawables, clickY, 40);
        if (nearBars.length || nearNotes.length) {
          const fromNear = caretFromLineDrawables(
            list, drawables, bars, nearNotes, nearBars, clickX, clickY, wrapRect, wrapEl
          );
          if (fromNear) return fromNear;
        }
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

/**
 * Client-space center of the notehead inside an abcjs note/rest glyph.
 * Ignores stems/flags/ledgers so pitch-drag ghosts track the head, not the stem box.
 */
export function noteheadCenterInElement(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return null;
  const nodes = el.querySelectorAll
    ? Array.from(el.querySelectorAll('path, ellipse, use, circle'))
    : [];
  let best = null;
  nodes.forEach(function(node) {
    const cls = elementClassName(node);
    if (cls.indexOf('stem') >= 0
      || cls.indexOf('flag') >= 0
      || cls.indexOf('ledger') >= 0
      || cls.indexOf('dot') >= 0) {
      return;
    }
    const r = node.getBoundingClientRect();
    if (r.width < 4 || r.height < 3 || r.height > 22 || r.width > 30) return;
    // Prefer head-like aspect (not a thin vertical scrap).
    if (r.height > r.width * 2.2) return;
    const area = r.width * r.height;
    if (!best || area > best.area) {
      best = {
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
        area: area,
      };
    }
  });
  if (best) return { x: best.x, y: best.y };

  const rect = el.getBoundingClientRect();
  const stem = el.querySelector
    ? (el.querySelector('.abcjs-stem, [class*="stem"]') || null)
    : null;
  if (stem && rect.height > rect.width * 1.6) {
    const sr = stem.getBoundingClientRect();
    const stemMid = sr.top + sr.height / 2;
    const boxMid = rect.top + rect.height / 2;
    // Stem above box mid → head sits near the bottom; otherwise near the top.
    const y = stemMid < boxMid
      ? (rect.bottom - Math.min(8, rect.height * 0.22))
      : (rect.top + Math.min(8, rect.height * 0.22));
    return { x: rect.left + rect.width / 2, y: y };
  }
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

/** Bounding boxes for selected events, relative to the staff wrap element. */
export function staffSelectionAnchorRects(wrapEl, events, eventIds, voiceStaffIndex) {
  if (!wrapEl || !Array.isArray(events) || !eventIds || !eventIds.length) return [];
  const drawables = drawableElementsForVoice(wrapEl, voiceStaffIndex);
  const bars = barlineElementsForVoice(wrapEl, voiceStaffIndex);
  const wrapRect = wrapEl.getBoundingClientRect();
  const scrollLeft = wrapEl.scrollLeft || 0;
  const scrollTop = wrapEl.scrollTop || 0;
  const idSet = {};
  eventIds.forEach(function(id) { idSet[id] = true; });
  const rects = [];
  let drawableSeen = -1;
  let barSeen = -1;

  events.forEach(function(ev) {
    if (isBarlineEvent(ev)) {
      barSeen += 1;
      if (!idSet[ev.id]) return;
      const el = bars[barSeen];
      if (!el) return;
      const rect = el.getBoundingClientRect();
      rects.push({
        left: rect.left - wrapRect.left + scrollLeft - 2,
        top: rect.top - wrapRect.top + scrollTop,
        width: Math.max(rect.width + 4, 6),
        height: Math.max(rect.height, 12),
      });
      return;
    }
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

/**
 * Apply abcjs-style selection classes on staff drawables (notes turn blue).
 * Scoped to one voice staff — does not disturb other displayed voices.
 */
export function syncStaffSelectionHighlight(wrapEl, events, eventIds, voiceStaffIndex) {
  if (!wrapEl) return;
  const drawables = drawableElementsForVoice(wrapEl, voiceStaffIndex);
  const bars = barlineElementsForVoice(wrapEl, voiceStaffIndex);
  drawables.forEach(function(el) {
    el.classList.remove('abcjs-note_selected');
    el.classList.remove('notation-rest-selected');
  });
  bars.forEach(function(el) {
    el.classList.remove('notation-barline-selected');
  });
  if (!Array.isArray(events) || !eventIds || !eventIds.length) return;

  const idSet = {};
  eventIds.forEach(function(id) { idSet[id] = true; });
  let drawableSeen = -1;
  let barSeen = -1;

  events.forEach(function(ev) {
    if (isBarlineEvent(ev)) {
      barSeen += 1;
      if (!idSet[ev.id]) return;
      const el = bars[barSeen];
      if (el) el.classList.add('notation-barline-selected');
      return;
    }
    if (!isStaffDrawableEvent(ev)) return;
    drawableSeen += 1;
    if (!idSet[ev.id]) return;
    const el = drawables[drawableSeen];
    if (!el) return;
    if (ev.type === 'rest') {
      el.classList.add('notation-rest-selected');
    } else if (ev.type === 'note' || ev.type === 'chord') {
      el.classList.add('abcjs-note_selected');
    }
  });
}

/**
 * Notehead centers for pitched selected events, relative to the staff wrap.
 * Used so pitch-drag landing ghosts sit on the same staff positions notes land on.
 */
export function staffNoteheadCentersForEventIds(wrapEl, events, eventIds, voiceStaffIndex) {
  if (!wrapEl || !Array.isArray(events) || !eventIds || !eventIds.length) return [];
  const drawables = drawableElementsForVoice(wrapEl, voiceStaffIndex);
  const wrapRect = wrapEl.getBoundingClientRect();
  const scrollLeft = wrapEl.scrollLeft || 0;
  const scrollTop = wrapEl.scrollTop || 0;
  const idSet = {};
  eventIds.forEach(function(id) { idSet[id] = true; });
  const centers = [];
  let drawableSeen = -1;

  events.forEach(function(ev) {
    if (isBarlineEvent(ev)) return;
    if (!isStaffDrawableEvent(ev)) return;
    drawableSeen += 1;
    if (!idSet[ev.id]) return;
    if (ev.type !== 'note' && ev.type !== 'chord') return;
    const el = drawables[drawableSeen];
    if (!el) return;
    const head = noteheadCenterInElement(el);
    if (!head) return;
    centers.push({
      x: head.x - wrapRect.left + scrollLeft,
      y: head.y - wrapRect.top + scrollTop,
    });
  });

  return centers;
}

/** Barline event under a pointer click, if any. */
export function findBarlineEventAtClick(wrapEl, events, mouseEvent, voiceStaffIndex) {
  if (!wrapEl || !mouseEvent || !Array.isArray(events)) return null;
  const bars = barlineElementsForVoice(wrapEl, voiceStaffIndex);
  const x = mouseEvent.clientX;
  const y = mouseEvent.clientY;
  for (let i = 0; i < bars.length; i += 1) {
    const rect = bars[i].getBoundingClientRect();
    if (x >= rect.left - 3 && x <= rect.right + 3
      && y >= rect.top - 6 && y <= rect.bottom + 6) {
      const idx = eventIndexForBarDomIndex(events, i);
      if (idx >= 0 && events[idx] && events[idx].type === 'barline') return events[idx];
    }
  }
  return null;
}

/**
 * Select drawable + barline events whose glyph centers intersect a client-space marquee.
 * @param {{ left: number, top: number, right: number, bottom: number }} marquee client coords
 */
export function staffMarqueeSelectEventIds(wrapEl, events, marquee, voiceStaffIndex) {
  if (!wrapEl || !marquee || !Array.isArray(events)) return [];
  const drawables = drawableElementsForVoice(wrapEl, voiceStaffIndex);
  const bars = barlineElementsForVoice(wrapEl, voiceStaffIndex);
  const ids = [];
  let drawableSeen = -1;
  let barSeen = -1;
  const left = Math.min(marquee.left, marquee.right);
  const right = Math.max(marquee.left, marquee.right);
  const top = Math.min(marquee.top, marquee.bottom);
  const bottom = Math.max(marquee.top, marquee.bottom);

  function centerIn(rect) {
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return cx >= left && cx <= right && cy >= top && cy <= bottom;
  }

  events.forEach(function(ev) {
    if (isBarlineEvent(ev)) {
      barSeen += 1;
      const el = bars[barSeen];
      if (el && centerIn(el.getBoundingClientRect())) ids.push(ev.id);
      return;
    }
    if (!isStaffDrawableEvent(ev)) return;
    drawableSeen += 1;
    const el = drawables[drawableSeen];
    if (!el) return;
    if (ev.type === 'note' || ev.type === 'chord') {
      if (noteheadIntersectsMarquee(el, left, right, top, bottom)) ids.push(ev.id);
      return;
    }
    if (centerIn(el.getBoundingClientRect())) ids.push(ev.id);
  });
  return ids;
}
