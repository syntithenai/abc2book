import {
  buildPlaybackRouterContext,
  PLAYBACK_ROUTE_PHASE,
} from './playbackRouterContext';
import {
  branchToExpectedEngine,
  classifyPlayBranch,
  comparePlaybackRoutes,
  isBranchParityExempt,
  mapActiveEngineToRouterEngine,
  resolveRouteFromSnapshot,
} from './playbackRouterParity';
import { resolvePlaybackRoute } from './playbackRouter';
import {
  isPlaybackRouteLogEnabled,
  logPlaybackRouteDecision,
  redactPlaybackRouteLogEntry,
} from './playbackDebug';

/**
 * Record policy/outcome parity for a play() invocation. No-op unless debug enabled.
 */
export function recordPlaybackRouteParity(options) {
  if (!isPlaybackRouteLogEnabled()) return null;

  const opts = options || {};
  const snapshot = opts.snapshot;
  if (!snapshot) return null;

  const phase = opts.phase || PLAYBACK_ROUTE_PHASE.prePlay;
  const branch = opts.branch != null ? opts.branch : classifyPlayBranch(snapshot, opts.playOpts);
  const context = buildPlaybackRouterContext(snapshot);
  const expected = resolvePlaybackRoute(context);

  let actual = null;
  let comparison = { match: true, reason: '', severity: 'none' };

  if (phase === PLAYBACK_ROUTE_PHASE.prePlay) {
    const branchEngine = branchToExpectedEngine(branch);
    if (branchEngine && !isBranchParityExempt(branch)) {
      comparison = comparePlaybackRoutes(
        { engine: expected.engine },
        { engine: branchEngine },
        { severity: 'policy', allowedEngines: opts.allowedEngines }
      );
    }
  } else if (phase === PLAYBACK_ROUTE_PHASE.postDispatch && opts.activeEngine) {
    const mapped = mapActiveEngineToRouterEngine(opts.activeEngine, snapshot.routeMode);
    actual = { engine: mapped };
    comparison = comparePlaybackRoutes(
      expected,
      actual,
      { severity: 'outcome-late', allowedEngines: opts.allowedEngines }
    );
  }

  const entry = redactPlaybackRouteLogEntry({
    phase: phase,
    branch: branch,
    context: context,
    expected: expected,
    actual: actual,
    match: comparison.match,
    severity: comparison.severity,
    reason: comparison.reason,
    snapcastAttempted: !!opts.snapcastAttempted,
    timestamp: Date.now(),
  });

  logPlaybackRouteDecision(entry);

  if (!comparison.match && comparison.severity === 'policy') {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[tunebook-playback] route-mismatch', entry);
    }
  }

  return entry;
}

export function resolvePlaybackRouteForEnforce(snapshot) {
  return resolveRouteFromSnapshot(snapshot);
}

export { PLAYBACK_ROUTE_PHASE };
