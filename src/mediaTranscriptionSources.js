export function getLinkedMediaSources(tune, tunebook, recordingsManager) {
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

  if (recordingsManager && Array.isArray(recordingsManager.filtered)) {
    recordingsManager.filtered.forEach(function(recording) {
      if (!recording || !recording.id || !recording.type || !recording.type.startsWith('audio/')) return;
      sources.push({
        id: 'recording-' + recording.id,
        kind: 'recording',
        recordingId: recording.id,
        fileName: recording.name || 'recording.wav',
        mimeType: recording.type,
        label: recording.name || 'Recording',
        detail: 'Stored recording',
      });
    });
  }

  return sources;
}
