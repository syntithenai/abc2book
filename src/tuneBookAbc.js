import { renderDeletedTunesToAbc } from './tuneBookSync';
import {
  renderPerformanceSetsToAbc,
  stripPerformanceSetLines,
} from './performanceSetSync';
import {
  renderPlaylistsToAbc,
  stripPlaylistLines,
} from './playlistSync';

export function appendPerformanceSetsToTuneBookAbc(tuneBookAbc, setsMap, deletedSetsMap) {
  const setSection = renderPerformanceSetsToAbc(setsMap, deletedSetsMap);
  if (!setSection) return tuneBookAbc || '';
  if (!tuneBookAbc) return setSection;
  return tuneBookAbc + '\n' + setSection;
}

export function appendPlaylistsToTuneBookAbc(tuneBookAbc, playlistsMap, deletedPlaylistsMap) {
  const playlistSection = renderPlaylistsToAbc(playlistsMap, deletedPlaylistsMap);
  if (!playlistSection) return tuneBookAbc || '';
  if (!tuneBookAbc) return playlistSection;
  return tuneBookAbc + '\n' + playlistSection;
}

export function appendTuneBookSyncSectionsToAbc(tuneBookAbc, setsMap, deletedSetsMap, playlistsMap, deletedPlaylistsMap) {
  let abc = tuneBookAbc || '';
  abc = appendPerformanceSetsToTuneBookAbc(abc, setsMap, deletedSetsMap);
  abc = appendPlaylistsToTuneBookAbc(abc, playlistsMap, deletedPlaylistsMap);
  return abc;
}

export function stripTuneBookAbcForTunes(abcText) {
  return stripPlaylistLines(stripPerformanceSetLines(abcText || ''));
}

export { renderPerformanceSetsToAbc, stripPerformanceSetLines, renderPlaylistsToAbc, stripPlaylistLines };
