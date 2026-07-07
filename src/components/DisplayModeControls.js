import { Button, ButtonGroup } from 'react-bootstrap';
import { applyDisplayGroupAction } from '../viewModeUtils';

function GroupButton(props) {
  return (
    <Button
      size={props.size || 'sm'}
      variant={props.active ? 'primary' : 'outline-secondary'}
      className={'display-mode-btn' + (props.className ? ' ' + props.className : '')}
      aria-label={props['aria-label'] || props.label}
      title={props.title || props.label}
      aria-pressed={!!props.active}
      onMouseDown={props.onMouseDown}
      onClick={props.onClick}
    >
      {props.icon ? <span className="display-mode-group-icon">{props.icon}</span> : null}
      {props.label ? <span className="display-mode-group-label">{props.label}</span> : null}
    </Button>
  );
}

/**
 * View-mode controls:
 * - Chords: [icon Chords] visibility, [Inline] layout (inline lyrics vs block column)
 * - Notation: [icon Notation] visibility
 * - Lyrics / Info: single labeled toggles
 */
export default function DisplayModeControls(props) {
  const {
    flags,
    available,
    tunebook,
    onChange,
    size,
    className,
    stopMenuClose,
    preferInlineChords,
  } = props;

  function stop(e) {
    if (!stopMenuClose) return;
    e.preventDefault();
    e.stopPropagation();
  }

  function apply(group, action) {
    const next = applyDisplayGroupAction(flags, group, action, available, {
      preferInlineChords: !!preferInlineChords,
    });
    if (onChange) onChange(next);
  }

  const chordsOn = flags.chords !== 'off';
  const notationOn = flags.notation !== 'off';

  return (
    <div
      className={'display-mode-controls' + (className ? ' ' + className : '')}
      onClick={stopMenuClose ? function(e) { e.stopPropagation(); } : undefined}
    >
      {available.chords && (
        <ButtonGroup size={size || 'sm'} className="display-mode-group" aria-label="Chords">
          <GroupButton
            size={size}
            icon={tunebook.icons.guitar}
            label="Chords"
            active={chordsOn}
            aria-label={chordsOn ? 'Hide chords' : 'Show chords'}
            title={chordsOn ? 'Hide chords' : 'Show chords'}
            onMouseDown={stop}
            onClick={function() { apply('chords', 'visibility'); }}
          />
          <GroupButton
            size={size}
            label="Inline"
            active={flags.chords === 'inline'}
            aria-label={flags.chords === 'inline' ? 'Chords in block' : 'Chords inline with lyrics'}
            title={flags.chords === 'inline' ? 'Switch to chord block' : 'Chords inline with lyrics'}
            onMouseDown={stop}
            onClick={function() { apply('chords', 'layout'); }}
          />
        </ButtonGroup>
      )}
      {available.notation && (
        <GroupButton
          size={size}
          className="display-mode-solo-btn"
          icon={tunebook.icons.music}
          label="Notation"
          active={notationOn}
          aria-label={notationOn ? 'Hide notation' : 'Show notation'}
          title={notationOn ? 'Hide notation' : 'Show notation'}
          onMouseDown={stop}
          onClick={function() { apply('notation', 'visibility'); }}
        />
      )}
      {available.lyrics && (
        <GroupButton
          size={size}
          className="display-mode-solo-btn"
          icon={tunebook.icons.quillpen}
          label="Lyrics"
          active={!!flags.lyrics}
          aria-label={flags.lyrics ? 'Hide lyrics' : 'Show lyrics'}
          title={flags.lyrics ? 'Hide lyrics' : 'Show lyrics'}
          onMouseDown={stop}
          onClick={function() { apply('lyrics', 'toggle'); }}
        />
      )}
      {available.info && (
        <GroupButton
          size={size}
          className="display-mode-solo-btn"
          icon={tunebook.icons.question}
          label="Info"
          active={!!flags.info}
          aria-label={flags.info ? 'Hide info' : 'Show info'}
          title={flags.info ? 'Hide info' : 'Show info'}
          onMouseDown={stop}
          onClick={function() { apply('info', 'toggle'); }}
        />
      )}
    </div>
  );
}
