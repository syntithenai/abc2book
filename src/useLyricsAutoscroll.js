import { useCallback, useEffect, useRef, useState } from 'react';
import {
  computeScrollProgress,
  findLyricsScrollRoot,
  getEffectiveMediaDurationSeconds,
  getLyricsScrollMetrics,
  getTuneLyricsScrollSpeed,
  interpolateScrollY,
  stepSpeedMultiplier,
} from './lyricsAutoscrollUtils';

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
    speedMultiplier: 1,
  });
  const speedMultiplierRef = useRef(1);

  useEffect(function() {
    speedMultiplierRef.current = speedMultiplier;
  }, [speedMultiplier]);

  const cancelAnimation = useCallback(function() {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const stop = useCallback(function() {
    cancelAnimation();
    setIsScrolling(false);
    setNothingToScroll(false);
  }, [cancelAnimation]);

  const resolveMetrics = useCallback(function() {
    const musicSingleEl = document.querySelector(musicSingleSelector);
    const scrollRoot = findLyricsScrollRoot(musicSingleEl);
    return getLyricsScrollMetrics(scrollRoot);
  }, [musicSingleSelector]);

  const scrollToLyricsTop = useCallback(function() {
    const metrics = resolveMetrics();
    window.scrollTo(0, metrics.startY);
    return metrics;
  }, [resolveMetrics]);

  const rewind = useCallback(function() {
    stop();
    scrollToLyricsTop();
  }, [stop, scrollToLyricsTop]);

  const tick = useCallback(function(timestamp) {
    const state = scrollStateRef.current;
    const progress = computeScrollProgress(timestamp, state);
    const nextY = interpolateScrollY(state, progress);
    window.scrollTo(0, nextY);
    if (progress >= 1) {
      stop();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [stop]);

  const start = useCallback(function() {
    stop();
    const metrics = scrollToLyricsTop();
    if (metrics.distance <= 0) {
      setNothingToScroll(true);
      return;
    }
    const baseDuration = getEffectiveMediaDurationSeconds(tune, mediaController, mediaLinkNumber);
    const activeMultiplier = speedMultiplierRef.current;
    scrollStateRef.current = {
      startTime: performance.now(),
      startY: metrics.startY,
      endY: metrics.startY + metrics.distance,
      totalMs: Math.max(1000, (baseDuration / activeMultiplier) * 1000),
      speedMultiplier: activeMultiplier,
    };
    setNothingToScroll(false);
    setIsScrolling(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [scrollToLyricsTop, stop, tick, tune, mediaController, mediaLinkNumber]);

  const increaseSpeed = useCallback(function() {
    setSpeedMultiplier(function(current) {
      const next = stepSpeedMultiplier(current, 1);
      if (onSpeedChange) onSpeedChange(next);
      return next;
    });
  }, [onSpeedChange]);

  const decreaseSpeed = useCallback(function() {
    setSpeedMultiplier(function(current) {
      const next = stepSpeedMultiplier(current, -1);
      if (onSpeedChange) onSpeedChange(next);
      return next;
    });
  }, [onSpeedChange]);

  useEffect(function() {
    const nextSpeed = getTuneLyricsScrollSpeed(tune);
    setSpeedMultiplier(nextSpeed);
    speedMultiplierRef.current = nextSpeed;
  }, [tune && tune.id, tune && tune.lyricsScrollSpeed]);

  useEffect(function() {
    return function() {
      cancelAnimation();
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
      return getEffectiveMediaDurationSeconds(tune, mediaController, mediaLinkNumber);
    }, [mediaController, mediaLinkNumber, tune]),
  };
}
