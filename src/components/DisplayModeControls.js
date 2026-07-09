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
 * Structure, Chords, Notation, Lyrics, Info — independent toggles.
 * Empty (all off) is allowed.
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
  } = props;

  function stop(e) {
    if (!stopMenuClose) return;
    e.preventDefault();
    e.stopPropagation();
  }

  function apply(group, action) {
    const next = applyDisplayGroupAction(flags, group, action, available);
    if (onChange) onChange(next);
  }

  const structureOn = !!flags.structure;
  const chordsOn = !!flags.chords;
  const notationOn = flags.notation !== 'off';

  return (
    <div
      className={'display-mode-controls' + (className ? ' ' + className : '')}
      onClick={stopMenuClose ? function(e) { e.stopPropagation(); } : undefined}
    >
      <ButtonGroup size={size || 'sm'} className="display-mode-group">
        {available.structure && (
          <GroupButton
            size={size}
            icon={tunebook.icons.menu}
            label="Structure"
            active={structureOn}
            aria-label={structureOn ? 'Hide structure' : 'Show structure'}
            title={structureOn ? 'Hide structure' : 'Show structure'}
            onMouseDown={stop}
            onClick={function() { apply('structure', 'toggle'); }}
          />
        )}
        {available.chords && (
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
        )}
        {available.notation && (
          <GroupButton
            size={size}
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
            icon={tunebook.icons.question}
            label="Info"
            active={!!flags.info}
            aria-label={flags.info ? 'Hide info' : 'Show info'}
            title={flags.info ? 'Hide info' : 'Show info'}
            onMouseDown={stop}
            onClick={function() { apply('info', 'toggle'); }}
          />
        )}
      </ButtonGroup>
    </div>
  );
}
