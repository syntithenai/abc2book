import { useCallback, useEffect, useRef } from 'react';
import {
  getPerformanceBindings,
  matchPerformanceAction,
} from './performanceKeyBindings';
import {
  getPerformanceScrollRoot,
  isAtScrollBottom,
  isAtScrollTop,
  scrollPageStep,
} from './performanceScrollUtils';

function shouldIgnoreTarget(target, options) {
  if (!target) return false;
  const allowButtonTargets = options && options.allowButtonTargets;
  const activeModalSelector = options && options.activeModalSelector;

  if (activeModalSelector && target.closest && !target.closest(activeModalSelector)) {
    return false;
  }

  const tagName = target.tagName;
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
    return true;
  }
  if (!allowButtonTargets && tagName === 'BUTTON') {
    return true;
  }
  if (target.isContentEditable) return true;
  return false;
}

export default function usePerformanceKeyBindings(options) {
  const enabled = options.enabled !== false;
  const blockShortcuts = options.ignoreGlobalBlock ? false : options.blockKeyboardShortcuts;
  const musicSingleSelector = options.musicSingleSelector || '.music-single';
  const bindingsOverride = options.bindings || null;
  const navigateAtScrollEdge = options.navigateAtScrollEdge !== false;
  const allowButtonTargets = options.allowButtonTargets === true;
  const useCapture = options.useCapture === true;
  const activeModalSelector = options.activeModalSelector || null;
  const onNextTune = options.onNextTune;
  const onPreviousTune = options.onPreviousTune;
  const onAtSetEnd = options.onAtSetEnd;
  const onAtSetStart = options.onAtSetStart;

  const handlersRef = useRef({
    onNextTune: onNextTune,
    onPreviousTune: onPreviousTune,
    onAtSetEnd: onAtSetEnd,
    onAtSetStart: onAtSetStart,
  });

  useEffect(function() {
    handlersRef.current = {
      onNextTune: onNextTune,
      onPreviousTune: onPreviousTune,
      onAtSetEnd: onAtSetEnd,
      onAtSetStart: onAtSetStart,
    };
  }, [onNextTune, onPreviousTune, onAtSetEnd, onAtSetStart]);

  const handleKeyDown = useCallback(function(event) {
    if (!enabled) return;
    if (blockShortcuts) return;
    if (shouldIgnoreTarget(event.target, {
      allowButtonTargets: allowButtonTargets,
      activeModalSelector: activeModalSelector,
    })) return;

    const bindings = bindingsOverride || getPerformanceBindings();
    const action = matchPerformanceAction(event, bindings);
    if (!action) return;

    if (action === 'nextTune') {
      event.preventDefault();
      if (handlersRef.current.onNextTune) handlersRef.current.onNextTune();
      return;
    }

    if (action === 'previousTune') {
      event.preventDefault();
      if (handlersRef.current.onPreviousTune) handlersRef.current.onPreviousTune();
      return;
    }

    const rootInfo = getPerformanceScrollRoot(musicSingleSelector);
    const threshold = bindings.scrollEdgeThresholdPx;
    const stepFraction = bindings.scrollStepFraction;

    if (action === 'scrollDown') {
      if (navigateAtScrollEdge && isAtScrollBottom(rootInfo, threshold)) {
        event.preventDefault();
        const handled = handlersRef.current.onAtSetEnd && handlersRef.current.onAtSetEnd();
        if (!handled && handlersRef.current.onNextTune) {
          handlersRef.current.onNextTune();
        }
      } else {
        event.preventDefault();
        scrollPageStep(rootInfo, 1, stepFraction);
      }
      return;
    }

    if (action === 'scrollUp') {
      if (navigateAtScrollEdge && isAtScrollTop(rootInfo, threshold)) {
        event.preventDefault();
        const handled = handlersRef.current.onAtSetStart && handlersRef.current.onAtSetStart();
        if (!handled && handlersRef.current.onPreviousTune) {
          handlersRef.current.onPreviousTune();
        }
      } else {
        event.preventDefault();
        scrollPageStep(rootInfo, -1, stepFraction);
      }
    }
  }, [enabled, blockShortcuts, musicSingleSelector, bindingsOverride, navigateAtScrollEdge, allowButtonTargets, activeModalSelector]);

  useEffect(function() {
    if (!enabled) return undefined;
    document.addEventListener('keydown', handleKeyDown, useCapture);
    return function() {
      document.removeEventListener('keydown', handleKeyDown, useCapture);
    };
  }, [enabled, handleKeyDown, useCapture]);
}
