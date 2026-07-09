import { Button, ButtonGroup } from 'react-bootstrap';
import { clampGigZoom } from '../gigDisplaySettings';

/**
 * Lyrics-only font size controls (A− / A+).
 * Does not affect notation or structure auto-fit.
 */
export default function LyricsZoomControls(props) {
  const {
    zoom,
    onChange,
    size,
    className,
    disabled,
  } = props;

  const current = clampGigZoom(zoom > 0 ? zoom : 1.2);

  function bump(delta) {
    if (!onChange) return;
    onChange(clampGigZoom(current + delta));
  }

  return (
    <ButtonGroup
      size={size || 'sm'}
      className={'lyrics-zoom-group' + (className ? ' ' + className : '')}
    >
      <Button
        variant="outline-secondary"
        disabled={!!disabled}
        onClick={function() { bump(-0.1); }}
        aria-label="Smaller lyrics"
        title="Smaller lyrics"
      >
        A−
      </Button>
      <Button
        variant="outline-secondary"
        disabled={!!disabled}
        onClick={function() { bump(0.1); }}
        aria-label="Larger lyrics"
        title="Larger lyrics"
      >
        A+
      </Button>
    </ButtonGroup>
  );
}
