import { Button, ButtonGroup } from 'react-bootstrap'

export function clampFileViewZoom(scale) {
  const value = parseFloat(scale)
  if (!Number.isFinite(value) || value <= 0) return 1
  return Math.min(4, Math.max(0.5, value))
}

/**
 * Zoom out / reset / zoom in for the active tune File overlay.
 */
export default function FileZoomControls(props) {
  const {
    zoom,
    onChange,
    tunebook,
    size,
    className,
    disabled,
  } = props

  const current = clampFileViewZoom(zoom)

  function bump(delta) {
    if (!onChange) return
    onChange(clampFileViewZoom(current + delta))
  }

  function reset() {
    if (!onChange) return
    onChange(1)
  }

  const icons = tunebook && tunebook.icons ? tunebook.icons : {}

  return (
    <ButtonGroup
      size={size || 'sm'}
      className={'file-zoom-group' + (className ? ' ' + className : '')}
    >
      <Button
        variant="outline-secondary"
        disabled={!!disabled}
        onClick={function() { bump(-0.1) }}
        aria-label="Zoom out file"
        title="Zoom out"
      >
        {icons.zoomout || '−'}
      </Button>
      <Button
        variant="outline-secondary"
        disabled={!!disabled}
        onClick={reset}
        aria-label="Reset file zoom"
        title="Reset zoom"
      >
        1×
      </Button>
      <Button
        variant="outline-secondary"
        disabled={!!disabled}
        onClick={function() { bump(0.1) }}
        aria-label="Zoom in file"
        title="Zoom in"
      >
        {icons.zoomin || '+'}
      </Button>
    </ButtonGroup>
  )
}
