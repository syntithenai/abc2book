export function getLinkedMediaSources(tune, tunebook) {
  const sources = [];

  if (tune && Array.isArray(tune.links)) {
    tune.links.forEach(function(link, index) {
      if (!link || !link.link || !link.link.trim()) return;
      const src = link.link.trim();
      sources.push({
        id: 'link-' + index,
        kind: 'link',
        src: src,
        srcType: tunebook.utils.isYoutubeLink(src) ? 'youtube' : 'audio',
        label: link.title || ('Linked media ' + (index + 1)),
        detail: src,
      });
    });
  }

  return sources;
}
