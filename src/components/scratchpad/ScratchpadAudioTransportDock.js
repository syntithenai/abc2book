import { Button, ButtonGroup, Dropdown, Form } from 'react-bootstrap'
import ScratchpadAudioRecordSettings from './ScratchpadAudioRecordSettings'
import ScratchpadAudioMetronomeControls from './ScratchpadAudioMetronomeControls'
import ScratchpadAudioInputMeter from './ScratchpadAudioInputMeter'
import ScratchpadAudioToolbarOverflow from './ScratchpadAudioToolbarOverflow'
import { isScratchpadToolbarNarrow } from '../../scratchpadAudioToolbarLayout'

function TransportBlock(props) {
  const icons = props.icons || {}
  const ee = props.ee
  const canRecord = !!props.armedTrackId
  const recordTitle = props.isRecording
    ? 'Stop recording'
    : (canRecord ? 'Record on armed track' : 'Arm a track in the sidebar to record')

  return (
    <div className="scratchpad-audio-dock-block scratchpad-audio-dock-block--transport">
      <span className="scratchpad-audio-dock-block-label">Transport</span>
      <div className="scratchpad-audio-dock-block-body">
        <ButtonGroup size="sm">
          <Button variant="outline-secondary" title="Rewind" onClick={function() { ee && ee.emit('rewind') }}>
            {icons.skipback || '⏮'}
          </Button>
          <Button
            variant="success"
            title={props.isPlaying ? 'Pause' : 'Play'}
            onClick={props.onPlayPause}
          >
            {props.isPlaying ? (icons.pause || 'Pause') : (icons.play || 'Play')}
          </Button>
          <Button
            variant="danger"
            title="Stop"
            onClick={function() {
              if (ee) ee.emit('stop')
              if (props.onStop) props.onStop()
            }}
          >
            {icons.stop || 'Stop'}
          </Button>
          <Button
            variant={props.isRecording ? 'danger' : 'outline-danger'}
            title={recordTitle}
            disabled={!canRecord && !props.isRecording}
            onClick={props.onRecord}
          >
            {icons.record || icons.mic || 'Record'}
          </Button>
        </ButtonGroup>
        {props.currentTime != null && props.duration != null ? (
          <span className="small text-muted scratchpad-audio-transport-time">
            {props.formatTime(props.currentTime)} / {props.formatTime(props.duration)}
          </span>
        ) : null}
        <ScratchpadAudioInputMeter analyserNode={props.inputAnalyser} />
      </div>
    </div>
  )
}

function TempoZoomBlock(props) {
  const icons = props.icons || {}
  const ee = props.ee
  const narrow = isScratchpadToolbarNarrow(props.layoutTier || 'wide')
  const tempo = props.tempo != null ? props.tempo : 120

  if (narrow) {
    const overflowItems = [
      { key: 'tempo', label: 'Tempo: ' + tempo + ' BPM', onClick: function() {} },
      { key: 'zoom-in', label: 'Zoom in', onClick: function() { ee && ee.emit('zoomin') } },
      { key: 'zoom-out', label: 'Zoom out', onClick: function() { ee && ee.emit('zoomout') } },
      { key: 'record-settings', label: 'Record settings…', onClick: props.onOpenRecordSettings },
      { key: 'settings', label: 'Audio settings…', onClick: props.onOpenSettings },
    ]
    return (
      <div className="scratchpad-audio-dock-block scratchpad-audio-dock-block--tempo">
        <span className="scratchpad-audio-dock-block-label">Tempo</span>
        <div className="scratchpad-audio-dock-block-body">
          <ScratchpadAudioMetronomeControls
            icons={icons}
            narrow={true}
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
          <ScratchpadAudioToolbarOverflow items={overflowItems} />
        </div>
      </div>
    )
  }

  return (
    <div className="scratchpad-audio-dock-block scratchpad-audio-dock-block--tempo">
      <span className="scratchpad-audio-dock-block-label">Tempo &amp; Zoom</span>
      <div className="scratchpad-audio-dock-block-body">
        <Form.Control
          size="sm"
          type="number"
          min="20"
          max="300"
          className="scratchpad-audio-dock-tempo-input"
          value={tempo}
          title="Tempo (BPM)"
          onChange={function(e) {
            if (props.onTempoChange) props.onTempoChange(parseFloat(e.target.value) || 120)
          }}
        />
        <span className="small text-muted">BPM</span>
        <ScratchpadAudioMetronomeControls
          icons={icons}
          narrow={false}
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
        <ButtonGroup size="sm">
          <Button variant="outline-secondary" title="Zoom out" onClick={function() { ee && ee.emit('zoomout') }}>
            {icons.zoomout || '−'}
          </Button>
          <Button variant="outline-secondary" title="Zoom in" onClick={function() { ee && ee.emit('zoomin') }}>
            {icons.zoomin || '+'}
          </Button>
        </ButtonGroup>
        <ScratchpadAudioRecordSettings
          tempo={props.tempo}
          countInBars={props.countInBars}
          punchInEnabled={props.punchInEnabled}
          recordMode={props.recordMode}
          onTempoChange={props.onTempoChange}
          onCountInChange={props.onCountInChange}
          rhythmConfig={props.rhythmConfig}
          onRhythmConfigChange={props.onRhythmConfigChange}
          onPunchInChange={props.onPunchInChange}
          onRecordModeChange={props.onRecordModeChange}
          onOpenSettings={props.onOpenSettings}
          snapToGrid={props.snapToGrid}
          onSnapChange={props.onSnapChange}
          advancedFeatures={props.advancedFeatures}
        />
      </div>
    </div>
  )
}

export default function ScratchpadAudioTransportDock(props) {
  return (
    <div className={'scratchpad-audio-transport-dock scratchpad-audio-transport-dock--' + (props.layoutTier || 'wide')}>
      <TransportBlock
        icons={props.icons}
        ee={props.ee}
        isPlaying={props.isPlaying}
        isRecording={props.isRecording}
        armedTrackId={props.armedTrackId}
        currentTime={props.currentTime}
        duration={props.duration}
        formatTime={props.formatTime}
        inputAnalyser={props.inputAnalyser}
        onPlayPause={props.onPlayPause}
        onStop={props.onStop}
        onRecord={props.onRecord}
      />
      <TempoZoomBlock
        icons={props.icons}
        ee={props.ee}
        layoutTier={props.layoutTier}
        tempo={props.tempo}
        countInBars={props.countInBars}
        rhythmConfig={props.rhythmConfig}
        punchInEnabled={props.punchInEnabled}
        recordMode={props.recordMode}
        metronomeEnabled={props.metronomeEnabled}
        metronomeDuringPlayback={props.metronomeDuringPlayback}
        metronomeDuringRecording={props.metronomeDuringRecording}
        onMetronomeEnabledChange={props.onMetronomeEnabledChange}
        onCountInChange={props.onCountInChange}
        onTempoChange={props.onTempoChange}
        onRhythmConfigChange={props.onRhythmConfigChange}
        onMetronomeDuringPlaybackChange={props.onMetronomeDuringPlaybackChange}
        onMetronomeDuringRecordingChange={props.onMetronomeDuringRecordingChange}
        onPunchInChange={props.onPunchInChange}
        onRecordModeChange={props.onRecordModeChange}
        onOpenSettings={props.onOpenSettings}
        onOpenRecordSettings={props.onOpenRecordSettings}
        snapToGrid={props.snapToGrid}
        onSnapChange={props.onSnapChange}
        advancedFeatures={props.advancedFeatures}
      />
    </div>
  )
}
