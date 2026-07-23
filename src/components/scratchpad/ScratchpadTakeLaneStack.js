import { Button, ButtonGroup, Form } from 'react-bootstrap'
import ScratchpadNewTrackDialog from './ScratchpadNewTrackDialog'

export default function ScratchpadTakeLaneStack(props) {
  const track = props.track
  if (!track || track.type === 'midi') return null
  const takes = track.takes || []
  const activeId = track.activeTakeId
  const compEnabled = !!track.compEnabled

  return (
    <div className="scratchpad-take-lane-stack">
      <div className="scratchpad-take-lane-header d-flex align-items-center justify-content-between">
        <strong className="small">{track.name}</strong>
        <div className="d-flex gap-1">
          <Button
            size="sm"
            variant={track.armed ? 'danger' : 'outline-secondary'}
            onClick={function() { props.onArm && props.onArm(track.id) }}
          >
            {track.armed ? 'Armed' : 'Arm'}
          </Button>
          <Form.Check
            type="checkbox"
            className="mb-0 small"
            label="Comp"
            checked={compEnabled}
            onChange={function(e) { props.onCompToggle && props.onCompToggle(track.id, e.target.checked) }}
          />
        </div>
      </div>
      <div className="scratchpad-take-lanes">
        {takes.map(function(take, index) {
          const active = take.id === activeId
          return (
            <ButtonGroup key={take.id} size="sm" className="mb-1">
              <Button
                variant={active ? 'primary' : 'outline-secondary'}
                onClick={function() { props.onSelectTake && props.onSelectTake(track.id, take.id) }}
              >
                Take {index + 1}
              </Button>
              {compEnabled && props.selection ? (
                <Button
                  variant="outline-info"
                  title="Assign selection to this take"
                  onClick={function() { props.onAssignComp && props.onAssignComp(track.id, take.id, props.selection) }}
                >
                  Comp
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

  return (
    <div className="scratchpad-track-list">
      <div className="scratchpad-track-sidebar-header d-flex align-items-center justify-content-between mb-2">
        <strong className="small">Tracks</strong>
        <ScratchpadNewTrackDialog
          itemId={props.itemId}
          trackCount={tracks.length}
          ee={props.ee}
          icons={icons}
          onAddTrack={props.onAddTrack}
          onImport={props.onImport}
        />
      </div>
      {tracks.map(function(track) {
        if (track.type === 'midi') {
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
        }
        return (
          <ScratchpadTakeLaneStack
            key={track.id}
            track={track}
            selection={props.selection}
            onArm={props.onArm}
            onSelectTake={props.onSelectTake}
            onNewTake={props.onNewTake}
            onCompToggle={props.onCompToggle}
            onAssignComp={props.onAssignComp}
          />
        )
      })}
    </div>
  )
}
