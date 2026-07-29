import { Button, ButtonGroup } from 'react-bootstrap'
import ScratchpadNewTrackDialog from './ScratchpadNewTrackDialog'

export default function ScratchpadTakeLaneStack(props) {
  const track = props.track
  if (!track || track.type === 'midi') return null
  const takes = track.takes || []
  const activeId = track.activeTakeId
  const compEnabled = !!track.compEnabled

  return (
    <div className="scratchpad-take-lane-stack">
      <div className="scratchpad-take-lanes">
        {takes.map(function(take, index) {
          const active = take.id === activeId
          return (
            <ButtonGroup key={take.id} size="sm" className="mb-1">
              <Button
                variant={active ? 'primary' : 'outline-secondary'}
                onClick={function() { props.onSelectTake && props.onSelectTake(track.id, take.id) }}
              >
                {index + 1}
              </Button>
              {compEnabled && props.selection ? (
                <Button
                  variant="outline-info"
                  title="Assign selection to this take for comping"
                  onClick={function() { props.onAssignComp && props.onAssignComp(track.id, take.id, props.selection) }}
                >
                  Use
                </Button>
              ) : null}
            </ButtonGroup>
          )
        })}
        <Button size="sm" variant="outline-success" onClick={function() { props.onNewTake && props.onNewTake(track.id) }}>
          + Take
        </Button>
      </div>
    </div>
  )
}

export function ScratchpadTrackList(props) {
  const tracks = props.tracks || []
  const icons = props.icons || {}
  const advancedFeatures = !!props.advancedFeatures
  const midiTracks = tracks.filter(function(t) { return t.type === 'midi' })
  const armedTrack = tracks.find(function(t) { return t.armed && t.type === 'audio' })

  return (
    <div className="scratchpad-track-list">
      <div className="scratchpad-track-sidebar-header d-flex align-items-center justify-content-between mb-2">
        <strong className="small">Tracks</strong>
        <ScratchpadNewTrackDialog
          itemId={props.itemId}
          trackCount={tracks.length}
          ee={props.ee}
          icons={icons}
          advancedFeatures={advancedFeatures}
          onAddTrack={props.onAddTrack}
          onAddTrackAndRecord={props.onAddTrackAndRecord}
          onImportFile={props.onImportFile}
        />
      </div>
      {!advancedFeatures && midiTracks.length > 0 ? (
        <div className="scratchpad-midi-hidden-notice small text-muted mb-2 p-2 border rounded">
          {midiTracks.length} MIDI track{midiTracks.length > 1 ? 's' : ''} hidden.
          Enable <strong>View → Advanced features</strong> to edit.
        </div>
      ) : null}
      {advancedFeatures ? tracks.filter(function(t) { return t.type === 'midi' }).map(function(track) {
        return (
          <div key={track.id} className="scratchpad-midi-track-row mb-2 p-2 border rounded">
            <div className="d-flex justify-content-between align-items-center mb-1">
              <strong className="small">{track.name} (MIDI)</strong>
              <Button size="sm" variant="outline-primary" onClick={function() { props.onEditMidi && props.onEditMidi(track.id) }}>
                Edit
              </Button>
            </div>
          </div>
        )
      }) : null}
      {armedTrack ? (
        <>
          <div className="scratchpad-track-sidebar-header mb-2">
            <strong className="small">Takes — {armedTrack.name}</strong>
          </div>
          <ScratchpadTakeLaneStack
            track={armedTrack}
            selection={props.selection}
            onSelectTake={props.onSelectTake}
            onNewTake={props.onNewTake}
            onAssignComp={props.onAssignComp}
          />
        </>
      ) : (
        <div className="small text-muted">Arm a track to view takes.</div>
      )}
    </div>
  )
}
