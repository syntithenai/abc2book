import { Button, ButtonGroup, Form } from 'react-bootstrap'

export default function ScratchpadAudioTransport(props) {
  const icons = props.icons || {}
  const ee = props.ee
  const isPlaying = props.isPlaying
  const isRecording = props.isRecording
  const tempo = props.tempo
  const countInBars = props.countInBars
  const punchInEnabled = props.punchInEnabled
  const recordMode = props.recordMode
  const armedTrackId = props.armedTrackId

  return (
    <div className="scratchpad-audio-transport d-flex flex-wrap align-items-center gap-2">
      <ButtonGroup size="sm">
        <Button variant="warning" title="Rewind" onClick={function() { ee && ee.emit('rewind') }}>
          {icons.skipback || '⏮'}
        </Button>
        <Button
          variant="success"
          title={isPlaying ? 'Pause' : 'Play'}
          onClick={props.onPlayPause}
        >
          {isPlaying ? (icons.pause || 'Pause') : (icons.play || 'Play')}
        </Button>
        <Button variant="danger" title="Stop" onClick={function() { ee && ee.emit('stop'); props.onStop && props.onStop() }}>
          {icons.stop || 'Stop'}
        </Button>
      </ButtonGroup>
      <ButtonGroup size="sm">
        <Button variant="outline-secondary" onClick={function() { ee && ee.emit('zoomin') }}>
          {icons.zoomin || '+'}
        </Button>
        <Button variant="outline-secondary" onClick={function() { ee && ee.emit('zoomout') }}>
          {icons.zoomout || '−'}
        </Button>
      </ButtonGroup>
      <ButtonGroup size="sm">
        <Button
          variant={isRecording ? 'danger' : 'outline-danger'}
          title="Record on armed track"
          disabled={!armedTrackId}
          onClick={props.onRecord}
        >
          {icons.record || icons.mic || 'Record'}
        </Button>
      </ButtonGroup>
      <Form inline className="d-flex align-items-center gap-2 mb-0">
        <Form.Label className="mb-0 small">Tempo</Form.Label>
        <Form.Control
          size="sm"
          type="number"
          min="20"
          max="300"
          style={{ width: '4.5rem' }}
          value={tempo}
          onChange={function(e) { props.onTempoChange && props.onTempoChange(parseFloat(e.target.value) || 120) }}
        />
        <Form.Label className="mb-0 small">Count-in</Form.Label>
        <Form.Control
          size="sm"
          as="select"
          style={{ width: '4rem' }}
          value={countInBars}
          onChange={function(e) { props.onCountInChange && props.onCountInChange(parseInt(e.target.value, 10) || 0) }}
        >
          <option value="0">Off</option>
          <option value="1">1 bar</option>
          <option value="2">2 bars</option>
          <option value="4">4 bars</option>
        </Form.Control>
        <Form.Check
          type="checkbox"
          className="mb-0 small"
          label="Punch-in"
          checked={!!punchInEnabled}
          onChange={function(e) { props.onPunchInChange && props.onPunchInChange(e.target.checked) }}
        />
        <Form.Control
          size="sm"
          as="select"
          style={{ width: '7rem' }}
          value={recordMode || 'newTake'}
          onChange={function(e) { props.onRecordModeChange && props.onRecordModeChange(e.target.value) }}
        >
          <option value="newTake">New take</option>
          <option value="replace">Replace take</option>
        </Form.Control>
      </Form>
      {props.currentTime != null && props.duration != null ? (
        <span className="small text-muted">
          {props.formatTime(props.currentTime)} / {props.formatTime(props.duration)}
        </span>
      ) : null}
    </div>
  )
}
