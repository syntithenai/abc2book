import { isOwnedMediaLinkUri } from './linkRecording';

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
  if (!link || !link.link || !link.link.trim()) return null;
  const src = link.link.trim();
  const isRecording = isOwnedMediaLinkUri(src);
  return {
    id: 'link-' + index,
    kind: 'link',
    src: src,
    srcType: isRecording
      ? 'recording'
      : (tunebook.utils.isYoutubeLink(src) ? 'youtube' : 'audio'),
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
