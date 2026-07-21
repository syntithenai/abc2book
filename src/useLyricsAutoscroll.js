import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyLyricsScrollPosition,
  applySpeedMultiplierToScrollState,
  clampSpeedMultiplier,
  computeScrollProgress,
  getLyricsAutoscrollDurationSeconds,
  getLyricsScrollContext,
  getLyricsScrollMetrics,
  getTuneLyricsScrollSpeed,
  interpolateScrollY,
  isAtLyricsScrollBottom,
  LYRICS_AUTOSCROLL_BOTTOM_HOLD_MS,
  LYRICS_AUTOSCROLL_BOTTOM_THRESHOLD_PX,
  readLyricsScrollPosition,
  resyncAutoscrollToManualPosition,
  setActiveLyricsAutoscrollSession,
  shouldStopAutoscrollAtBottom,
  stepSpeedMultiplier,
} from './lyricsAutoscrollUtils';

const MANUAL_SCROLL_THRESHOLD_PX = 3;

export default function useLyricsAutoscroll(options) {
  const tune = options.tune;
  const mediaController = options.mediaController;
  const mediaLinkNumber = options.mediaLinkNumber;
  const onSpeedChange = options.onSpeedChange;
  const musicSingleSelector = options.musicSingleSelector || '.music-single';

  const [isScrolling, setIsScrolling] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(function() {
    return getTuneLyricsScrollSpeed(options.tune);
  });
  const [nothingToScroll, setNothingToScroll] = useState(false);

  const rafRef = useRef(null);
  const scrollStateRef = useRef({
    startTime: 0,
    startY: 0,
    endY: 0,
    totalMs: 0,
    pixelsPerMs: 0,
    speedMultiplier: 1,
  });
  const speedMultiplierRef = useRef(getTuneLyricsScrollSpeed(options.tune));
  const isScrollingRef = useRef(false);
  const lastAppliedYRef = useRef(null);
  const bottomReachedAtRef = useRef(null);
  const onSpeedChangeRef = useRef(onSpeedChange);

  useEffect(function() {
    onSpeedChangeRef.current = onSpeedChange;
  }, [onSpeedChange]);

  useEffect(function() {
    speedMultiplierRef.current = speedMultiplier;
  }, [speedMultiplier]);

  useEffect(function() {
    isScrollingRef.current = isScrolling;
  }, [isScrolling]);

  const cancelAnimation = useCallback(function() {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const stop = useCallback(function() {
    cancelAnimation();
    setActiveLyricsAutoscrollSession(null);
    lastAppliedYRef.current = null;
    bottomReachedAtRef.current = null;
    isScrollingRef.current = false;
    setIsScrolling(false);
    setNothingToScroll(false);
  }, [cancelAnimation]);

  const resolveMetrics = useCallback(function() {
    const musicSingleEl = document.querySelector(musicSingleSelector);
    const scrollContext = getLyricsScrollContext(musicSingleEl);
    const metrics = getLyricsScrollMetrics(scrollContext.lyricsRoot, scrollContext, musicSingleEl);
    return metrics;
  }, [musicSingleSelector]);

  const scrollToLyricsTop = useCallback(function() {
    const metrics = resolveMetrics();
    applyLyricsScrollPosition(metrics, metrics.startY);
    return metrics;
  }, [resolveMetrics]);

  const rewind = useCallback(function() {
    stop();
    scrollToLyricsTop();
  }, [stop, scrollToLyricsTop]);

  const holdAtBottomIfNeeded = useCallback(function(state, currentY) {
    if (!isAtLyricsScrollBottom(state, currentY, LYRICS_AUTOSCROLL_BOTTOM_THRESHOLD_PX)) {
      bottomReachedAtRef.current = null;
      return false;
    }

    applyLyricsScrollPosition(state, state.endY);
    lastAppliedYRef.current = state.endY;

    const now = performance.now();
    if (bottomReachedAtRef.current == null) {
      bottomReachedAtRef.current = now;
    }
    if (shouldStopAutoscrollAtBottom(bottomReachedAtRef.current, now, LYRICS_AUTOSCROLL_BOTTOM_HOLD_MS)) {
      stop();
      return true;
    }
    return true;
  }, [stop]);

  const resyncFromCurrentPosition = useCallback(function() {
    const state = scrollStateRef.current;
    const currentY = readLyricsScrollPosition(state);
    const result = resyncAutoscrollToManualPosition(state, currentY);
    if (result.atBottom) {
      holdAtBottomIfNeeded(state, currentY);
      return;
    }
    bottomReachedAtRef.current = null;
    lastAppliedYRef.current = currentY;
  }, [holdAtBottomIfNeeded]);

  const nudgeByPixels = useCallback(function(deltaY) {
    if (!isScrollingRef.current) return;
    const state = scrollStateRef.current;
    const currentY = readLyricsScrollPosition(state);
    const nextY = Math.max(0, Math.min(state.endY, currentY + deltaY));
    applyLyricsScrollPosition(state, nextY);
    lastAppliedYRef.current = nextY;
    resyncFromCurrentPosition();
  }, [resyncFromCurrentPosition]);

  const tick = useCallback(function(timestamp) {
    const state = scrollStateRef.current;
    const currentY = readLyricsScrollPosition(state);
    if (
      lastAppliedYRef.current != null
      && Math.abs(currentY - lastAppliedYRef.current) > MANUAL_SCROLL_THRESHOLD_PX
    ) {
      resyncFromCurrentPosition();
    }

    const positionY = readLyricsScrollPosition(state);
    if (holdAtBottomIfNeeded(state, positionY)) {
      if (isScrollingRef.current) {
        rafRef.current = requestAnimationFrame(tick);
      }
      return;
    }

    const progress = computeScrollProgress(timestamp, state);
    const nextY = interpolateScrollY(state, progress);
    applyLyricsScrollPosition(state, nextY);
    lastAppliedYRef.current = nextY;

    if (progress >= 1) {
      holdAtBottomIfNeeded(state, state.endY);
    }

    if (!isScrollingRef.current) return;
    rafRef.current = requestAnimationFrame(tick);
  }, [holdAtBottomIfNeeded, resyncFromCurrentPosition]);

  const start = useCallback(function() {
    cancelAnimation();
    const metrics = scrollToLyricsTop();
    if (metrics.distance <= 0) {
      setActiveLyricsAutoscrollSession(null);
      lastAppliedYRef.current = null;
      bottomReachedAtRef.current = null;
      isScrollingRef.current = false;
      setIsScrolling(false);
      setNothingToScroll(true);
      return;
    }
    const baseDuration = getLyricsAutoscrollDurationSeconds(tune, mediaController, mediaLinkNumber);
    const activeMultiplier = speedMultiplierRef.current;
    const totalMs = Math.max(1000, (baseDuration / activeMultiplier) * 1000);
    const scrollState = {
      startTime: performance.now(),
      startY: metrics.startY,
      endY: metrics.startY + metrics.distance,
      totalMs: totalMs,
      pixelsPerMs: metrics.distance > 0 ? metrics.distance / totalMs : 0,
      speedMultiplier: activeMultiplier,
      mode: metrics.mode,
      scrollContainer: metrics.scrollContainer,
    };
    scrollStateRef.current = scrollState;
    lastAppliedYRef.current = metrics.startY;
    bottomReachedAtRef.current = null;
    setNothingToScroll(false);
    isScrollingRef.current = true;
    setIsScrolling(true);
    setActiveLyricsAutoscrollSession({ nudgeByPixels: nudgeByPixels });
    // Re-read after the start scroll settles so sticky headers / notation pin
    // do not look like a manual scroll and stop the session immediately.
    rafRef.current = requestAnimationFrame(function(timestamp) {
      if (!isScrollingRef.current) return;
      lastAppliedYRef.current = readLyricsScrollPosition(scrollStateRef.current);
      tick(timestamp);
    });
  }, [
    scrollToLyricsTop,
    cancelAnimation,
    tick,
    tune,
    mediaController,
    mediaLinkNumber,
    nudgeByPixels,
  ]);

  const setSpeedMultiplierLive = useCallback(function(nextMultiplier) {
    const next = clampSpeedMultiplier(nextMultiplier);
    const previous = speedMultiplierRef.current;
    if (previous === next) return next;

    speedMultiplierRef.current = next;
    setSpeedMultiplier(next);

    if (isScrollingRef.current) {
      const state = scrollStateRef.current;
      const currentY = readLyricsScrollPosition(state);
      const result = applySpeedMultiplierToScrollState(state, next, currentY);
      if (result.atBottom) {
        holdAtBottomIfNeeded(state, currentY);
      } else {
        bottomReachedAtRef.current = null;
        lastAppliedYRef.current = currentY;
      }
    }

    if (onSpeedChangeRef.current) onSpeedChangeRef.current(next);
    return next;
  }, [holdAtBottomIfNeeded]);

  const increaseSpeed = useCallback(function() {
    setSpeedMultiplierLive(stepSpeedMultiplier(speedMultiplierRef.current, 1));
  }, [setSpeedMultiplierLive]);

  const decreaseSpeed = useCallback(function() {
    setSpeedMultiplierLive(stepSpeedMultiplier(speedMultiplierRef.current, -1));
  }, [setSpeedMultiplierLive]);

  useEffect(function() {
    const nextSpeed = getTuneLyricsScrollSpeed(tune);
    if (speedMultiplierRef.current === nextSpeed) return;
    speedMultiplierRef.current = nextSpeed;
    setSpeedMultiplier(nextSpeed);
    if (!isScrollingRef.current) return;
    const state = scrollStateRef.current;
    const currentY = readLyricsScrollPosition(state);
    applySpeedMultiplierToScrollState(state, nextSpeed, currentY);
    lastAppliedYRef.current = currentY;
  }, [tune && tune.id, tune && tune.lyricsScrollSpeed]);

  useEffect(function() {
    return function() {
      cancelAnimation();
      setActiveLyricsAutoscrollSession(null);
    };
  }, [cancelAnimation]);

  useEffect(function() {
    stop();
  }, [tune && tune.id, stop]);

  return {
    isScrolling: isScrolling,
    speedMultiplier: speedMultiplier,
    nothingToScroll: nothingToScroll,
    start: start,
    stop: stop,
    rewind: rewind,
    increaseSpeed: increaseSpeed,
    decreaseSpeed: decreaseSpeed,
    getBaseDurationSeconds: useCallback(function() {
      return getLyricsAutoscrollDurationSeconds(tune, mediaController, mediaLinkNumber);
    }, [mediaController, mediaLinkNumber, tune]),
  };
}
