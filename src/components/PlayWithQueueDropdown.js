import { Button, ButtonGroup, Dropdown } from 'react-bootstrap'
import './PlayWithQueueDropdown.css'

export default function PlayWithQueueDropdown({
  variant = 'compact',
  onPlay,
  onAddToQueue,
  onPlayNext,
  playIcon,
  playVariant,
  isPlaying,
  showQueueMenu = true,
  disabled,
  playLabel,
  testId,
  className,
  addToQueueLabel = 'Add to queue',
  playNextLabel = 'Play next',
  buttonSize,
  onContainerClick,
}) {
  const playButtonVariant = isPlaying ? 'warning' : (playVariant || (variant === 'collection-side' ? 'primary' : 'success'))
  const groupClass = 'play-with-queue-dropdown play-with-queue-dropdown--' + variant + (className ? ' ' + className : '')
  const hasQueueMenu = showQueueMenu && (onAddToQueue || onPlayNext)
  const isListItemPlay = !!(className && className.indexOf('tune-list-item-play') !== -1)
  const resolvedButtonSize = buttonSize != null
    ? buttonSize
    : (variant === 'compact' ? (isListItemPlay ? undefined : 'sm') : undefined)

  function handleContainerClick(event) {
    if (onContainerClick) onContainerClick(event)
  }

  if (!hasQueueMenu) {
    return (
      <Button
        variant={playButtonVariant}
        size={resolvedButtonSize}
        className={groupClass + ' play-with-queue-dropdown-play-only' + (variant === 'collection-side' ? ' books-page-collection-card-side' : ' tune-list-play-btn')}
        title={isPlaying ? 'Now playing' : 'Play'}
        aria-label={isPlaying ? 'Now playing' : 'Play'}
        data-testid={testId}
        disabled={disabled}
        onClick={onPlay}
      >
        {playIcon}
        {playLabel || null}
      </Button>
    )
  }

  return (
    <Dropdown
      as={ButtonGroup}
      className={groupClass}
      onClick={handleContainerClick}
      popperConfig={{ strategy: 'fixed' }}
    >
      <Button
        variant={playButtonVariant}
        size={resolvedButtonSize}
        className={'play-with-queue-dropdown-play' + (variant === 'collection-side' ? ' books-page-collection-card-side' : ' tune-list-play-btn')}
        title={isPlaying ? 'Now playing' : 'Play'}
        aria-label={isPlaying ? 'Now playing' : 'Play'}
        data-testid={testId}
        disabled={disabled}
        onClick={onPlay}
      >
        {playIcon}
        {playLabel || null}
      </Button>
      <Dropdown.Toggle
        split
        variant={playButtonVariant}
        size={resolvedButtonSize}
        className={'play-with-queue-dropdown-toggle' + (variant === 'collection-side' ? ' books-page-collection-card-side' : '')}
        aria-label="Queue options"
        disabled={disabled}
      />
      <Dropdown.Menu align="end">
        {onAddToQueue ? (
          <Dropdown.Item onClick={onAddToQueue}>{addToQueueLabel}</Dropdown.Item>
        ) : null}
        {onPlayNext ? (
          <Dropdown.Item onClick={onPlayNext}>{playNextLabel}</Dropdown.Item>
        ) : null}
      </Dropdown.Menu>
    </Dropdown>
  )
}
