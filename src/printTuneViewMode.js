import { normalizeViewMode, resolveViewModeForTune } from './viewModeUtils';
import { tuneHasExplicitChords } from './timedLyricsChordsDisplay';

/**
 * Resolve the view mode used when printing a tune, matching MusicSingle.setupTune.
 */
export function resolvePrintViewMode(tune, globalViewMode, tunebook, abcjsParser) {
  if (!tune) return 'music';
  const hasTimedAlignment = !!(tune.timedLyrics && tune.timedChords);
  let nextViewMode = globalViewMode || 'music';
  if (tune.viewMode) {
    nextViewMode = normalizeViewMode(tune.viewMode);
  } else if (tunebook && tunebook.hasNotesOrChords && !tunebook.hasNotesOrChords(tune)) {
    nextViewMode = hasTimedAlignment ? 'chordsInline' : 'chordsBlock';
  } else if (
    tunebook
    && tunebook.hasLyrics
    && tunebook.hasLyrics(tune)
    && tunebook.hasNotes
    && !tunebook.hasNotes(tune)
  ) {
    nextViewMode = hasTimedAlignment ? 'chordsInline' : 'chordsBlock';
  } else if (
    tunebook
    && tunebook.hasLyrics
    && !tunebook.hasLyrics(tune)
    && tunebook.hasNotes
    && tunebook.hasNotes(tune)
  ) {
    nextViewMode = 'music';
  }
  const hasChords = tuneHasExplicitChords(tune, tunebook, abcjsParser);
  return resolveViewModeForTune(nextViewMode, tune, tunebook, { hasChords: hasChords });
}
