import { ButtonGroup, Dropdown } from 'react-bootstrap'
import { shortcutLabel } from '../../useScratchpadAudioShortcuts'

const MODES = [
  { id: 'cursor', label: 'Seek', state: 'cursor' },
  { id: 'select', label: 'Select', state: 'select' },
  { id: 'shift', label: 'Align', state: 'shift' },
  { id: 'fadein', label: 'Fade in', state: 'fadein' },
  { id: 'fadeout', label: 'Fade out', state: 'fadeout' },
]

function modeLabel(mode, icons) {
  if (mode.id === 'cursor') return icons.seekmode || 'Seek'
  if (mode.id === 'select') return icons.selectmode || 'Select'
  if (mode.id === 'shift') return icons.dragmode || 'Align'
  return mode.label
}

function item(label, handler, bindingId) {
  const bindings = {
    trim: { key: 't', ctrl: true },
    silence: { key: 'l', ctrl: true },
    reverse: null,
    split: { key: 'i', ctrl: true },
    cut: { key: 'x', ctrl: true },
    copy: { key: 'c', ctrl: true },
    paste: { key: 'v', ctrl: true },
    delete: { key: 'k', ctrl: true },
  }
  const b = bindingId ? bindings[bindingId] : null
  const suffix = b ? '  ' + shortcutLabel(b) : ''
  return { label: label + suffix, onClick: handler }
}

export default function ScratchpadAudioEditModes(props) {
  const icons = props.icons || {}
  const mode = props.mode || 'cursor'
  const ee = props.ee
  const hasSelection = props.hasSelection

  function selectMode(modeId, state) {
    if (props.onModeChange) props.onModeChange(modeId)
    if (ee) ee.emit('statechange', state)
  }

  const activeMode = MODES.find(function(m) { return m.id === mode }) || MODES[0]

  const toggleClass = props.menuBar ? 'scratchpad-audio-menu-bar-toggle' : undefined
  const toggleVariant = props.menuBar ? 'link' : 'outline-primary'

  return (
    <Dropdown
      as={ButtonGroup}
      size="sm"
      className={'scratchpad-audio-edit-dropdown' + (props.menuBar ? ' scratchpad-audio-menu-bar-item' : '')}
    >
      <Dropdown.Toggle variant={toggleVariant} className={toggleClass}>
        {props.menuBar ? 'Edit' : ('Edit: ' + activeMode.label)}
      </Dropdown.Toggle>
      <Dropdown.Menu>
        {MODES.map(function(m) {
          return (
            <Dropdown.Item
              key={m.id}
              active={mode === m.id}
              onClick={function() { selectMode(m.id, m.state) }}
            >
              {modeLabel(m, icons)}
            </Dropdown.Item>
          )
        })}
        <Dropdown.Divider />
        <Dropdown.Header>Insert</Dropdown.Header>
        <Dropdown.Item onClick={props.onInsertAudio}>Insert audio…</Dropdown.Item>
        <Dropdown.Divider />
        <Dropdown.Header>Clipboard</Dropdown.Header>
        <Dropdown.Item disabled={!hasSelection} onClick={props.onCut}>{item('Cut', props.onCut, 'cut').label}</Dropdown.Item>
        <Dropdown.Item disabled={!hasSelection} onClick={props.onCopy}>{item('Copy', props.onCopy, 'copy').label}</Dropdown.Item>
        <Dropdown.Item disabled={!props.canPaste} onClick={props.onPaste}>{item('Paste', props.onPaste, 'paste').label}</Dropdown.Item>
        <Dropdown.Item disabled={!hasSelection} onClick={props.onDelete}>{item('Delete', props.onDelete, 'delete').label}</Dropdown.Item>
        <Dropdown.Divider />
        <Dropdown.Header>Transform</Dropdown.Header>
        <Dropdown.Item disabled={!hasSelection} onClick={props.onTrim}>{item('Trim selection', props.onTrim, 'trim').label}</Dropdown.Item>
        <Dropdown.Item disabled={!hasSelection} onClick={props.onSilence}>{item('Silence', props.onSilence, 'silence').label}</Dropdown.Item>
        <Dropdown.Item disabled={!hasSelection} onClick={props.onReverse}>Reverse</Dropdown.Item>
        <Dropdown.Item disabled={!hasSelection} onClick={props.onInvert}>Invert</Dropdown.Item>
        <Dropdown.Item onClick={props.onSplit}>{item('Split at playhead', props.onSplit, 'split').label}</Dropdown.Item>
        <Dropdown.Divider />
        <Dropdown.Header>Align</Dropdown.Header>
        <Dropdown.Item onClick={props.onAlignStart}>Start to playhead</Dropdown.Item>
        <Dropdown.Item onClick={props.onAlignEnd}>End to playhead</Dropdown.Item>
        <Dropdown.Item onClick={props.onAlignTogether}>Align together</Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  )
}
