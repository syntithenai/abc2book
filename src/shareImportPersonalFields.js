import { DEFAULT_AUDIO_FILTERS } from './pitchTempoUtils';

export const PERSONAL_TUNE_FIELD_KEYS = [
  'boost',
  'starred',
  'viewMode',
  'notationFit',
  'zoom',
  'activeVoices',
  'lyricsScrollSpeed',
  'lyricsScrollDurationSec',
  'playbackTempo',
  'playbackPitch',
  'playbackFineTune',
  'playbackAudioFilters',
  'playbackMetronomeCountIn',
  'playbackMetronomeCountInBars',
  'playbackMetronomeDuringPlayback',
  'playbackMetronomeClickRhythm',
  'playbackMetronomeDrumRhythm',
  'playbackMetronomeRhythm',
  'playbackMetronomeEngine',
  'playbackMetronomePresetId',
  'playbackFillStyle',
  'playbackFillLevel',
  'playbackFillFollowDrumGroove',
  'repeats',
  'soundFonts',
  'activeFile',
  'capo',
  'tablature',
  'tabDisplay',
  'tablatureEnabled',
  'tablatureVoices',
];

export const PERSONAL_PLAYLIST_FIELD_KEYS = [
  'followTune',
  'loop',
  'shuffle',
  'autoAdvance',
];

function clonePersonalFieldValue(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice();
  if (typeof value === 'object') return JSON.parse(JSON.stringify(value));
  return value;
}

export function resolvePersonalFieldPolicy(options) {
  const opts = options && typeof options === 'object' ? options : {};
  return opts.personalFieldPolicy === 'full' ? 'full' : 'preserveLocal';
}

export function defaultPersonalTuneFieldValues() {
  return {
    boost: 0,
    starred: false,
    viewMode: undefined,
    notationFit: undefined,
    zoom: undefined,
    activeVoices: undefined,
    lyricsScrollSpeed: 1,
    lyricsScrollDurationSec: undefined,
    playbackTempo: 1,
    playbackPitch: 0,
    playbackFineTune: 0,
    playbackAudioFilters: clonePersonalFieldValue(DEFAULT_AUDIO_FILTERS),
    playbackMetronomeCountIn: undefined,
    playbackMetronomeCountInBars: undefined,
    playbackMetronomeDuringPlayback: undefined,
    playbackMetronomeClickRhythm: undefined,
    playbackMetronomeDrumRhythm: undefined,
    playbackMetronomeRhythm: undefined,
    playbackMetronomeEngine: undefined,
    playbackMetronomePresetId: undefined,
    playbackFillStyle: undefined,
    playbackFillLevel: undefined,
    playbackFillFollowDrumGroove: undefined,
    repeats: 1,
    soundFonts: undefined,
    activeFile: '',
    capo: 0,
    tablature: undefined,
    tabDisplay: undefined,
    tablatureEnabled: undefined,
    tablatureVoices: undefined,
  };
}

export function defaultPlaylistPersonalFieldValues() {
  return {
    followTune: false,
    loop: false,
    shuffle: false,
    autoAdvance: true,
  };
}

function applyPersonalFieldValue(tune, key, value) {
  if (!tune) return tune;
  if (value === undefined) {
    delete tune[key];
    return tune;
  }
  tune[key] = clonePersonalFieldValue(value);
  return tune;
}

export function stripIncomingPersonalFields(tune) {
  if (!tune) return tune;
  const defaults = defaultPersonalTuneFieldValues();
  PERSONAL_TUNE_FIELD_KEYS.forEach(function(key) {
    applyPersonalFieldValue(tune, key, defaults[key]);
  });
  return tune;
}

export function preserveLocalPersonalFields(tune, localTune) {
  if (!tune) return tune;
  if (!localTune) return stripIncomingPersonalFields(tune);
  const defaults = defaultPersonalTuneFieldValues();
  PERSONAL_TUNE_FIELD_KEYS.forEach(function(key) {
    if (localTune.hasOwnProperty(key) && localTune[key] !== undefined) {
      applyPersonalFieldValue(tune, key, localTune[key]);
    } else {
      applyPersonalFieldValue(tune, key, defaults[key]);
    }
  });
  return tune;
}

export function applyPersonalFieldPolicy(incomingTune, localTune, policy) {
  if (!incomingTune || policy === 'full') return incomingTune;
  if (localTune) return preserveLocalPersonalFields(incomingTune, localTune);
  return stripIncomingPersonalFields(incomingTune);
}

export function stripIncomingPlaylistPersonalFields(playlist) {
  if (!playlist) return playlist;
  const defaults = defaultPlaylistPersonalFieldValues();
  PERSONAL_PLAYLIST_FIELD_KEYS.forEach(function(key) {
    applyPersonalFieldValue(playlist, key, defaults[key]);
  });
  return playlist;
}

export function preserveLocalPlaylistPersonalFields(playlist, localPlaylist) {
  if (!playlist) return playlist;
  if (!localPlaylist) return stripIncomingPlaylistPersonalFields(playlist);
  const defaults = defaultPlaylistPersonalFieldValues();
  PERSONAL_PLAYLIST_FIELD_KEYS.forEach(function(key) {
    if (localPlaylist.hasOwnProperty(key) && localPlaylist[key] !== undefined) {
      applyPersonalFieldValue(playlist, key, localPlaylist[key]);
    } else {
      applyPersonalFieldValue(playlist, key, defaults[key]);
    }
  });
  return playlist;
}

export function applyPlaylistPersonalFieldPolicy(incomingPlaylist, localPlaylist, policy) {
  if (!incomingPlaylist || policy === 'full') return incomingPlaylist;
  if (localPlaylist) return preserveLocalPlaylistPersonalFields(incomingPlaylist, localPlaylist);
  return stripIncomingPlaylistPersonalFields(incomingPlaylist);
}

function setItemKey(item) {
  if (!item || !item.tuneId) return '';
  return String(item.tuneId);
}

export function stripIncomingSetItemPersonalFields(item) {
  if (!item || typeof item !== 'object') return item;
  const next = Object.assign({}, item);
  delete next.viewMode;
  return next;
}

export function preserveLocalSetItemsPersonalFields(mergedItems, localItems) {
  const localByTuneId = {};
  (Array.isArray(localItems) ? localItems : []).forEach(function(item) {
    const key = setItemKey(item);
    if (key) localByTuneId[key] = item;
  });
  return (Array.isArray(mergedItems) ? mergedItems : []).map(function(item) {
    if (!item || item.type !== 'tune') return item;
    const localItem = localByTuneId[setItemKey(item)];
    if (!localItem || !localItem.viewMode) return stripIncomingSetItemPersonalFields(item);
    return Object.assign({}, stripIncomingSetItemPersonalFields(item), {
      viewMode: localItem.viewMode,
    });
  });
}

export function applyPerformanceSetPersonalFieldPolicy(incomingSet, localSet, policy) {
  if (!incomingSet || policy === 'full') return incomingSet;
  const next = Object.assign({}, incomingSet);
  if (!Array.isArray(next.items)) return next;
  if (localSet && Array.isArray(localSet.items)) {
    next.items = preserveLocalSetItemsPersonalFields(next.items, localSet.items);
  } else {
    next.items = next.items.map(stripIncomingSetItemPersonalFields);
  }
  return next;
}

export function applyExternalSharePersonalFieldsToPlaylistStorage(storagePlaylists, playlistId, localStoragePlaylists) {
  if (!storagePlaylists || !playlistId || !storagePlaylists[playlistId]) return storagePlaylists;
  const localPlaylist = localStoragePlaylists && localStoragePlaylists[playlistId]
    ? localStoragePlaylists[playlistId]
    : null;
  storagePlaylists[playlistId] = applyPlaylistPersonalFieldPolicy(
    Object.assign({}, storagePlaylists[playlistId]),
    localPlaylist,
    'preserveLocal'
  );
  return storagePlaylists;
}

export function applyExternalSharePersonalFieldsToSetStorage(storageSets, setId, localStorageSets) {
  if (!storageSets || !setId || !storageSets[setId]) return storageSets;
  const localSet = localStorageSets && localStorageSets[setId]
    ? localStorageSets[setId]
    : null;
  storageSets[setId] = applyPerformanceSetPersonalFieldPolicy(
    Object.assign({}, storageSets[setId]),
    localSet,
    'preserveLocal'
  );
  return storageSets;
}
