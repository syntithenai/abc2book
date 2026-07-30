import {
  getPerformanceBindings,
  matchPerformanceAction,
} from './performanceKeyBindings';
import {
  getPerformanceScrollRoot,
  performScrollStep,
} from './performanceScrollUtils';
import {
  getAppPathname,
  getSkipNavigationTuneId,
  getViewedTuneIdFromPath,
  isFootPedalEnabledPath,
  shouldPreferQueueNavigation,
} from './playbackNavigationUtils';

const STANDARD_SCROLL_DOWN = ['PageDown', 'ArrowDown'];
const STANDARD_SCROLL_UP = ['PageUp', 'ArrowUp'];

let controllerState = {
  tunebook: null,
  navigate: null,
  mediaController: null,
  nowPlayingQueue: null,
  getPathname: getAppPathname,
};

let listenerAttached = false;

function shouldIgnorePedalTarget(target) {
  if (!target) return false;
  const tagName = target.tagName;
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

function resolvePedalAction(event) {
  const bindings = getPerformanceBindings();
  const action = matchPerformanceAction(event, bindings);
  if (action) return action;

  const labels = [];
  if (event.key) labels.push(event.key);
  if (event.code) labels.push(event.code);
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    if (STANDARD_SCROLL_DOWN.indexOf(label) !== -1) return 'scrollDown';
    if (STANDARD_SCROLL_UP.indexOf(label) !== -1) return 'scrollUp';
  }
  return null;
}

function buildNavOpts() {
  const preferQueueNav = shouldPreferQueueNavigation(
    controllerState.mediaController,
    controllerState.nowPlayingQueue
  );
  const opts = { mediaController: controllerState.mediaController };
  if (!preferQueueNav) {
    opts.forceSearchList = true;
  } else {
    opts.useQueueNavigation = true;
    opts.startPlayback = true;
  }
  return opts;
}

function navigateToNextTune() {
  const tunebook = controllerState.tunebook;
  const navigate = controllerState.navigate;
  if (!tunebook || !navigate) return;
  const pathname = controllerState.getPathname();
  const viewedTuneId = getViewedTuneIdFromPath(pathname);
  const navTuneId = viewedTuneId || getSkipNavigationTuneId(pathname, controllerState.nowPlayingQueue);
  tunebook.navigateToNextSong(
    navTuneId || null,
    null,
    navigate,
    pathname,
    buildNavOpts()
  );
}

function navigateToPreviousTune() {
  const tunebook = controllerState.tunebook;
  const navigate = controllerState.navigate;
  if (!tunebook || !navigate) return;
  const pathname = controllerState.getPathname();
  const viewedTuneId = getViewedTuneIdFromPath(pathname);
  const navTuneId = viewedTuneId || getSkipNavigationTuneId(pathname, controllerState.nowPlayingQueue);
  tunebook.navigateToPreviousSong(
    navTuneId || null,
    navigate,
    pathname,
    buildNavOpts()
  );
}

function handleFootPedalKeyDown(event) {
  const pathname = controllerState.getPathname();
  if (!isFootPedalEnabledPath(pathname)) return;
  if (shouldIgnorePedalTarget(event.target)) return;

  const action = resolvePedalAction(event);
  if (!action) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  if (action === 'nextTune') {
    navigateToNextTune();
    return;
  }
  if (action === 'previousTune') {
    navigateToPreviousTune();
    return;
  }

  const bindings = getPerformanceBindings();
  const rootInfo = getPerformanceScrollRoot('.music-single');
  const threshold = bindings.scrollEdgeThresholdPx;
  const stepFraction = bindings.scrollStepFraction;
  const direction = action === 'scrollDown' ? 1 : -1;

  const result = performScrollStep(rootInfo, direction, stepFraction, threshold, '.music-single');
  if (result.atEdge) {
    if (result.edge === 'bottom') navigateToNextTune();
    else if (result.edge === 'top') navigateToPreviousTune();
  }
}

function ensureFootPedalListener() {
  if (listenerAttached || typeof window === 'undefined') return;
  listenerAttached = true;
  window.addEventListener('keydown', handleFootPedalKeyDown, true);
}

export function updateFootPedalController(next) {
  controllerState = Object.assign({}, controllerState, next || {});
  ensureFootPedalListener();
}

export function initFootPedalController(next) {
  updateFootPedalController(next);
}

ensureFootPedalListener();
