import {
  getLyricsScrollContext,
  getActiveLyricsAutoscrollSession,
  isScrollableContainer,
  findAutoscrollContentRoot,
  findScrollableContainer,
} from './lyricsAutoscrollUtils';

function getTuneListScrollRoot() {
  const el = document.querySelector('.tune-list-scroll-root');
  if (el) {
    return { element: el, mode: 'element' };
  }
  return null;
}

function isWindowScrollable() {
  return document.documentElement.scrollHeight > window.innerHeight + 1;
}

function getViewportStepPx(stepFraction) {
  const fraction = stepFraction > 0 ? stepFraction : 1;
  const viewport = typeof window !== 'undefined' ? window.innerHeight : 0;
  return Math.max(120, Math.round(viewport * fraction));
}

function getViewportChromeTop() {
  const header = document.querySelector('.App-header');
  if (header) {
    return header.getBoundingClientRect().bottom;
  }
  return 0;
}

function getViewportChromeBottom() {
  const transport = document.querySelector('.now-playing-transport-bar, .now-playing-host');
  if (transport) {
    const rect = transport.getBoundingClientRect();
    if (rect.height > 0 && rect.top < window.innerHeight) {
      return window.innerHeight - rect.top;
    }
  }
  return 0;
}

function findBestScrollableIn(rootEl) {
  if (!rootEl) return null;
  let best = null;
  let bestVisible = 0;
  const nodes = rootEl.querySelectorAll('*');
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (!isScrollableContainer(el)) continue;
    const visible = el.clientHeight;
    if (visible > bestVisible) {
      bestVisible = visible;
      best = el;
    }
  }
  if (best) return best;
  if (isScrollableContainer(rootEl)) return rootEl;
  const contentRoot = findAutoscrollContentRoot(rootEl);
  if (contentRoot) return findScrollableContainer(contentRoot);
  return null;
}

export function getPerformanceScrollRoot(musicSingleSelector) {
  const selector = musicSingleSelector || '.music-single';
  const musicSingleEl = document.querySelector(selector);
  if (!musicSingleEl) {
    const tuneListRoot = getTuneListScrollRoot();
    if (tuneListRoot) return tuneListRoot;
    return { element: null, mode: 'window' };
  }

  const context = getLyricsScrollContext(musicSingleEl);
  if (context.scrollContainer) {
    return { element: context.scrollContainer, mode: 'element' };
  }

  const innerScroll = findBestScrollableIn(musicSingleEl);
  if (innerScroll) {
    return { element: innerScroll, mode: 'element' };
  }

  const gigLyricsCol = musicSingleEl.querySelector('.gig-mode-lyrics-col');
  if (gigLyricsCol && isScrollableContainer(gigLyricsCol)) {
    return { element: gigLyricsCol, mode: 'element' };
  }

  return { element: null, mode: 'window' };
}

function collectPedalScrollTargets(musicSingleSelector) {
  const selector = musicSingleSelector || '.music-single';
  const musicSingleEl = document.querySelector(selector);
  const listEl = document.querySelector('.tune-list-scroll-root');
  const targets = [];
  const seen = new Set();

  function addTarget(rootInfo) {
    if (!rootInfo) return;
    const key = rootInfo.mode === 'window' ? 'window' : rootInfo.element;
    if (!key || seen.has(key)) return;
    seen.add(key);
    targets.push(rootInfo);
  }

  if (!musicSingleEl) {
    if (listEl) addTarget({ element: listEl, mode: 'element' });
    else if (isWindowScrollable()) addTarget({ element: null, mode: 'window' });
    return targets;
  }

  if (isWindowScrollable()) {
    addTarget({ element: null, mode: 'window' });
  }

  const primary = getPerformanceScrollRoot(selector);
  if (primary.mode === 'element' && primary.element) {
    addTarget(primary);
  } else if (!isWindowScrollable()) {
    addTarget(primary);
  }

  return targets;
}

function applyScrollDelta(rootInfo, delta) {
  if (!rootInfo) return false;
  const before = scrollTopValue(rootInfo);
  if (rootInfo.mode === 'window') {
    const el = document.scrollingElement || document.documentElement;
    if (el) {
      el.scrollTop = before + delta;
    } else {
      window.scrollBy({ top: delta, behavior: 'auto' });
    }
  } else if (rootInfo.element) {
    const el = rootInfo.element;
    el.scrollTop = el.scrollTop + delta;
  }
  const after = scrollTopValue(rootInfo);
  return delta > 0 ? after > before + 1 : after < before - 1;
}

function getContentMeasureElement(musicSingleSelector) {
  const selector = musicSingleSelector || '.music-single';
  const musicSingleEl = document.querySelector(selector);
  if (!musicSingleEl) return null;
  return findAutoscrollContentRoot(musicSingleEl) || musicSingleEl;
}

function isRootScrollable(rootInfo) {
  if (!rootInfo) return false;
  return scrollHeightValue(rootInfo) > clientHeightValue(rootInfo) + 1;
}

function isTuneContentFullyVisible(musicSingleSelector, thresholdPx) {
  const selector = musicSingleSelector || '.music-single';
  const musicSingleEl = document.querySelector(selector);
  if (!musicSingleEl) return false;
  const rect = musicSingleEl.getBoundingClientRect();
  const threshold = thresholdPx != null ? thresholdPx : 24;
  const visibleTop = getViewportChromeTop();
  const visibleBottom = window.innerHeight - getViewportChromeBottom();
  return rect.top >= visibleTop - threshold && rect.bottom <= visibleBottom + threshold;
}

export function isPerformanceContentAtBottom(musicSingleSelector, rootInfo, thresholdPx) {
  const threshold = thresholdPx != null ? thresholdPx : 24;

  if (isTuneContentFullyVisible(musicSingleSelector, threshold)) {
    return true;
  }

  if (rootInfo && rootInfo.mode === 'element') {
    if (!isRootScrollable(rootInfo)) {
      return false;
    }
    return isAtScrollBottom(rootInfo, threshold);
  }

  const measureEl = getContentMeasureElement(musicSingleSelector);
  if (measureEl) {
    const rect = measureEl.getBoundingClientRect();
    const visibleBottom = window.innerHeight - getViewportChromeBottom();
    if (rect.bottom <= visibleBottom + threshold) {
      return true;
    }
  }

  if (!isRootScrollable(rootInfo)) {
    return false;
  }
  return isAtScrollBottom(rootInfo, threshold);
}

export function isPerformanceContentAtTop(musicSingleSelector, rootInfo, thresholdPx) {
  const threshold = thresholdPx != null ? thresholdPx : 24;

  if (isTuneContentFullyVisible(musicSingleSelector, threshold)) {
    return true;
  }

  if (rootInfo && rootInfo.mode === 'element') {
    if (!isRootScrollable(rootInfo)) {
      return false;
    }
    return isAtScrollTop(rootInfo, threshold);
  }

  const measureEl = getContentMeasureElement(musicSingleSelector);
  if (measureEl && isAtScrollTop(rootInfo, threshold)) {
    const rect = measureEl.getBoundingClientRect();
    const visibleTop = getViewportChromeTop();
    if (rect.top >= visibleTop - threshold) {
      return true;
    }
  }

  if (!isRootScrollable(rootInfo)) {
    return false;
  }
  return isAtScrollTop(rootInfo, threshold);
}

function scrollTopValue(rootInfo) {
  if (!rootInfo) return 0;
  if (rootInfo.mode === 'window') return window.scrollY || document.documentElement.scrollTop || 0;
  return rootInfo.element ? rootInfo.element.scrollTop : 0;
}

function scrollHeightValue(rootInfo) {
  if (!rootInfo) return 0;
  if (rootInfo.mode === 'window') {
    return Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
  }
  return rootInfo.element ? rootInfo.element.scrollHeight : 0;
}

function clientHeightValue(rootInfo) {
  if (!rootInfo) return 0;
  if (rootInfo.mode === 'window') return window.innerHeight;
  return rootInfo.element ? rootInfo.element.clientHeight : 0;
}

export function isAtScrollTop(rootInfo, thresholdPx) {
  const threshold = thresholdPx != null ? thresholdPx : 8;
  return scrollTopValue(rootInfo) <= threshold;
}

export function isAtScrollBottom(rootInfo, thresholdPx) {
  const threshold = thresholdPx != null ? thresholdPx : 8;
  const top = scrollTopValue(rootInfo);
  const height = scrollHeightValue(rootInfo);
  const client = clientHeightValue(rootInfo);
  return top + client >= height - threshold;
}

function mergeRootInfoTarget(targets, rootInfo) {
  if (!rootInfo) return;
  const key = rootInfo.mode === 'window' ? 'window' : rootInfo.element;
  if (!key) return;
  for (let i = 0; i < targets.length; i++) {
    const existing = targets[i];
    const existingKey = existing.mode === 'window' ? 'window' : existing.element;
    if (existingKey === key) return;
  }
  targets.push(rootInfo);
}

export function scrollPageStep(rootInfo, direction, stepFraction, musicSingleSelector) {
  const delta = getViewportStepPx(stepFraction) * (direction < 0 ? -1 : 1);
  const autoscrollSession = getActiveLyricsAutoscrollSession();
  if (autoscrollSession && typeof autoscrollSession.nudgeByPixels === 'function') {
    const before = scrollTopValue(rootInfo);
    autoscrollSession.nudgeByPixels(delta);
    const after = scrollTopValue(rootInfo);
    if ((direction > 0 ? after > before + 1 : after < before - 1)) {
      return true;
    }
  }

  const targets = collectPedalScrollTargets(musicSingleSelector);
  mergeRootInfoTarget(targets, rootInfo);

  if (targets.length === 0) {
    return applyScrollDelta(rootInfo, delta);
  }

  let moved = false;
  for (let i = 0; i < targets.length; i++) {
    if (applyScrollDelta(targets[i], delta)) moved = true;
  }
  return moved;
}

export function performScrollStep(rootInfo, direction, stepFraction, thresholdPx, musicSingleSelector) {
  const threshold = thresholdPx != null ? thresholdPx : 24;
  const atTop = isPerformanceContentAtTop(musicSingleSelector, rootInfo, threshold);
  const atBottom = isPerformanceContentAtBottom(musicSingleSelector, rootInfo, threshold);

  if (direction > 0 && atBottom) {
    return { moved: false, atEdge: true, edge: 'bottom' };
  }
  if (direction < 0 && atTop) {
    return { moved: false, atEdge: true, edge: 'top' };
  }

  const moved = scrollPageStep(rootInfo, direction, stepFraction, musicSingleSelector);

  if (!moved) {
    const nowAtTop = isPerformanceContentAtTop(musicSingleSelector, rootInfo, threshold);
    const nowAtBottom = isPerformanceContentAtBottom(musicSingleSelector, rootInfo, threshold);
    if (direction > 0 && nowAtBottom) {
      return { moved: false, atEdge: true, edge: 'bottom' };
    }
    if (direction < 0 && nowAtTop) {
      return { moved: false, atEdge: true, edge: 'top' };
    }
    return { moved: false, atEdge: false, edge: null };
  }
  return { moved: true, atEdge: false, edge: null };
}

export function scrollToTop(rootInfo) {
  if (rootInfo && rootInfo.mode === 'window') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  if (rootInfo && rootInfo.element) {
    rootInfo.element.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
