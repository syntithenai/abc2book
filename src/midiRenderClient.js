import { fetchViaMediaProxy, normalizeAccessToken } from './mediaProxyClient';
import { isOwnedMediaLink, resolveRecordingLinkMidi } from './linkRecording';
import { resolveMidiLinkPlaybackData } from './midiLinkResolve';

export async function renderMidiBytesToWavBlob(midiBytes, options) {
  const opts = options || {};
  const bytes = midiBytes instanceof ArrayBuffer ? midiBytes : midiBytes.buffer;
  let filename = opts.filename || 'source.mid';
  if (!/\.mid(i)?$/i.test(filename)) {
    filename += '.mid';
  }
  const form = new FormData();
  form.append('midi', new Blob([bytes], { type: 'audio/midi' }), filename);
  const response = await fetchViaMediaProxy('/render-midi', normalizeAccessToken(opts.token), {
    method: 'POST',
    body: form,
    headers: { Accept: 'audio/wav' },
  });
  if (!response.ok) {
    const body = await response.json().catch(function() { return {}; });
    throw new Error(body.error || body.detail || 'Could not render MIDI to audio');
  }
  return response.blob();
}

export async function renderMidiLinkToWavBlob(link, tuneId, linkIndex, options) {
  const opts = options || {};
  let midiData;
  try {
    midiData = await resolveMidiLinkPlaybackData(link, tuneId, linkIndex, {
      accessToken: opts.token,
      driveApi: opts.driveApi,
      isYoutubeLink: opts.isYoutubeLink,
    });
  } catch (err) {
    if (!isOwnedMediaLink(link)) throw err;
    const resolved = await resolveRecordingLinkMidi(link, tuneId, linkIndex, {
      accessToken: opts.token,
      driveApi: opts.driveApi,
      forPlayback: true,
    });
    midiData = {
      arrayBuffer: resolved.arrayBuffer,
      duration: resolved.duration,
      source: resolved.source,
    };
  }
  const baseName = (link && link.title ? String(link.title).trim() : '') || 'source';
  return renderMidiBytesToWavBlob(midiData.arrayBuffer, {
    token: opts.token,
    filename: baseName.replace(/\.(mid|midi)$/i, '') + '.mid',
  });
}
