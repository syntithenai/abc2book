import { Button } from 'react-bootstrap'
import { capitalizeSongTitle, isSongTitleCapitalized } from '../titleCaseUtils'

/**
 * Button that title-cases the current title value.
 * Disabled when empty or already capitalized.
 */
export default function CapitalizeTitleButton(props) {
  const value = props.value
  const empty = !String(value == null ? '' : value).trim()
  const alreadyDone = !empty && isSongTitleCapitalized(value)
  const disabled = empty || alreadyDone || !!props.disabled
  const style = Object.assign({
    color: 'black',
    fontFamily: 'Helvetica, Arial, sans-serif',
    fontWeight: 500,
    lineHeight: 1,
    minWidth: '2.25em',
  }, props.buttonStyle || {})
  const title = empty
    ? 'Enter a title first'
    : alreadyDone
      ? 'Title is already capitalised'
      : 'Capitalise title'

  return (
    <Button
      type="button"
      variant="outline-secondary"
      size="sm"
      style={style}
      disabled={disabled}
      title={title}
      aria-label={title}
      onClick={function() {
        if (disabled || typeof props.onCapitalize !== 'function') return
        props.onCapitalize(capitalizeSongTitle(value))
      }}
    >
      aA
    </Button>
  )
}
