import { useRef } from 'react'
import { Button, ButtonGroup } from 'react-bootstrap'
import ScratchpadAudioMetronomeControls from './ScratchpadAudioMetronomeControls'
import ScratchpadAudioInputMeter from './ScratchpadAudioInputMeter'
import ScratchpadAudioToolbarOverflow from './ScratchpadAudioToolbarOverflow'
import ScratchpadAudioRecordBarControls from './ScratchpadAudioRecordBarControls'
import useScratchpadToolbarWidth from '../../useScratchpadToolbarWidth'
import { scratchpadToolbarTier, isScratchpadToolbarNarrow } from '../../scratchpadAudioToolbarLayout'

function transportGlyph(icons, key, shortLabel) {
  return icons[key] || shortLabel
}

export default function ScratchpadAudioTransportDock(props) {
  const icons = props.icons || {}
  const ee = props.ee
  const dockRef = useRef(null)
  const dockWidth = useScratchpadToolbarWidth(dockRef)
  const dockTier = dockWidth > 0 ? scratchpadToolbarTier(dockWidth) : (props.layoutTier || 'wide')
  const narrow = isScratchpadToolbarNarrow(dockTier)
  const showExtrasInline = !narrow
  const canRecord = !!props.armedTrackId
  const recordTitle = props.isRecording
    ? 'Stop recording'
    : (canRecord ? 'Record on armed track' : 'Arm a track to record')

  const overflowItems = [
    { key: 'zoom-out', label: 'Zoom out', onClick: function() { ee && ee.emit('zoomout') } },
    { key: 'zoom-in', label: 'Zoom in', onClick: function() { ee && ee.emit('zoomin') } },
    { key: 'punch', label: (props.punchInEnabled ? '✓ ' : '') + 'Punch-in', onClick: function() {
      if (props.onPunchInChange) props.onPunchInChange(!props.punchInEnabled)
    } },
    { key: 'record-mode', label: 'Record: ' + ((props.recordMode || 'newTake') === 'replace' ? 'Replace' : 'New take'), onClick: function() {
      if (props.onRecordModeChange) {
        const mode = props.recordMode || 'newTake'
        props.onRecordModeChange(mode === 'replace' ? 'newTake' : 'replace')
      }
    } },
    { key: 'snap', label: (props.snapToGrid ? '✓ ' : '') + 'Snap to grid', onClick: function() {
      if (props.onSnapChange) props.onSnapChange(!props.snapToGrid)
    } },
    { key: 'settings', label: 'Audio settings…', onClick: props.onOpenSettings },
  ]

  return (
    <div
      ref={dockRef}
      className={'scratchpad-audio-transport-dock scratchpad-audio-transport-dock--' + dockTier}
    >
      <div className="scratchpad-audio-dock-row">
        <ButtonGroup size="sm" className="scratchpad-audio-transport-controls">
          <Button variant="outline-secondary" title="Rewind" aria-label="Rewind" onClick={function() { ee && ee.emit('rewind') }}>
            {transportGlyph(icons, 'skipback', '⏮')}
          </Button>
          <Button
            variant="success"
            title={props.isPlaying ? 'Pause' : 'Play'}
            aria-label={props.isPlaying ? 'Pause' : 'Play'}
            onClick={props.onPlayPause}
          >
            {props.isPlaying ? transportGlyph(icons, 'pause', '⏸') : transportGlyph(icons, 'play', '▶')}
          </Button>
          <Button
            variant="danger"
            title="Stop"
            aria-label="Stop"
            onClick={function() {
              if (ee) ee.emit('stop')
              if (props.onStop) props.onStop()
            }}
          >
            {transportGlyph(icons, 'stop', '⏹')}
          </Button>
          <Button
            variant={props.isRecording ? 'danger' : 'outline-danger'}
            title={recordTitle}
            aria-label={props.isRecording ? 'Stop recording' : 'Record'}
            disabled={!canRecord && !props.isRecording}
            onClick={props.onRecord}
          >
            {transportGlyph(icons, 'record', transportGlyph(icons, 'mic', '●'))}
          </Button>
        </ButtonGroup>

        {props.currentTime != null && props.duration != null ? (
          <span className="small text-muted scratchpad-audio-transport-time">
            {props.formatTime(props.currentTime)} / {props.formatTime(props.duration)}
          </span>
        ) : null}

        <ScratchpadAudioInputMeter analyserNode={props.inputAnalyser} />

        <div className="scratchpad-audio-dock-divider" aria-hidden="true" />

        <ScratchpadAudioMetronomeControls
          icons={icons}
          narrow={narrow}
          compact={true}
          tempo={props.tempo}
          countInBars={props.countInBars}
          rhythmConfig={props.rhythmConfig}
          metronomeEnabled={props.metronomeEnabled}
          metronomeDuringPlayback={props.metronomeDuringPlayback}
          metronomeDuringRecording={props.metronomeDuringRecording}
          onMetronomeEnabledChange={props.onMetronomeEnabledChange}
          onCountInChange={props.onCountInChange}
          onTempoChange={props.onTempoChange}
          onRhythmConfigChange={props.onRhythmConfigChange}
          onMetronomeDuringPlaybackChange={props.onMetronomeDuringPlaybackChange}
          onMetronomeDuringRecordingChange={props.onMetronomeDuringRecordingChange}
        />

        {showExtrasInline ? (
          <>
            <ButtonGroup size="sm" className="scratchpad-audio-transport-controls">
              <Button variant="outline-secondary" title="Zoom out" aria-label="Zoom out" onClick={function() { ee && ee.emit('zoomout') }}>
                {transportGlyph(icons, 'zoomout', '−')}
              </Button>
              <Button variant="outline-secondary" title="Zoom in" aria-label="Zoom in" onClick={function() { ee && ee.emit('zoomin') }}>
                {transportGlyph(icons, 'zoomin', '+')}
              </Button>
            </ButtonGroup>
            <ScratchpadAudioRecordBarControls
              icons={icons}
              punchInEnabled={props.punchInEnabled}
              recordMode={props.recordMode}
              snapToGrid={props.snapToGrid}
              onPunchInChange={props.onPunchInChange}
              onRecordModeChange={props.onRecordModeChange}
              onSnapChange={props.onSnapChange}
              onOpenSettings={props.onOpenSettings}
            />
          </>
        ) : (
          <ScratchpadAudioToolbarOverflow items={overflowItems} />
        )}
      </div>
    </div>
  )
}
