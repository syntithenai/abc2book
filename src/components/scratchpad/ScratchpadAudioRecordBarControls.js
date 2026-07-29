import { Button, ButtonGroup } from 'react-bootstrap'

function transportGlyph(icons, key, shortLabel) {
  return icons[key] || shortLabel
}

export default function ScratchpadAudioRecordBarControls(props) {
  const icons = props.icons || {}
  const punchIn = !!props.punchInEnabled
  const recordMode = props.recordMode || 'newTake'
  const snap = !!props.snapToGrid

  return (
    <>
      <ButtonGroup size="sm" className="scratchpad-audio-transport-controls">
        <Button
          variant={punchIn ? 'primary' : 'outline-secondary'}
          title="Punch-in: record into the selection only"
          aria-pressed={punchIn}
          onClick={function() {
            if (props.onPunchInChange) props.onPunchInChange(!punchIn)
          }}
        >
          Punch
        </Button>
        <Button
          variant={recordMode === 'replace' ? 'primary' : 'outline-secondary'}
          title="Toggle record mode"
          onClick={function() {
            if (props.onRecordModeChange) {
              props.onRecordModeChange(recordMode === 'replace' ? 'newTake' : 'replace')
            }
          }}
        >
          {recordMode === 'replace' ? 'Replace' : 'New'}
        </Button>
        <Button
          variant={snap ? 'primary' : 'outline-secondary'}
          title="Snap clips to grid when moving"
          aria-pressed={snap}
          onClick={function() {
            if (props.onSnapChange) props.onSnapChange(!snap)
          }}
        >
          Snap
        </Button>
      </ButtonGroup>
      <Button
        variant="outline-secondary"
        size="sm"
        className="scratchpad-audio-transport-controls"
        title="Audio settings"
        aria-label="Audio settings"
        onClick={props.onOpenSettings}
      >
        {transportGlyph(icons, 'settings', 'Audio')}
      </Button>
    </>
  )
}
