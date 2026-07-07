import { resolveRecordingLinkAudio } from './linkRecording';

export async function prepareMediaAnalysisSource(source, tune, options) {
  if (!source || source.srcType !== 'recording') {
    return source;
  }
  if (!tune || !Array.isArray(tune.links)) {
    throw new Error('Recording source requires a tune with links');
  }

  const linkIndex = source.linkIndex;
  const link = tune.links[linkIndex];
  if (!link) {
    throw new Error('Recording link is not available for analysis');
  }

  const resolved = await resolveRecordingLinkAudio(link, tune.id, linkIndex, {
    accessToken: options && options.accessToken,
    driveApi: options && options.driveApi,
    forPlayback: false,
  });

  return {
    id: source.id,
    kind: 'recording',
    blob: resolved.blob,
    fileName: (link.title || 'recording') + '.mp3',
    label: source.label,
  };
}
