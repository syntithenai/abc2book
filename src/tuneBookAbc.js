import { renderDeletedTunesToAbc } from './tuneBookSync';
import {
  renderPerformanceSetsToAbc,
  stripPerformanceSetLines,
} from './performanceSetSync';
import {
  renderPlaylistsToAbc,
  stripPlaylistLines,
} from './playlistSync';
import {
  renderPracticeListsToAbc,
  stripPracticeListLines,
} from './practiceListSync';

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

export function appendPracticeListsToTuneBookAbc(tuneBookAbc, practiceListsMap, deletedPracticeListsMap) {
  const practiceListSection = renderPracticeListsToAbc(practiceListsMap, deletedPracticeListsMap);
  if (!practiceListSection) return tuneBookAbc || '';
  if (!tuneBookAbc) return practiceListSection;
  return tuneBookAbc + '\n' + practiceListSection;
}

export function appendTuneBookSyncSectionsToAbc(
  tuneBookAbc,
  setsMap,
  deletedSetsMap,
  playlistsMap,
  deletedPlaylistsMap,
  practiceListsMap,
  deletedPracticeListsMap
) {
  let abc = tuneBookAbc || '';
  abc = appendPerformanceSetsToTuneBookAbc(abc, setsMap, deletedSetsMap);
  abc = appendPlaylistsToTuneBookAbc(abc, playlistsMap, deletedPlaylistsMap);
  abc = appendPracticeListsToTuneBookAbc(abc, practiceListsMap, deletedPracticeListsMap);
  return abc;
}

export function stripTuneBookAbcForTunes(abcText) {
  return stripPracticeListLines(stripPlaylistLines(stripPerformanceSetLines(abcText || '')));
}

export {
  renderPerformanceSetsToAbc,
  stripPerformanceSetLines,
  renderPlaylistsToAbc,
  stripPlaylistLines,
  renderPracticeListsToAbc,
  stripPracticeListLines,
};
