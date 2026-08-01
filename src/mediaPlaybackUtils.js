import { resolveActiveLinkForTune } from './mediaLinkResolve'
import { resolveLinkPlaybackSrcType } from './mediaLinkSrcType'
import { linkUriString } from './tuneLinkUri'

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
  if (Array.isArray(link.playbackLoops) && link.playbackLoops.length > 0) {
    return link.playbackLoops.some(function(loop) { return loop && loop.active; });
  }
  return link.playbackLoop === true || link.playbackLoop === 1 || link.playbackLoop === '1' || link.playbackLoop === 'true';
}

export function createPlaybackLoop(overrides) {
  return Object.assign({
    id: 'loop_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    name: '',
    startAt: '',
    endAt: '',
    active: false,
  }, overrides || {});
}

export function normalizePlaybackLoops(link) {
  if (!link) return [];
  if (Array.isArray(link.playbackLoops)) {
    if (link.playbackLoops.length === 0) return [];
    return link.playbackLoops.map(function(loop, index) {
      return Object.assign(createPlaybackLoop(), loop, {
        id: loop.id || ('loop_' + index),
        name: loop.name !== undefined && loop.name !== null ? String(loop.name) : '',
        startAt: loop.startAt !== undefined && loop.startAt !== null ? String(loop.startAt) : '',
        endAt: loop.endAt !== undefined && loop.endAt !== null ? String(loop.endAt) : '',
        active: !!loop.active,
      });
    });
  }
  const hadLegacyMarkers = (link.startAt && String(link.startAt).trim())
    || (link.endAt && String(link.endAt).trim());
  const hadLegacyLoop = isPlaybackLoopEnabled(link);
  if (hadLegacyMarkers || hadLegacyLoop) {
    return [createPlaybackLoop({
      name: '',
      startAt: link.startAt ? String(link.startAt) : '',
      endAt: link.endAt ? String(link.endAt) : '',
      active: hadLegacyLoop,
    })];
  }
  return [];
}

export function getActivePlaybackLoop(link) {
  if (!link) return null;
  const loops = normalizePlaybackLoops(link);
  return loops.find(function(loop) { return loop.active; }) || null;
}

export function getLinkRegionStart(link) {
  if (!link) return 0;
  if (Array.isArray(link.playbackLoops)) {
    const active = getActivePlaybackLoop(link);
    if (!active) return 0;
    const candidate = active.startAt && String(active.startAt).trim() ? active.startAt : '';
    if (!candidate) return 0;
    const startAt = parseMsToSeconds(candidate);
    return startAt > 0 ? startAt : 0;
  }
  const candidate = link.startAt && String(link.startAt).trim() ? link.startAt : '';
  if (!candidate) return 0;
  const startAt = parseMsToSeconds(candidate);
  return startAt > 0 ? startAt : 0;
}

export function getLinkRegionEnd(link) {
  if (!link) return 0;
  if (Array.isArray(link.playbackLoops)) {
    const active = getActivePlaybackLoop(link);
    if (!active) return 0;
    const candidate = active.endAt && String(active.endAt).trim() ? active.endAt : '';
    if (!candidate) return 0;
    const endAt = parseMsToSeconds(candidate);
    return endAt > 0 ? endAt : 0;
  }
  const candidate = link.endAt && String(link.endAt).trim() ? link.endAt : '';
  if (!candidate) return 0;
  const endAt = parseMsToSeconds(candidate);
  return endAt > 0 ? endAt : 0;
}

export function syncLegacyLinkLoopFields(link) {
  if (!link) return link;
  const active = getActivePlaybackLoop(link);
  const next = Object.assign({}, link);
  if (active) {
    if (active.startAt && String(active.startAt).trim()) {
      next.startAt = String(active.startAt);
    }
    if (active.endAt && String(active.endAt).trim()) {
      next.endAt = String(active.endAt);
    }
    next.playbackLoop = true;
  } else {
    next.playbackLoop = false;
    if (Array.isArray(next.playbackLoops)) {
      next.startAt = '';
      next.endAt = '';
    }
  }
  return next;
}

export function ensureSingleActiveLoop(loops) {
  let activeIndex = -1;
  loops.forEach(function(loop, index) {
    if (loop.active) {
      if (activeIndex === -1) activeIndex = index;
      else loop.active = false;
    }
  });
  return loops;
}

export function getActiveLinkIndex(tune, mediaLinkNumber) {
  if (!tune || !Array.isArray(tune.links) || tune.links.length === 0) return null;
  if (mediaLinkNumber !== null && mediaLinkNumber !== undefined && tune.links[mediaLinkNumber]) {
    return mediaLinkNumber;
  }
  return 0;
}

/** First cacheable non-MIDI media link (audio, recording, YouTube), or null. */
export function getFirstPlayableMediaLinkIndex(tune, preferredLinkIndex, isYoutubeLink) {
  if (!tune || !Array.isArray(tune.links) || tune.links.length === 0) return null;
  const resolved = resolveActiveLinkForTune(tune, preferredLinkIndex, isYoutubeLink);
  return resolved ? resolved.linkIndex : null;
}

function linkAtIndex(tune, index) {
  if (!tune || !Array.isArray(tune.links) || index < 0 || index >= tune.links.length) {
    return null;
  }
  const link = tune.links[index];
  if (!link || !linkUriString(link).trim()) return null;
  return link;
}

/** First HTTP audio file link in tune.links order, or null. */
export function getFirstAudioMediaLinkIndex(tune, isYoutubeLink) {
  if (!tune || !Array.isArray(tune.links) || tune.links.length === 0) return null;
  for (let i = 0; i < tune.links.length; i += 1) {
    const link = linkAtIndex(tune, i);
    if (!link) continue;
    if (resolveLinkPlaybackSrcType(link, isYoutubeLink) === 'audio') {
      return i;
    }
  }
  return null;
}

/** Prefer first audio link; otherwise first playable media link. */
export function getDefaultLoopMediaLinkIndex(tune, isYoutubeLink) {
  const audioIndex = getFirstAudioMediaLinkIndex(tune, isYoutubeLink);
  if (audioIndex !== null) return audioIndex;
  return getFirstPlayableMediaLinkIndex(tune, null, isYoutubeLink);
}

export function tuneHasPlayableMediaLinks(tune, isYoutubeLink) {
  return getDefaultLoopMediaLinkIndex(tune, isYoutubeLink) !== null;
}

export function resolveLoopEditorLinkIndex(tune, mediaController, isYoutubeLink) {
  if (!tune || !mediaController) {
    return getDefaultLoopMediaLinkIndex(tune, isYoutubeLink);
  }
  const onMediaRoute = mediaController.isMediaPlaybackRoute
    && mediaController.isMediaPlaybackRoute();
  const linkNum = mediaController.mediaLinkNumber;
  if (onMediaRoute && linkNum !== null && linkNum !== undefined) {
    return getActiveLinkIndex(tune, linkNum);
  }
  return getDefaultLoopMediaLinkIndex(tune, isYoutubeLink);
}

export function isMediaLoopTabEnabled(tune, mediaController, isYoutubeLink) {
  if (!tuneHasPlayableMediaLinks(tune, isYoutubeLink)) return false;
  if (!mediaController || !mediaController.isMidiPlaybackRoute) return true;
  return !mediaController.isMidiPlaybackRoute();
}
