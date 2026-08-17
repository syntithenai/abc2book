import { isOwnedMediaLinkUri } from './linkRecording';
import { resolveLinkPlaybackSrcType } from './mediaLinkSrcType';
import { linkUriString } from './tuneLinkUri';
import { isYoutubePlaybackUri } from './youtubePlaybackUri';

export function getLinkedMediaSources(tune, tunebook) {
  const sources = [];

  if (tune && Array.isArray(tune.links)) {
    tune.links.forEach(function(link, index) {
      const source = buildLinkedMediaSource(link, index, tunebook);
      if (source) sources.push(source);
    });
  }

  return sources;
}

export function buildLinkedMediaSource(link, index, tunebook) {
  const src = linkUriString(link).trim();
  if (!src) return null;
  const isYoutubeLink = tunebook && tunebook.utils && tunebook.utils.isYoutubeLink;
  if (resolveLinkPlaybackSrcType(link, isYoutubeLink) === 'midifile') return null;
  const isRecording = isOwnedMediaLinkUri(src);
  const youtube = (typeof isYoutubeLink === 'function' && isYoutubeLink(src))
    || isYoutubePlaybackUri(src);
  return {
    id: 'link-' + index,
    kind: 'link',
    src: src,
    srcType: isRecording
      ? 'recording'
      : (youtube ? 'youtube' : 'audio'),
    label: link.title || ('Linked media ' + (index + 1)),
    detail: src,
    linkIndex: index,
  };
}

export function getLinkedMediaSourceByIndex(tune, tunebook, linkIndex) {
  if (!tune || !Array.isArray(tune.links) || linkIndex === null || linkIndex === undefined) {
    return null;
  }
  return buildLinkedMediaSource(tune.links[linkIndex], linkIndex, tunebook);
}
