/** Build remote-output queue payloads from nowPlayingQueue (Cast 2b / Snapcast S3). */

export function buildRemoteOutputQueue(mediaController, nowPlayingQueue, tunes) {
  if (!nowPlayingQueue || !Array.isArray(nowPlayingQueue.items) || nowPlayingQueue.items.length === 0) {
    return [];
  }
  if (!mediaController || !mediaController.getSrc || !mediaController.getSrcType) return [];
  const tuneMap = tunes || {};
  return nowPlayingQueue.items.map(function(entry) {
    const tuneId = entry.tuneId || entry.id;
    const tune = tuneMap[tuneId] || entry.tune || null;
    if (!tune) return null;
    const linkIndex = entry.mediaLinkNumber != null ? entry.mediaLinkNumber : 0;
    const src = mediaController.getSrc(tune, linkIndex);
    const activeLink = tune.links && tune.links[linkIndex] ? tune.links[linkIndex] : null;
    return {
      source: src,
      sourceType: mediaController.getSrcType(src, activeLink),
      title: tune.name || '',
      artist: tune.composer || '',
      duration: entry.duration || 0,
      tuneId: tuneId,
    };
  }).filter(Boolean);
}
