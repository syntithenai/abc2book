import { ButtonGroup, Dropdown } from 'react-bootstrap'

export default function ScratchpadAudioExportGroup(props) {
  const isSaving = !!props.isSaving

  return (
    <Dropdown as={ButtonGroup} size="sm" className="scratchpad-audio-export-dropdown">
      <Dropdown.Toggle variant="outline-secondary">Export</Dropdown.Toggle>
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
