/** Labels and visibility for compact media-source picker UI. */

import { getLinkSrcType } from './checkTuneLinkPlayback';
import { linkedMediaPitchPathAvailableSync } from './linkedMediaPitchPath';
import { getResolverLoginWarning } from './mediaProxyClient';
import { audioFiltersAreNeutral, pitchShiftIsActive } from './pitchTempoUtils';
import { normalizeAccessToken } from './resolverCreditAccess';

function youtubePlaybackNeedsDownloadedAudio(settings) {
  if (!settings) return false;
  if (pitchShiftIsActive(settings.pitch, settings.fineTune)) return true;
  return !!(settings.audioFilters && !audioFiltersAreNeutral(settings.audioFilters));
}

function linkSourceLabel(link, linkKey, isYoutubeLink) {
  const title = link && link.title && String(link.title).trim();
  if (title) return title;
  const srcType = getLinkSrcType(link, isYoutubeLink);
  if (srcType === 'youtube') return 'YouTube';
  if (srcType === 'recording') return 'Recording';
  if (srcType === 'midifile') return 'MIDI file';
  if (srcType === 'audio') return 'Audio';
  return 'Link ' + (linkKey + 1);
}

export function buildMediaSourceOptions(tune, tunebook) {
  const options = [];
  if (!tune || !tunebook) return options;

  const hasMusic = !!(tunebook.hasNotesOrChords && tunebook.hasNotesOrChords(tune));
  const hasLinks = !!(tunebook.hasLinks && tunebook.hasLinks(tune));
  const isYoutubeLink = tunebook.utils && tunebook.utils.isYoutubeLink;

  if (hasMusic) {
    options.push({
      id: 'midi',
      kind: 'midi',
      label: 'ABC notation',
    });
  }

  if (hasLinks && Array.isArray(tune.links)) {
    tune.links.forEach(function(link, linkKey) {
      if (!link || !link.link || !String(link.link).trim()) return;
      options.push({
        id: 'link-' + linkKey,
        kind: 'link',
        linkIndex: linkKey,
        label: linkSourceLabel(link, linkKey, isYoutubeLink),
        srcType: getLinkSrcType(link, isYoutubeLink),
      });
    });
  }

  return options;
}

export function getActiveMediaSourceId(mediaController) {
  if (!mediaController) return '';
  if (mediaController.isMidiPlaybackRoute && mediaController.isMidiPlaybackRoute()) {
    return 'midi';
  }
  if (mediaController.isMediaPlaybackRoute && mediaController.isMediaPlaybackRoute()) {
    const linkNum = mediaController.mediaLinkNumber;
    if (linkNum != null) return 'link-' + linkNum;
  }
  return '';
}

export function getYoutubeLoginGate(resolverStatus, accessToken) {
  const warning = getResolverLoginWarning(resolverStatus, normalizeAccessToken(accessToken));
  if (!warning || !warning.showLoginButton) return null;
  return warning;
}

export function mediaSourceNeedsLogin(option, resolverStatus, accessToken, resolverFeatures, playbackSettings) {
  if (!option || option.srcType !== 'youtube') return null;
  // Plain YouTube embed works without resolver login; only pitch shift / filters need downloaded audio.
  if (!youtubePlaybackNeedsDownloadedAudio(playbackSettings)) return null;
  if (linkedMediaPitchPathAvailableSync({
    srcType: 'youtube',
    resolverFeatures: resolverFeatures || null,
    resolverStatus: resolverStatus || null,
    accessToken: normalizeAccessToken(accessToken),
  })) return null;
  return getYoutubeLoginGate(resolverStatus, accessToken);
}
