import { Dropdown } from 'react-bootstrap'
import { SCRATCHPAD_DROPDOWN_POPPER } from '../../scratchpadDropdownPopper'

export default function ScratchpadAudioToolbarOverflow(props) {
  return (
    <Dropdown className="scratchpad-audio-toolbar-overflow">
      <Dropdown.Toggle variant="outline-secondary" size="sm">More</Dropdown.Toggle>
      <Dropdown.Menu popperConfig={SCRATCHPAD_DROPDOWN_POPPER}>
        {props.items.map(function(item) {
          if (item.divider) return <Dropdown.Divider key={item.key} />
          return (
            <Dropdown.Item key={item.key} disabled={item.disabled} onClick={item.onClick}>
              {item.label}
            </Dropdown.Item>
          )
        })}
      </Dropdown.Menu>
    </Dropdown>
  )
}
