import { Button, ButtonGroup, Dropdown, Form } from 'react-bootstrap'

function stopMenuClose(e) {
  if (e && typeof e.stopPropagation === 'function') e.stopPropagation()
}

function stopMenuCloseAndDefault(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault()
  stopMenuClose(e)
}

/**
 * Warning-colored lyrics chord actions: strip lyric-embedded chords, copy
 * notation chords into lyrics as ChordPro, or transpose chords in the lyric
 * text without changing the tune transpose setting.
 */
export default function LyricsChordsActionsDropdown(props) {
  const icons = (props.tunebook && props.tunebook.icons) || {}
  const transposePreview = !!props.transposePreview

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
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35em' }}
        title="Remove lyric chords, copy chords from notation, or transpose chords in the lyrics"
        data-testid="lyrics-chords-actions"
      >
        {icons.eraser}
        Chords
      </Dropdown.Toggle>
      <Dropdown.Menu>
        <Dropdown.Item
          as="button"
          type="button"
          data-testid="lyrics-chords-remove-chords"
          onClick={props.onRemoveChords}
        >
          Remove chords
        </Dropdown.Item>
        <Dropdown.Item
          as="button"
          type="button"
          data-testid="lyrics-chords-from-notation"
          onClick={props.onChordsFromNotation}
        >
          Chords from notation
        </Dropdown.Item>
        <Dropdown.ItemText
          className="lyrics-chords-transpose"
          data-testid="lyrics-chords-transpose"
          onMouseDown={stopMenuClose}
          onClick={stopMenuClose}
        >
          <span className="lyrics-chords-transpose-label">Transpose</span>
          <ButtonGroup size="sm" className="lyrics-chords-transpose-group">
            <Button
              type="button"
              variant="outline-secondary"
              data-testid="lyrics-chords-transpose-down"
              aria-label="Transpose lyric chords down"
              title="Transpose chords in the lyrics down a semitone"
              onMouseDown={stopMenuClose}
              onClick={function(e) {
                stopMenuCloseAndDefault(e)
                if (typeof props.onTransposeLyrics === 'function') props.onTransposeLyrics(-1)
              }}
            >
              −
            </Button>
            <Button
              type="button"
              variant="outline-secondary"
              data-testid="lyrics-chords-transpose-up"
              aria-label="Transpose lyric chords up"
              title="Transpose chords in the lyrics up a semitone"
              onMouseDown={stopMenuClose}
              onClick={function(e) {
                stopMenuCloseAndDefault(e)
                if (typeof props.onTransposeLyrics === 'function') props.onTransposeLyrics(1)
              }}
            >
              +
            </Button>
          </ButtonGroup>
        </Dropdown.ItemText>
        <Dropdown.ItemText
          as="button"
          type="button"
          className="lyrics-chords-transpose-preview"
          data-testid="lyrics-chords-transpose-preview"
          aria-pressed={transposePreview}
          title="Show lyrics preview and structure chords using the song transpose and capo settings"
          onMouseDown={stopMenuClose}
          onClick={toggleTransposePreview}
        >
          <span className="lyrics-chords-transpose-label" id="lyrics-chords-transpose-preview-label">
            Transpose preview
          </span>
          <Form.Check
            type="switch"
            id="lyrics-chords-transpose-preview-switch"
            aria-labelledby="lyrics-chords-transpose-preview-label"
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
