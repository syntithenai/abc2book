import { getLinkRegionStart, getLinkRegionEnd } from './mediaPlaybackUtils';
import { isLyricVersionSeparator } from './chordSheetUtils';
import { getLyricLinesForDisplay } from './wLinesUtils';

export const LYRICS_AUTOSCROLL_DEFAULT_DURATION_SEC = 240;
export const LYRICS_SECONDS_PER_LINE = 6;
export const LYRICS_AUTOSCROLL_SPEED_STEP = 1.2;
export const LYRICS_AUTOSCROLL_MIN_MULTIPLIER = 0.1;
export const LYRICS_AUTOSCROLL_MAX_MULTIPLIER = 3;
/** Finish scrolling this fraction of the way through the song (reach page end before the outro). */
export const LYRICS_AUTOSCROLL_COMPLETION_RATIO = 0.9;
export const LYRICS_AUTOSCROLL_BOTTOM_HOLD_MS = 1000;
export const LYRICS_AUTOSCROLL_BOTTOM_THRESHOLD_PX = 3;

const LYRICS_SCROLL_ROOT_SELECTORS = [
  '.tune-lyrics-structure-sync-host',
  '.music-view-lyrics',
  '.full-lyrics-panel',
  '.timed-lyrics-chords-view:not(.chord-blocks-only)',
  '.lyrics',
].join(', ');

const LYRICS_LINE_SELECTORS = [
  '.lyrics-line',
  '.chordpro-line',
  '.lyrics-block',
  '.chord-line',
  '.structure-section',
].join(', ');

const NOTATION_SCROLL_SELECTORS = [
  '.tune-panel-notation',
  '.music-body-notation',
  '.music-view-notation',
  '.gig-mode-notation-col',
  '.music-and-lyrics-notation',
  '.music-notation-section',
].join(', ');

const CHORDS_SCROLL_ROOT_SELECTORS = [
  '.tune-panel-structure',
  '.structure-chord-block',
  '.music-chords-block-col',
  '.chord-blocks-only',
  '.chord-block-view',
].join(', ');

const PREFERRED_LYRICS_SCROLL_CONTAINER_SELECTORS = [
  '.tune-lyrics-structure-sync-host--scrollable',
  '.tune-lyrics-structure-sync-host--fit-height',
  '.lyrics-fit-height-host--scrollable',
  '.gig-mode-lyrics-col',
  '.music-and-lyrics-text',
];

export function getTuneLink(tune, linkIndex) {
  if (!tune || !Array.isArray(tune.links) || tune.links.length === 0) return null;
  const index = linkIndex != null && tune.links[linkIndex] ? linkIndex : 0;
  return tune.links[index] || null;
}

export function getLyricLinesForAutoscroll(tune) {
  const lines = getLyricLinesForDisplay(tune);
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isLyricVersionSeparator(line)) break;
    if (line && String(line).trim().length > 0) {
      result.push(line);
    }
  }
  return result;
}

export function countLyricLinesForScroll(tune) {
  return getLyricLinesForAutoscroll(tune).length;
}

function readLoadedMediaElementDuration(mediaController) {
  if (!mediaController) return 0;
  if (mediaController.filteredPlayerRef && mediaController.filteredPlayerRef.current) {
    const d = mediaController.filteredPlayerRef.current.duration;
    if (d > 0 && isFinite(d)) return d;
  }
  if (mediaController.playerRef && mediaController.playerRef.current) {
    const d = mediaController.playerRef.current.duration;
    if (d > 0 && isFinite(d)) return d;
  }
  if (mediaController.ytPlayerRef && mediaController.ytPlayerRef.current) {
    try {
      const d = mediaController.ytPlayerRef.current.getDuration();
      if (d > 0 && isFinite(d)) return d;
    } catch (e) {}
  }
  return 0;
}

export function resolveLyricsScrollMediaDuration(tune, mediaController, linkIndex) {
  if (!getTuneLink(tune, linkIndex)) return 0;
  if (!mediaController) return 0;
  return readLoadedMediaElementDuration(mediaController);
}

function applyRegionToMediaDuration(tune, totalMediaDuration, linkIndex) {
  const link = getTuneLink(tune, linkIndex);
  const start = getLinkRegionStart(link);
  const end = getLinkRegionEnd(link);
  if (end > start) return Math.max(1, end - start);
  if (start > 0 && totalMediaDuration > start) return Math.max(1, totalMediaDuration - start);
  return Math.max(1, totalMediaDuration);
}

export function getEffectiveMediaDurationSeconds(tune, mediaController, linkIndex) {
  const lineCount = countLyricLinesForScroll(tune);
  const fromLines = lineCount > 0 ? lineCount * LYRICS_SECONDS_PER_LINE : 0;
  const rawMedia = resolveLyricsScrollMediaDuration(tune, mediaController, linkIndex);
  const fromMedia = rawMedia > 0 ? applyRegionToMediaDuration(tune, rawMedia, linkIndex) : 0;
  if (fromMedia > 0) {
    return Math.max(fromMedia, fromLines);
  }
  return Math.max(LYRICS_AUTOSCROLL_DEFAULT_DURATION_SEC, fromLines);
}

export function getLyricsAutoscrollDurationSeconds(tune, mediaController, linkIndex) {
  const effective = getEffectiveMediaDurationSeconds(tune, mediaController, linkIndex);
  const hasMedia = resolveLyricsScrollMediaDuration(tune, mediaController, linkIndex) > 0;
  if (hasMedia) {
    return Math.max(1, effective * LYRICS_AUTOSCROLL_COMPLETION_RATIO);
  }
  return effective;
}

export function isElementVisible(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function findLyricsScrollRoot(musicSingleEl) {
  if (!musicSingleEl || typeof musicSingleEl.querySelectorAll !== 'function') return null;
  const matches = musicSingleEl.querySelectorAll(LYRICS_SCROLL_ROOT_SELECTORS);
  for (let i = 0; i < matches.length; i++) {
    if (isElementVisible(matches[i])) return matches[i];
  }
  return null;
}

export function findVisibleNotationElement(contextEl) {
  if (!contextEl || typeof contextEl.querySelectorAll !== 'function') return null;
  const matches = contextEl.querySelectorAll(NOTATION_SCROLL_SELECTORS);
  for (let i = 0; i < matches.length; i++) {
    if (isElementVisible(matches[i])) return matches[i];
  }
  return null;
}

export function findVisibleChordsBlockElement(contextEl) {
  if (!contextEl || typeof contextEl.querySelectorAll !== 'function') return null;
  const matches = contextEl.querySelectorAll(CHORDS_SCROLL_ROOT_SELECTORS);
  for (let i = 0; i < matches.length; i++) {
    if (isElementVisible(matches[i])) return matches[i];
  }
  return null;
}

/**
 * Prefer lyrics height, then notation, then chord block for autoscroll distance.
 */
export function findAutoscrollContentRoot(musicSingleEl) {
  const lyricsRoot = findLyricsScrollRoot(musicSingleEl);
  if (lyricsRoot) return lyricsRoot;
  const notationEl = findVisibleNotationElement(musicSingleEl);
  if (notationEl) return notationEl;
  return findVisibleChordsBlockElement(musicSingleEl);
}

export function isNotationStackedAboveLyrics(notationEl, lyricsRootEl) {
  if (!notationEl || !lyricsRootEl) return false;
  const nRect = notationEl.getBoundingClientRect();
  const lRect = lyricsRootEl.getBoundingClientRect();
  if (nRect.height <= 0 || lRect.height <= 0) return false;
  const horizontalOverlap = nRect.left < lRect.right && nRect.right > lRect.left;
  const verticallyAligned = Math.abs(nRect.top - lRect.top) < 40;
  if (horizontalOverlap && verticallyAligned) return false;
  return lRect.top >= nRect.bottom - 8;
}

function getWindowScrollTopOffset(musicSingleEl, contentRootEl) {
  let offset = getWindowScrollChromeOffset();
  // When scrolling lyrics below stacked notation, keep the notation visible.
  // When the content root *is* the notation (lyrics off), do not pin to its
  // bottom — that would make distance ~0 and show "Fits on screen".
  const notationEl = findVisibleNotationElement(musicSingleEl);
  if (
    notationEl
    && contentRootEl
    && notationEl !== contentRootEl
    && !notationEl.contains(contentRootEl)
    && !contentRootEl.contains(notationEl)
    && isNotationStackedAboveLyrics(notationEl, contentRootEl)
  ) {
    const notationBottom = notationEl.getBoundingClientRect().bottom;
    if (notationBottom > offset) offset = notationBottom;
  }
  return offset;
}

function isScrollableContainer(el) {
  if (!el || el === document.documentElement || el === document.body) return false;
  const style = window.getComputedStyle(el);
  const overflowY = style.overflowY;
  if (overflowY !== 'auto' && overflowY !== 'scroll' && overflowY !== 'overlay') return false;
  return el.scrollHeight > el.clientHeight + 1;
}

export function findScrollableContainer(element) {
  let el = element ? element.parentElement : null;
  while (el) {
    if (isScrollableContainer(el)) return el;
    if (el === document.documentElement || el === document.body) break;
    el = el.parentElement;
  }
  return null;
}

export function findPreferredLyricsScrollContainer(lyricsRoot, musicSingleEl) {
  if (!lyricsRoot) return null;
  const searchRoot = musicSingleEl && typeof musicSingleEl.querySelectorAll === 'function'
    ? musicSingleEl
    : document;
  for (let i = 0; i < PREFERRED_LYRICS_SCROLL_CONTAINER_SELECTORS.length; i++) {
    const selector = PREFERRED_LYRICS_SCROLL_CONTAINER_SELECTORS[i];
    const candidates = searchRoot.querySelectorAll(selector);
    for (let j = 0; j < candidates.length; j++) {
      const candidate = candidates[j];
      if (!candidate.contains(lyricsRoot)) continue;
      if (isScrollableContainer(candidate)) return candidate;
    }
  }
  return findScrollableContainer(lyricsRoot);
}

export function getLyricsScrollContext(musicSingleEl) {
  const contentRoot = findAutoscrollContentRoot(musicSingleEl);
  if (!contentRoot) {
    return { lyricsRoot: null, scrollContainer: null, mode: 'window', notationEl: null };
  }
  const scrollContainer = findPreferredLyricsScrollContainer(contentRoot, musicSingleEl);
  if (scrollContainer) {
    return {
      lyricsRoot: contentRoot,
      scrollContainer: scrollContainer,
      mode: 'element',
      notationEl: findVisibleNotationElement(musicSingleEl),
    };
  }
  return {
    lyricsRoot: contentRoot,
    scrollContainer: null,
    mode: 'window',
    notationEl: findVisibleNotationElement(musicSingleEl),
  };
}

function isNestedLyricsLineElement(el, scrollRootEl) {
  if (!el || !el.classList || !el.classList.contains('lyrics-line')) return false;
  const parentBlock = el.closest('.lyrics-block');
  return !!(parentBlock && scrollRootEl && scrollRootEl.contains(parentBlock));
}

function getAutoscrollLineElements(scrollRootEl) {
  if (!scrollRootEl || typeof scrollRootEl.querySelectorAll !== 'function') return [];
  const lineEls = scrollRootEl.querySelectorAll(LYRICS_LINE_SELECTORS);
  const result = [];
  for (let i = 0; i < lineEls.length; i++) {
    const el = lineEls[i];
    if (isLyricVersionSeparator(el.textContent)) break;
    if (isNestedLyricsLineElement(el, scrollRootEl)) continue;
    result.push(el);
  }
  return result;
}

function getLyricsScrollAnchor(scrollRootEl) {
  if (!scrollRootEl || typeof scrollRootEl.querySelector !== 'function') return scrollRootEl;
  const lineEls = getAutoscrollLineElements(scrollRootEl);
  if (lineEls.length > 0 && isElementVisible(lineEls[0])) return lineEls[0];
  const firstLine = scrollRootEl.querySelector(LYRICS_LINE_SELECTORS);
  if (firstLine && isElementVisible(firstLine)) return firstLine;
  return scrollRootEl;
}

function getWindowScrollChromeOffset() {
  const autoscrollPanel = document.querySelector('.lyrics-autoscroll-bar-panel');
  if (autoscrollPanel) {
    return autoscrollPanel.getBoundingClientRect().bottom;
  }
  const autoscrollBar = document.querySelector('.lyrics-autoscroll-bar');
  if (autoscrollBar) {
    return autoscrollBar.getBoundingClientRect().bottom;
  }
  const header = document.querySelector('.App-header');
  if (header) {
    return header.getBoundingClientRect().bottom;
  }
  return 0;
}

function measureLyricsEndScrollTop(scrollRootEl, container) {
  const lineEls = getAutoscrollLineElements(scrollRootEl);
  if (lineEls.length > 0) {
    const lastLine = lineEls[lineEls.length - 1];
    const lastRect = lastLine.getBoundingClientRect();
    if (container) {
      const containerRect = container.getBoundingClientRect();
      return container.scrollTop + (lastRect.bottom - containerRect.top) - container.clientHeight;
    }
    return window.scrollY + lastRect.bottom - window.innerHeight;
  }
  const rect = scrollRootEl.getBoundingClientRect();
  if (container) {
    const containerRect = container.getBoundingClientRect();
    return container.scrollTop + (rect.bottom - containerRect.top) - container.clientHeight;
  }
  return window.scrollY + rect.bottom - window.innerHeight;
}

function measureWindowLyricsEndScrollTop(scrollRootEl) {
  const lineEls = getAutoscrollLineElements(scrollRootEl);
  if (lineEls.length > 0) {
    const lastLine = lineEls[lineEls.length - 1];
    const lastRect = lastLine.getBoundingClientRect();
    return window.scrollY + lastRect.bottom - window.innerHeight;
  }
  const rect = scrollRootEl.getBoundingClientRect();
  return window.scrollY + rect.bottom - window.innerHeight;
}

export function getLyricsScrollMetrics(scrollRootEl, scrollContext, musicSingleEl) {
  if (!scrollRootEl || typeof scrollRootEl.getBoundingClientRect !== 'function') {
    return { mode: 'window', scrollContainer: null, startY: 0, distance: 0 };
  }

  const anchorEl = getLyricsScrollAnchor(scrollRootEl);
  const anchorRect = anchorEl.getBoundingClientRect();

  if (scrollContext && scrollContext.mode === 'element' && scrollContext.scrollContainer) {
    const container = scrollContext.scrollContainer;
    const containerRect = container.getBoundingClientRect();
    const startY = Math.max(0, container.scrollTop + (anchorRect.top - containerRect.top));
    const endY = Math.min(
      Math.max(0, measureLyricsEndScrollTop(scrollRootEl, container)),
      Math.max(0, container.scrollHeight - container.clientHeight)
    );
    return {
      mode: 'element',
      scrollContainer: container,
      startY: startY,
      distance: Math.max(0, endY - startY),
    };
  }

  const topOffset = getWindowScrollTopOffset(musicSingleEl, scrollRootEl);
  const startY = Math.max(0, window.scrollY + anchorRect.top - topOffset);
  const endY = Math.min(
    Math.max(0, measureWindowLyricsEndScrollTop(scrollRootEl)),
    Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
  );
  return {
    mode: 'window',
    scrollContainer: null,
    startY: startY,
    distance: Math.max(0, endY - startY),
  };
}

export function applyLyricsScrollPosition(scrollState, y) {
  const position = Math.max(0, y);
  if (scrollState && scrollState.mode === 'element' && scrollState.scrollContainer) {
    scrollState.scrollContainer.scrollTop = position;
    return;
  }
  window.scrollTo(0, position);
}

export function readLyricsScrollPosition(scrollState) {
  if (scrollState && scrollState.mode === 'element' && scrollState.scrollContainer) {
    return scrollState.scrollContainer.scrollTop;
  }
  return window.scrollY || document.documentElement.scrollTop || 0;
}

/** @type {{ nudgeByPixels: (delta: number) => void } | null} */
let activeLyricsAutoscrollSession = null;

export function setActiveLyricsAutoscrollSession(session) {
  activeLyricsAutoscrollSession = session;
}

export function getActiveLyricsAutoscrollSession() {
  return activeLyricsAutoscrollSession;
}

export function isAtLyricsScrollBottom(scrollState, currentY, thresholdPx) {
  if (!scrollState) return false;
  const threshold = thresholdPx != null ? thresholdPx : LYRICS_AUTOSCROLL_BOTTOM_THRESHOLD_PX;
  return currentY >= scrollState.endY - threshold;
}

export function resyncAutoscrollToManualPosition(scrollState, currentY) {
  if (!scrollState) return { atBottom: true };
  const position = Math.max(0, currentY);
  if (isAtLyricsScrollBottom(scrollState, position)) {
    scrollState.startY = scrollState.endY;
    scrollState.startTime = performance.now();
    scrollState.totalMs = Number.POSITIVE_INFINITY;
    return { atBottom: true };
  }
  const remaining = scrollState.endY - position;
  scrollState.startY = position;
  scrollState.startTime = performance.now();
  if (scrollState.pixelsPerMs > 0) {
    scrollState.totalMs = remaining / scrollState.pixelsPerMs;
  }
  return { atBottom: false };
}

/** Apply a new speed multiplier to an in-progress autoscroll without restarting. */
export function applySpeedMultiplierToScrollState(scrollState, speedMultiplier, currentY) {
  if (!scrollState) return { atBottom: true, applied: false };
  const nextMultiplier = clampSpeedMultiplier(speedMultiplier);
  const previousMultiplier = clampSpeedMultiplier(scrollState.speedMultiplier);
  if (previousMultiplier > 0 && previousMultiplier !== nextMultiplier) {
    scrollState.pixelsPerMs = (scrollState.pixelsPerMs || 0) * (nextMultiplier / previousMultiplier);
  }
  scrollState.speedMultiplier = nextMultiplier;
  const result = resyncAutoscrollToManualPosition(scrollState, currentY);
  return { atBottom: result.atBottom, applied: true };
}

export function shouldStopAutoscrollAtBottom(bottomReachedAtMs, nowMs, holdMs) {
  if (bottomReachedAtMs == null) return false;
  const hold = holdMs != null ? holdMs : LYRICS_AUTOSCROLL_BOTTOM_HOLD_MS;
  return nowMs - bottomReachedAtMs >= hold;
}

export function computeScrollProgress(timestamp, scrollState) {
  const elapsed = timestamp - scrollState.startTime;
  if (scrollState.totalMs <= 0) return 1;
  return Math.min(1, Math.max(0, elapsed / scrollState.totalMs));
}

export function interpolateScrollY(scrollState, progress) {
  const t = Math.min(1, Math.max(0, progress));
  return scrollState.startY + ((scrollState.endY - scrollState.startY) * t);
}

export function computePixelsPerSecond(distancePx, durationSec, speedMultiplier) {
  const distance = parseFloat(distancePx) || 0;
  const duration = parseFloat(durationSec) || 0;
  const multiplier = parseFloat(speedMultiplier) || 1;
  if (distance <= 0 || duration <= 0 || multiplier <= 0) return 0;
  return distance / (duration / multiplier);
}

export function clampSpeedMultiplier(multiplier) {
  const value = parseFloat(multiplier) || 1;
  return Math.max(
    LYRICS_AUTOSCROLL_MIN_MULTIPLIER,
    Math.min(LYRICS_AUTOSCROLL_MAX_MULTIPLIER, value)
  );
}

export function stepSpeedMultiplier(multiplier, direction) {
  const current = clampSpeedMultiplier(multiplier);
  if (direction > 0) {
    return clampSpeedMultiplier(current * LYRICS_AUTOSCROLL_SPEED_STEP);
  }
  return clampSpeedMultiplier(current / LYRICS_AUTOSCROLL_SPEED_STEP);
}

export function formatScrollDurationLabel(durationSec, speedMultiplier) {
  const duration = parseFloat(durationSec) || LYRICS_AUTOSCROLL_DEFAULT_DURATION_SEC;
  const multiplier = clampSpeedMultiplier(speedMultiplier);
  const effective = Math.max(1, Math.round(duration / multiplier));
  const minutes = Math.floor(effective / 60);
  const seconds = effective % 60;
  return minutes + ':' + String(seconds).padStart(2, '0');
}

export function formatSpeedPercent(speedMultiplier) {
  return Math.round(clampSpeedMultiplier(speedMultiplier) * 100) + '%';
}

export function getTuneLyricsScrollSpeed(tune) {
  if (!tune || tune.lyricsScrollSpeed === undefined || tune.lyricsScrollSpeed === null || tune.lyricsScrollSpeed === '') {
    return 1;
  }
  return clampSpeedMultiplier(tune.lyricsScrollSpeed);
}
