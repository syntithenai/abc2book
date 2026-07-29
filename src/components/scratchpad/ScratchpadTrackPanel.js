import { useRef, useState } from 'react'
import { Button, Dropdown } from 'react-bootstrap'
import ScratchpadNewTrackDialog from './ScratchpadNewTrackDialog'
import {
  enumeratePlaylistLanes,
  DEFAULT_MAIN_LANE_HEIGHT,
} from '../../scratchpadAudioProject'

const PANGRAB = '⋮⋮'

function TrackRowMenu(props) {
  const track = props.track
  const folders = props.trackFolders || []
  return (
    <Dropdown align="end" onClick={function(e) { e.stopPropagation() }}>
      <Dropdown.Toggle
        variant="link"
        size="sm"
        className="scratchpad-track-panel-menu-toggle p-0"
        title="Track options"
      />
      <Dropdown.Menu>
        <Dropdown.Item onClick={function() { props.onArm && props.onArm(track.id) }}>
          {track.armed ? '✓ Armed' : 'Arm for record'}
        </Dropdown.Item>
        <Dropdown.Item onClick={function() { props.onRename && props.onRename(track) }}>
          Rename…
        </Dropdown.Item>
        <Dropdown.Item onClick={function() { props.onDuplicate && props.onDuplicate(track.id) }}>
          Duplicate
        </Dropdown.Item>
        <Dropdown.Divider />
        <Dropdown.Item onClick={function() {
          if (props.onCompToggle) props.onCompToggle(track.id, !track.compEnabled)
        }}>
          {track.compEnabled ? '✓ Comping on' : 'Enable comping'}
        </Dropdown.Item>
        <Dropdown.Item onClick={function() {
          if (props.onMuteToggle) props.onMuteToggle(track.id, !track.muted)
        }}>
          {track.muted ? 'Unmute' : 'Mute'}
        </Dropdown.Item>
        <Dropdown.Item onClick={function() {
          if (props.onSoloToggle) props.onSoloToggle(track.id, !track.soloed)
        }}>
          {track.soloed ? 'Unsolo' : 'Solo'}
        </Dropdown.Item>
        <Dropdown.Divider />
        <Dropdown.Header>Move to folder</Dropdown.Header>
        <Dropdown.Item onClick={function() { props.onMoveToFolder && props.onMoveToFolder(track.id, null) }}>
          (No folder)
        </Dropdown.Item>
        {folders.map(function(folder) {
          return (
            <Dropdown.Item
              key={folder.id}
              onClick={function() { props.onMoveToFolder && props.onMoveToFolder(track.id, folder.id) }}
            >
              {folder.name}
            </Dropdown.Item>
          )
        })}
        <Dropdown.Item onClick={function() { props.onNewFolder && props.onNewFolder(track.id) }}>
          New folder…
        </Dropdown.Item>
        <Dropdown.Divider />
        <Dropdown.Item className="text-danger" onClick={function() { props.onDelete && props.onDelete(track.id) }}>
          Delete track
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  )
}

function MainLaneRow(props) {
  const track = props.track
  const height = props.height
  const resizingRef = useRef(false)

  function onPointerDownResize(e) {
    e.preventDefault()
    e.stopPropagation()
    resizingRef.current = true
    const startY = e.clientY
    const startHeight = track.laneHeight != null ? track.laneHeight : DEFAULT_MAIN_LANE_HEIGHT

    function onMove(ev) {
      if (!resizingRef.current) return
      const delta = ev.clientY - startY
      const next = Math.max(48, Math.min(320, startHeight + delta))
      if (props.onLaneHeightChange) props.onLaneHeightChange(track.id, next)
    }

    function onUp() {
      resizingRef.current = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  return (
    <div
      className={'scratchpad-track-panel-lane scratchpad-track-panel-lane--main' + (track.armed ? ' scratchpad-track-panel-row--armed' : '') + (props.dragOver ? ' scratchpad-track-panel-row--drag-over' : '')}
      style={{ height: height + 'px', minHeight: height + 'px' }}
      draggable={true}
      onDragStart={function(e) { if (props.onDragStart) props.onDragStart(props.trackIndex, e) }}
      onDragOver={function(e) { e.preventDefault(); if (props.onDragOver) props.onDragOver(props.trackIndex) }}
      onDrop={function(e) { e.preventDefault(); if (props.onDrop) props.onDrop(props.trackIndex) }}
      onDragEnd={function() { if (props.onDragEnd) props.onDragEnd() }}
      onClick={function() { props.onArm && props.onArm(track.id) }}
    >
      <div className="scratchpad-track-panel-row-inner">
        <span className="scratchpad-track-panel-drag" title="Drag to reorder">{PANGRAB}</span>
        <TrackRowMenu
          track={track}
          trackFolders={props.trackFolders}
          onArm={props.onArm}
          onRename={props.onRename}
          onDuplicate={props.onDuplicate}
          onCompToggle={props.onCompToggle}
          onMuteToggle={props.onMuteToggle}
          onSoloToggle={props.onSoloToggle}
          onMoveToFolder={props.onMoveToFolder}
          onNewFolder={props.onNewFolder}
          onDelete={props.onDelete}
        />
        <span className="scratchpad-track-panel-name small text-truncate" title={track.name}>
          {track.name}
        </span>
      </div>
      <div
        className="scratchpad-track-panel-resize"
        onPointerDown={onPointerDownResize}
        title="Resize waveform height"
      />
    </div>
  )
}

function TakeLaneRow(props) {
  const track = props.track
  const take = props.take
  const height = props.height
  const active = take.id === track.activeTakeId
  return (
    <div
      className={'scratchpad-track-panel-lane scratchpad-track-panel-lane--take' + (active ? ' scratchpad-track-panel-lane--take-active' : '')}
      style={{ height: height + 'px', minHeight: height + 'px' }}
      title={'Take ' + (props.takeIndex + 1)}
      onClick={function(e) {
        e.stopPropagation()
        if (props.onSelectTake) props.onSelectTake(track.id, take.id)
      }}
    >
      <span className="small text-muted">T{props.takeIndex + 1}</span>
    </div>
  )
}

function MidiLaneRow(props) {
  const track = props.track
  const height = props.height
  return (
    <div
      className="scratchpad-track-panel-lane scratchpad-track-panel-lane--midi"
      style={{ height: height + 'px', minHeight: height + 'px' }}
    >
      <div className="scratchpad-track-panel-row-inner">
        <span className="scratchpad-track-panel-name small text-truncate">{track.name} (MIDI)</span>
        <Button size="sm" variant="outline-primary" onClick={function() { props.onEditMidi && props.onEditMidi(track.id) }}>
          Edit
        </Button>
      </div>
    </div>
  )
}

export default function ScratchpadTrackPanel(props) {
  const tracks = props.tracks || []
  const folders = props.trackFolders || []
  const advancedFeatures = !!props.advancedFeatures
  const icons = props.icons || {}
  const [dragFrom, setDragFrom] = useState(null)
  const [dragOver, setDragOver] = useState(null)

  const lanes = enumeratePlaylistLanes(
    { tracks: tracks, trackFolders: folders },
    advancedFeatures
  )
  const midiHidden = tracks.filter(function(t) { return t.type === 'midi' }).length

  function trackIndex(trackId) {
    const visible = advancedFeatures ? tracks : tracks.filter(function(t) { return t.type !== 'midi' })
    return visible.findIndex(function(t) { return t.id === trackId })
  }

  function onDragStart(index, event) {
    setDragFrom({ index: index })
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', String(index))
    }
  }

  function onDrop(index) {
    if (!dragFrom || dragFrom.index === index) {
      setDragFrom(null)
      setDragOver(null)
      return
    }
    if (props.onReorder) props.onReorder(dragFrom.index, index)
    setDragFrom(null)
    setDragOver(null)
  }

  return (
    <div className="scratchpad-track-panel">
      <div className="scratchpad-track-panel-header scratchpad-track-sidebar-header d-flex align-items-center justify-content-between">
        <strong className="small">Tracks</strong>
        <div className="d-flex gap-1">
          <Button size="sm" variant="outline-secondary" title="New folder" onClick={function() { props.onNewFolder && props.onNewFolder(null) }}>
            + Folder
          </Button>
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
      </div>

      {!advancedFeatures && midiHidden > 0 ? (
        <div className="scratchpad-midi-hidden-notice small text-muted mb-2 p-2 border rounded">
          {midiHidden} MIDI track{midiHidden > 1 ? 's' : ''} hidden.
          Enable <strong>View → Advanced features</strong> to edit.
        </div>
      ) : null}

      <div className="scratchpad-track-panel-ruler-spacer" aria-hidden="true" />
      <div className="scratchpad-track-panel-timescale-spacer" aria-hidden="true" />

      <div className="scratchpad-track-panel-scroll" ref={props.panelScrollRef}>
        {lanes.map(function(lane, laneIndex) {
          if (lane.kind === 'midi') {
            return (
              <MidiLaneRow
                key={'midi-' + lane.track.id}
                track={lane.track}
                height={lane.height}
                onEditMidi={props.onEditMidi}
              />
            )
          }
          if (lane.kind === 'main') {
            const index = trackIndex(lane.track.id)
            return (
              <MainLaneRow
                key={'main-' + lane.track.id}
                track={lane.track}
                height={lane.height}
                trackIndex={index}
                trackFolders={folders}
                dragOver={dragOver && dragOver.index === index}
                onDragStart={onDragStart}
                onDragOver={function(i) { setDragOver({ index: i }) }}
                onDrop={onDrop}
                onDragEnd={function() { setDragFrom(null); setDragOver(null) }}
                onArm={props.onArm}
                onRename={props.onRename}
                onDuplicate={props.onDuplicate}
                onCompToggle={props.onCompToggle}
                onMuteToggle={props.onMuteToggle}
                onSoloToggle={props.onSoloToggle}
                onMoveToFolder={props.onMoveToFolder}
                onNewFolder={props.onNewFolder}
                onDelete={props.onDelete}
                onLaneHeightChange={props.onLaneHeightChange}
              />
            )
          }
          if (lane.kind === 'take') {
            return (
              <TakeLaneRow
                key={'take-' + lane.track.id + '-' + lane.take.id}
                track={lane.track}
                take={lane.take}
                takeIndex={lane.takeIndex}
                height={lane.height}
                onSelectTake={props.onSelectTake}
              />
            )
          }
          return null
        })}
        {lanes.length === 0 ? (
          <div className="small text-muted p-2">Add a track to begin.</div>
        ) : null}
      </div>
    </div>
  )
}
