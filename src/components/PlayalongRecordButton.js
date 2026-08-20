import { Button, ButtonGroup } from 'react-bootstrap'
import './PlayalongCompareOverlay.css'

export default function PlayalongRecordButton(props) {
  const {
    tunebook,
    isRecording,
    isWaiting,
    onTogglePianoRoll,
    onOpenConfig,
    disabled,
    hasTakes,
    pianoRollVisible,
  } = props
  const icons = tunebook && tunebook.icons ? tunebook.icons : {}
  const showWaiting = !!(pianoRollVisible && isWaiting && !isRecording)
  const toggleLabel = showWaiting
    ? 'Processing play-along recording'
    : (!hasTakes
      ? 'Record play-along'
      : (pianoRollVisible ? 'Hide piano roll' : 'Show piano roll'))
  const variant = pianoRollVisible ? 'success' : 'outline-secondary'

  function handleIconClick(e) {
    e.preventDefault()
    e.stopPropagation()
    if (disabled) return
    if (isRecording) return
    if (!hasTakes) {
      if (onOpenConfig) onOpenConfig()
      return
    }
    if (onTogglePianoRoll) onTogglePianoRoll(!pianoRollVisible)
  }

  function handleConfigClick(e) {
    e.preventDefault()
    e.stopPropagation()
    if (disabled) return
    if (onOpenConfig) onOpenConfig()
  }

  return (
    <ButtonGroup size={props.size || 'sm'} className="playalong-record-group">
      <Button
        size={props.size || 'sm'}
        variant={variant}
        className={'playalong-record-btn' + (props.className ? ' ' + props.className : '')}
        aria-label={toggleLabel}
        title={toggleLabel}
        aria-pressed={hasTakes ? !!pianoRollVisible : undefined}
        disabled={!!disabled}
        aria-busy={showWaiting ? 'true' : undefined}
        data-testid="playalong-record-button"
        onClick={handleIconClick}
      >
        <span
          className={'playalong-record-btn-icon' + (showWaiting ? ' is-waiting' : '')}
          aria-hidden="true"
        >
          {showWaiting
            ? (icons.waiting || '…')
            : (icons.pianoroll || icons.recordcircle || '▤')}
        </span>
      </Button>
      <Button
        variant={pianoRollVisible ? 'success' : 'secondary'}
        className="playalong-record-config-btn dropdown-toggle"
        aria-label="Record play-along settings"
        title="Record play-along settings"
        data-testid="playalong-record-config"
        disabled={!!disabled}
        onClick={handleConfigClick}
      />
    </ButtonGroup>
  )
}
