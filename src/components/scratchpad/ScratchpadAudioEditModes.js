import { Button, ButtonGroup } from 'react-bootstrap'

const MODES = [
  { id: 'cursor', label: 'Seek', state: 'cursor' },
  { id: 'select', label: 'Select', state: 'select' },
  { id: 'shift', label: 'Align', state: 'shift' },
  { id: 'fadein', label: 'Fade in', state: 'fadein' },
  { id: 'fadeout', label: 'Fade out', state: 'fadeout' },
]

export default function ScratchpadAudioEditModes(props) {
  const icons = props.icons || {}
  const mode = props.mode || 'cursor'
  const ee = props.ee

  return (
    <ButtonGroup size="sm">
      {MODES.map(function(m) {
        const active = mode === m.id
        return (
          <Button
            key={m.id}
            variant={active ? 'primary' : 'outline-primary'}
            title={m.label}
            onClick={function() {
              if (props.onModeChange) props.onModeChange(m.id)
              if (ee) ee.emit('statechange', m.state)
            }}
          >
            {m.id === 'cursor' ? (icons.seekmode || 'Seek')
              : m.id === 'select' ? (icons.selectmode || 'Select')
                : m.id === 'shift' ? (icons.dragmode || 'Align')
                  : m.label}
          </Button>
        )
      })}
      {mode === 'select' ? (
        <Button variant="info" title="Trim selection" onClick={function() { ee && ee.emit('trim'); props.onTrim && props.onTrim() }}>
          {icons.trim || icons.cut || 'Trim'}
        </Button>
      ) : null}
    </ButtonGroup>
  )
}
