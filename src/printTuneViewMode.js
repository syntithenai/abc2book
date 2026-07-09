import { normalizeViewMode, resolveViewModeForTune, defaultViewModeForTune } from './viewModeUtils';
import { tuneHasExplicitChords } from './timedLyricsChordsDisplay';

/**
 * Resolve the view mode used when printing a tune.
 * Prefer saved tune.viewMode; otherwise content heuristics (matching single-view defaults).
 */
export function resolvePrintViewMode(tune, globalViewMode, tunebook, abcjsParser) {
  if (!tune) return 'music';
  const hasChords = tuneHasExplicitChords(tune, tunebook, abcjsParser);
  let nextViewMode = globalViewMode || 'music';
  if (tune.viewMode) {
    nextViewMode = normalizeViewMode(tune.viewMode);
  } else {
    nextViewMode = defaultViewModeForTune(tune, tunebook, { hasChords: hasChords });
  }
  const resolved = resolveViewModeForTune(nextViewMode, tune, tunebook, { hasChords: hasChords });
  if (!resolved || resolved === 'off') {
    return defaultViewModeForTune(tune, tunebook, { hasChords: hasChords });
  }
  return resolved;
}
