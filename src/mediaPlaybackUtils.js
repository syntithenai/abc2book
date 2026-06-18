export function formatSecondsToMs(totalSeconds) {
  const seconds = Math.max(0, Math.floor(parseFloat(totalSeconds) || 0));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes + ':' + String(remainder).padStart(2, '0');
}

export function parseMsToSeconds(value) {
  if (value === undefined || value === null) return 0;
  const trimmed = String(value).trim();
  if (!trimmed) return 0;
  if (trimmed.indexOf(':') >= 0) {
    const parts = trimmed.split(':');
    const minutes = parseInt(parts[0], 10) || 0;
    const seconds = parseInt(parts[1], 10) || 0;
    return minutes * 60 + seconds;
  }
  const parsed = parseFloat(trimmed);
  return isNaN(parsed) ? 0 : parsed;
}

export function isPlaybackLoopEnabled(link) {
  if (!link) return false;
  return link.playbackLoop === true || link.playbackLoop === 1 || link.playbackLoop === '1' || link.playbackLoop === 'true';
}

export function getActiveLinkIndex(tune, mediaLinkNumber) {
  if (!tune || !Array.isArray(tune.links) || tune.links.length === 0) return null;
  if (mediaLinkNumber !== null && mediaLinkNumber !== undefined && tune.links[mediaLinkNumber]) {
    return mediaLinkNumber;
  }
  return 0;
}
