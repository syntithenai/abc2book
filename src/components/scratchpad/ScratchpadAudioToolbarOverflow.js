import { Dropdown } from 'react-bootstrap'

export default function ScratchpadAudioToolbarOverflow(props) {
  return (
    <Dropdown className="scratchpad-audio-toolbar-overflow">
      <Dropdown.Toggle variant="outline-secondary" size="sm">More</Dropdown.Toggle>
      <Dropdown.Menu>
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
