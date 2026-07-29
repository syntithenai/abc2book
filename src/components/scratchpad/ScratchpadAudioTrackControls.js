import { Button, ButtonGroup } from 'react-bootstrap'
import ScratchpadNewTrackDialog from './ScratchpadNewTrackDialog'

export default function ScratchpadAudioTrackControls(props) {
  const icons = props.icons || {}
  const tracks = (props.tracks || []).filter(function(t) {
    if (t.type === 'midi') return !!props.advancedFeatures
    return t.type === 'audio'
  })
  const armedTrack = tracks.find(function(t) { return t.armed }) || null

  return (
    <div className="scratchpad-audio-track-controls">
      <span className="scratchpad-audio-dock-label small text-muted">Track</span>
      <ButtonGroup size="sm" className="scratchpad-audio-transport-controls">
        {tracks.map(function(track, index) {
          const armed = !!track.armed
          return (
            <Button
              key={track.id}
              variant={armed ? 'danger' : 'outline-secondary'}
              title={track.name + (armed ? ' (armed for record)' : '')}
              aria-pressed={armed}
              className={props.highlightArmTrackId === track.id ? 'scratchpad-arm-highlight' : ''}
              onClick={function() { props.onArm && props.onArm(track.id) }}
            >
              {index + 1}
            </Button>
          )
        })}
        <ScratchpadNewTrackDialog
          itemId={props.itemId}
          trackCount={(props.tracks || []).length}
          ee={props.ee}
          icons={icons}
          advancedFeatures={props.advancedFeatures}
          onAddTrack={props.onAddTrack}
          onAddTrackAndRecord={props.onAddTrackAndRecord}
          onImportFile={props.onImportFile}
          iconOnly={true}
        />
      </ButtonGroup>
      {armedTrack && armedTrack.type === 'audio' ? (
        <ButtonGroup size="sm" className="scratchpad-audio-track-arm-controls scratchpad-audio-transport-controls">
          <Button
            variant={armedTrack.compEnabled ? 'info' : 'outline-secondary'}
            title="Comping: combine the best parts of multiple takes into one composite"
            aria-pressed={!!armedTrack.compEnabled}
            onClick={function() {
              if (props.onCompToggle) props.onCompToggle(armedTrack.id, !armedTrack.compEnabled)
            }}
          >
            Comp
          </Button>
        </ButtonGroup>
      ) : null}
    </div>
  )
}
