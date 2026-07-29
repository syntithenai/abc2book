import { buildRemoteOutputQueue } from './remoteOutputQueue';
import { buildAbcMidiSessionFields, isAbcMidiPlaybackRoute } from './remotePlaybackAbcMidi';
import { needsCastTranscodeSession } from './remoteOutputSupport';
import { getMediaPlaybackSettings } from './pitchTempoUtils';

export function buildRemotePlaybackSessionPayload(mediaController, tunebook, options) {
  const opts = options || {};
  const tune = mediaController.tune;
  if (!tune) return null;

  const startSeconds = mediaController.getPlaybackProgress
    ? (mediaController.getPlaybackProgress().seconds || 0)
    : 0;
  const duration = mediaController.duration || 0;
  const queue = opts.queue || buildRemoteOutputQueue(mediaController, opts.nowPlayingQueue, opts.tunes);
  const playbackSettings = needsCastTranscodeSession(mediaController)
    ? getMediaPlaybackSettings(tune)
    : { pitch: 0, fineTune: 0, tempo: 1 };

  if (isAbcMidiPlaybackRoute(mediaController)) {
    const abcFields = buildAbcMidiSessionFields(tune, tunebook);
    if (!abcFields) return null;
    return Object.assign({}, abcFields, {
      startSeconds: startSeconds,
      duration: duration,
      pitch: playbackSettings.pitch,
      fineTune: playbackSettings.fineTune,
      tempo: playbackSettings.tempo,
      queue: queue,
      concatSet: !!(queue && queue.length > 1),
    });
  }

  const linkIndex = mediaController.mediaLinkNumber;
  const src = mediaController.getSrc(tune, linkIndex);
  const activeLink = tune.links && tune.links[linkIndex] ? tune.links[linkIndex] : null;
  const srcType = mediaController.getSrcType(src, activeLink);
  return {
    source: src,
    sourceType: srcType,
    startSeconds: startSeconds,
    duration: duration,
    title: tune.name || '',
    artist: tune.composer || '',
    pitch: playbackSettings.pitch,
    fineTune: playbackSettings.fineTune,
    tempo: playbackSettings.tempo,
    queue: queue,
    concatSet: !!(queue && queue.length > 1 && needsCastTranscodeSession(mediaController)),
  };
}
