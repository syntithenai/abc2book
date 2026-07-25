import MediaPlayerMidiFile from './MediaPlayerMidiFile'

/**
 * Always-mounted MIDI file engine so linked MIDI playback works from media
 * controls, the editor, and other routes before tune-page hosts mount.
 */
function resolveMidiHostTune(tunes, mediaController) {
  const controllerTune = mediaController && mediaController.tune
  if (!controllerTune || !controllerTune.id) return null
  const storeTune = tunes && tunes[controllerTune.id]
  if (!storeTune) return controllerTune
  return Object.assign({}, storeTune, controllerTune, {
    links: Array.isArray(controllerTune.links) ? controllerTune.links : storeTune.links,
  })
}

export default function MidiFilePlaybackHost(props) {
  const mediaController = props.mediaController
  const tunebook = props.tunebook
  const tunes = props.tunes || {}
  if (!mediaController) return null
  if (mediaController.notationMidiOwner) return null

  const tune = resolveMidiHostTune(tunes, mediaController)

  const linkNum = mediaController.mediaLinkNumber != null
    ? mediaController.mediaLinkNumber
    : 0

  return (
    <div className="midi-file-playback-host" aria-hidden="true">
      <MediaPlayerMidiFile
        mediaController={mediaController}
        tunebook={tunebook}
        tune={tune}
        routePlayState="playMedia"
        routeMediaLinkNumber={String(linkNum)}
        suppressAutostart={false}
      />
    </div>
  )
}
