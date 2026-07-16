import { Button } from 'react-bootstrap'

export default function StarToggleButton(props) {
  const tune = props.tune
  const starred = !!(tune && tune.starred)
  const icons = props.tunebook && props.tunebook.icons ? props.tunebook.icons : {}

  function toggle(e) {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    if (!tune || !props.tunebook || typeof props.tunebook.saveTune !== 'function') return
    tune.starred = !starred
    props.tunebook.saveTune(tune)
    if (typeof props.forceRefresh === 'function') props.forceRefresh()
    if (typeof props.onChange === 'function') props.onChange(!!tune.starred)
  }

  return (
    <Button
      type="button"
      className={props.className || 'tune-star-toggle-btn'}
      variant={starred ? 'warning' : (props.variant || 'secondary')}
      size={props.size}
      aria-label={starred ? 'Unstar tune' : 'Star tune'}
      aria-pressed={starred}
      title={starred ? 'Unstar' : 'Star'}
      onClick={toggle}
    >
      <span className={'tune-star-toggle-icon' + (starred ? ' tune-star-toggle-icon--on' : '')}>
        {starred ? (icons.starfilled || icons.star) : icons.star}
      </span>
    </Button>
  )
}
