import { getLinkRegionStart, getLinkRegionEnd } from './mediaPlaybackUtils';
import { getLyricLinesForDisplay } from './wLinesUtils';

export const LYRICS_AUTOSCROLL_DEFAULT_DURATION_SEC = 240;
export const LYRICS_SECONDS_PER_LINE = 6;
export const LYRICS_AUTOSCROLL_SPEED_STEP = 1.2;
export const LYRICS_AUTOSCROLL_MIN_MULTIPLIER = 0.1;
export const LYRICS_AUTOSCROLL_MAX_MULTIPLIER = 3;

const LYRICS_SCROLL_ROOT_SELECTORS = [
  '.full-lyrics-panel',
  '.timed-lyrics-chords-view',
  '.lyrics',
].join(', ');

const LYRICS_LINE_SELECTORS = [
  '.lyrics-line',
  '.chordpro-line',
  '.lyrics-block',
  '.chord-line',
].join(', ');

export function getTuneLink(tune, linkIndex) {
  if (!tune || !Array.isArray(tune.links) || tune.links.length === 0) return null;
  const index = linkIndex != null && tune.links[linkIndex] ? linkIndex : 0;
  return tune.links[index] || null;
}

export function countLyricLinesForScroll(tune) {
  const lines = getLyricLinesForDisplay(tune);
  return lines.filter(function(line) {
    return line && String(line).trim().length > 0;
  }).length;
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

function measureLyricsContentBottom(scrollRootEl, startY) {
  let contentBottom = startY + Math.max(scrollRootEl.offsetHeight, scrollRootEl.scrollHeight);
  const lineEls = scrollRootEl.querySelectorAll(LYRICS_LINE_SELECTORS);
  if (lineEls.length > 0) {
    const lastLine = lineEls[lineEls.length - 1];
    const lastRect = lastLine.getBoundingClientRect();
    contentBottom = Math.max(contentBottom, window.scrollY + lastRect.bottom);
  }
  return contentBottom;
}

export function getLyricsScrollMetrics(scrollRootEl) {
  if (!scrollRootEl || typeof scrollRootEl.getBoundingClientRect !== 'function') {
    return { startY: 0, distance: 0 };
  }
  const rect = scrollRootEl.getBoundingClientRect();
  const startY = Math.max(0, window.scrollY + rect.top);
  const contentBottom = measureLyricsContentBottom(scrollRootEl, startY);
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const endY = Math.min(contentBottom, maxScroll);
  return {
    startY: startY,
    distance: Math.max(0, endY - startY),
  };
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
