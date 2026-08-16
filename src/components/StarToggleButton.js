import { useEffect, useState } from 'react'
import { Button } from 'react-bootstrap'

export default function StarToggleButton(props) {
  const tune = props.tune
  const starredFromTune = !!(tune && tune.starred)
  const [starred, setStarred] = useState(starredFromTune)
  const icons = props.tunebook && props.tunebook.icons ? props.tunebook.icons : {}

  useEffect(function() {
    setStarred(starredFromTune)
  }, [starredFromTune])

  function toggle(e) {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    if (!tune || !props.tunebook || typeof props.tunebook.saveTune !== 'function') return
    const nextStarred = !starred
    tune.starred = nextStarred
    setStarred(nextStarred)
    props.tunebook.saveTune(tune)
    if (typeof props.forceRefresh === 'function') props.forceRefresh()
    if (typeof props.onChange === 'function') props.onChange(nextStarred)
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
