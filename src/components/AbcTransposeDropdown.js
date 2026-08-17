import { Button, ButtonGroup, Dropdown, Form } from 'react-bootstrap'

function stopMenuClose(e) {
  if (e && typeof e.stopPropagation === 'function') e.stopPropagation()
}

function stopMenuCloseAndDefault(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault()
  stopMenuClose(e)
}

/**
 * Transpose ABC notation for every voice, plus an optional sounding-pitch
 * preview. Matches the lyrics editor chords dropdown transpose controls.
 */
export default function AbcTransposeDropdown(props) {
  const icons = (props.tunebook && props.tunebook.icons) || {}
  const transposePreview = !!props.transposePreview
  const toggleSize = props.size || undefined

  function toggleTransposePreview(e) {
    stopMenuClose(e)
    if (typeof props.onTransposePreviewChange === 'function') {
      props.onTransposePreviewChange(!transposePreview)
    }
  }

  return (
    <Dropdown autoClose="outside">
      <Dropdown.Toggle
        variant="warning"
        size={toggleSize}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35em' }}
        title="Transpose ABC notation for all voices, or preview the song transpose setting"
        data-testid="abc-transpose-actions"
      >
        {icons.music}
        Transpose
      </Dropdown.Toggle>
      <Dropdown.Menu>
        <Dropdown.ItemText
          className="lyrics-chords-transpose abc-transpose"
          data-testid="abc-transpose"
          onMouseDown={stopMenuClose}
          onClick={stopMenuClose}
        >
          <span className="lyrics-chords-transpose-label">Transpose</span>
          <ButtonGroup size="sm" className="lyrics-chords-transpose-group">
            <Button
              type="button"
              variant="outline-secondary"
              data-testid="abc-transpose-down"
              aria-label="Transpose notation down"
              title="Transpose ABC notation down a semitone for all voices"
              onMouseDown={stopMenuClose}
              onClick={function(e) {
                stopMenuCloseAndDefault(e)
                if (typeof props.onTransposeAbc === 'function') props.onTransposeAbc(-1)
              }}
            >
              −
            </Button>
            <Button
              type="button"
              variant="outline-secondary"
              data-testid="abc-transpose-up"
              aria-label="Transpose notation up"
              title="Transpose ABC notation up a semitone for all voices"
              onMouseDown={stopMenuClose}
              onClick={function(e) {
                stopMenuCloseAndDefault(e)
                if (typeof props.onTransposeAbc === 'function') props.onTransposeAbc(1)
              }}
            >
              +
            </Button>
          </ButtonGroup>
        </Dropdown.ItemText>
        <Dropdown.ItemText
          as="button"
          type="button"
          className="lyrics-chords-transpose-preview abc-transpose-preview"
          data-testid="abc-transpose-preview"
          aria-pressed={transposePreview}
          title="Show the ABC preview using the song transpose setting without rewriting the notation"
          onMouseDown={stopMenuClose}
          onClick={toggleTransposePreview}
        >
          <span className="lyrics-chords-transpose-label" id="abc-transpose-preview-label">
            Transpose preview
          </span>
          <Form.Check
            type="switch"
            id="abc-transpose-preview-switch"
            aria-labelledby="abc-transpose-preview-label"
            tabIndex={-1}
            checked={transposePreview}
            onChange={function() {}}
            className="lyrics-chords-transpose-preview-switch"
          />
        </Dropdown.ItemText>
      </Dropdown.Menu>
    </Dropdown>
  )
}
