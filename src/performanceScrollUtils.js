import { getLyricsScrollContext, getActiveLyricsAutoscrollSession } from './lyricsAutoscrollUtils';

export function getPerformanceScrollRoot(musicSingleSelector) {
  const selector = musicSingleSelector || '.music-single';
  const musicSingleEl = document.querySelector(selector);
  if (!musicSingleEl) {
    return { element: null, mode: 'window' };
  }

  const context = getLyricsScrollContext(musicSingleEl);
  if (context.scrollContainer) {
    return { element: context.scrollContainer, mode: 'element' };
  }

  if (context.lyricsRoot) {
    return { element: context.lyricsRoot, mode: 'element' };
  }

  const gigLyricsCol = musicSingleEl.querySelector('.gig-mode-lyrics-col');
  if (gigLyricsCol) {
    return { element: gigLyricsCol, mode: 'element' };
  }

  if (document.documentElement.scrollHeight > window.innerHeight + 1) {
    return { element: null, mode: 'window' };
  }
  return { element: musicSingleEl, mode: 'window' };
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

export function scrollPageStep(rootInfo, direction, stepFraction) {
  const fraction = stepFraction > 0 ? stepFraction : 0.8;
  const delta = clientHeightValue(rootInfo) * fraction * (direction < 0 ? -1 : 1);
  const autoscrollSession = getActiveLyricsAutoscrollSession();
  if (autoscrollSession && typeof autoscrollSession.nudgeByPixels === 'function') {
    autoscrollSession.nudgeByPixels(delta);
    return;
  }
  if (rootInfo && rootInfo.mode === 'window') {
    window.scrollBy({ top: delta, behavior: 'smooth' });
    return;
  }
  if (rootInfo && rootInfo.element) {
    rootInfo.element.scrollBy({ top: delta, behavior: 'smooth' });
  }
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
