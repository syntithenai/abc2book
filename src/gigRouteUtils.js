export function buildGigRoute(setId, tuneId) {
  if (!setId) return '/gig';
  const setPart = encodeURIComponent(setId);
  if (!tuneId) return '/gig/' + setPart;
  return '/gig/' + setPart + '/' + encodeURIComponent(tuneId);
}

export function findPlaylistIndexByTuneId(playlist, tuneId) {
  if (!playlist || !Array.isArray(playlist.tunes) || !tuneId) return 0;
  const idx = playlist.tunes.findIndex(function(tune) {
    return tune && tune.id === tuneId;
  });
  return idx >= 0 ? idx : 0;
}

export function getPlaylistTuneIdAtIndex(playlist, index) {
  if (!playlist || !Array.isArray(playlist.tunes)) return null;
  const safeIndex = typeof index === 'number' ? index : 0;
  const tune = playlist.tunes[safeIndex];
  return tune && tune.id ? tune.id : null;
}

export function applyPlaylistTuneIndex(playlist, index) {
  if (!playlist) return null;
  const tunes = Array.isArray(playlist.tunes) ? playlist.tunes : [];
  const maxIndex = Math.max(0, tunes.length - 1);
  const nextIndex = Math.max(0, Math.min(index, maxIndex));
  return Object.assign({}, playlist, { currentIndex: nextIndex });
}

export function applyPlaylistTuneId(playlist, tuneId) {
  return applyPlaylistTuneIndex(playlist, findPlaylistIndexByTuneId(playlist, tuneId));
}

export function isGigPlaylistActive(playlist) {
  return !!(playlist && Array.isArray(playlist.tunes) && playlist.tunes.length > 0);
}
