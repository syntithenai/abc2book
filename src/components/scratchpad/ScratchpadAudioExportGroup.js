import { ButtonGroup, Dropdown } from 'react-bootstrap'

export default function ScratchpadAudioExportGroup(props) {
  const isSaving = !!props.isSaving

  const toggleClass = props.menuBar ? 'scratchpad-audio-menu-bar-toggle' : undefined
  const toggleVariant = props.menuBar ? 'link' : 'outline-secondary'

  return (
    <Dropdown
      as={ButtonGroup}
      size="sm"
      className={'scratchpad-audio-export-dropdown' + (props.menuBar ? ' scratchpad-audio-menu-bar-item' : '')}
    >
      <Dropdown.Toggle variant={toggleVariant} className={toggleClass}>Export</Dropdown.Toggle>
      <Dropdown.Menu>
        <Dropdown.Item onClick={function() { props.onMix && props.onMix() }} disabled={isSaving}>
          {isSaving ? 'Mixing…' : 'Mix and save'}
        </Dropdown.Item>
        <Dropdown.Item onClick={function() { props.onDownload && props.onDownload() }}>
          Export…
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  )
}
