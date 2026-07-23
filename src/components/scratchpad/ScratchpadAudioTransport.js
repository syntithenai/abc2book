import { Button, ButtonGroup } from 'react-bootstrap'

export default function ScratchpadAudioTransport(props) {
  const icons = props.icons || {}
  const ee = props.ee
  const isPlaying = props.isPlaying
  const hideZoom = !!props.hideZoom

  return (
    <div className="scratchpad-audio-transport d-inline-flex align-items-center gap-2">
      <ButtonGroup size="sm">
        {!props.compact ? (
          <Button variant="warning" title="Rewind" onClick={function() { ee && ee.emit('rewind') }}>
            {icons.skipback || '⏮'}
          </Button>
        ) : null}
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
      {!hideZoom ? (
        <ButtonGroup size="sm">
          <Button variant="outline-secondary" title="Zoom in" onClick={function() { ee && ee.emit('zoomin') }}>
            {icons.zoomin || '+'}
          </Button>
          <Button variant="outline-secondary" title="Zoom out" onClick={function() { ee && ee.emit('zoomout') }}>
            {icons.zoomout || '−'}
          </Button>
        </ButtonGroup>
      ) : null}
      {props.currentTime != null && props.duration != null ? (
        <span className="small text-muted scratchpad-audio-transport-time">
          {props.formatTime(props.currentTime)} / {props.formatTime(props.duration)}
        </span>
      ) : null}
    </div>
  )
}
