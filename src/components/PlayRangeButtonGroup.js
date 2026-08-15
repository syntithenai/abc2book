import { Button, ButtonGroup } from 'react-bootstrap'
import {
  formatLinkPlayRangeLabel,
  getLinkPlayRangeBoundLabels,
} from '../linkPlaybackRegionScanUtils'
import './PlayRangeButtonGroup.css'

export default function PlayRangeButtonGroup({
  link,
  onClick,
  disabled = false,
  size = 'sm',
  variant = 'primary',
  className,
  buttonClassName,
}) {
  const bounds = getLinkPlayRangeBoundLabels(link)
  const playRangeLabel = formatLinkPlayRangeLabel(link)
  const classes = ['play-range-button-group']
  if (className) classes.push(className)

  return (
    <ButtonGroup
      size={size}
      className={classes.join(' ')}
      aria-label="Play range"
    >
      <Button
        variant="outline-secondary"
        disabled
        className="play-range-button-group-bound"
        title="Play range start"
      >
        {bounds.start}
      </Button>
      <Button
        variant="outline-secondary"
        disabled
        className="play-range-button-group-bound"
        title="Play range end"
      >
        {bounds.end}
      </Button>
      <Button
        variant={variant}
        disabled={disabled}
        className={buttonClassName}
        onClick={onClick}
        aria-label="Play Range"
        title={playRangeLabel ? ('Play Range (' + playRangeLabel + ')') : 'Play Range'}
      >
        Play Range
      </Button>
    </ButtonGroup>
  )
}
