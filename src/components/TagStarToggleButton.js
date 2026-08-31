import { useEffect, useState } from 'react'
import { Button } from 'react-bootstrap'
import { isTagStarred, setTagStarred } from '../starredTagsStore'

export default function TagStarToggleButton(props) {
  const tag = props.tag
  const starredFromStore = isTagStarred(tag)
  const [starred, setStarred] = useState(starredFromStore)
  const icons = props.tunebook && props.tunebook.icons ? props.tunebook.icons : {}

  useEffect(function() {
    setStarred(isTagStarred(tag))
  }, [tag, props.refreshKey])

  function toggle(e) {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    if (!tag) return
    const nextStarred = !starred
    setTagStarred(tag, nextStarred)
    setStarred(nextStarred)
    if (typeof props.onChange === 'function') props.onChange(nextStarred, tag)
  }

  return (
    <Button
      type="button"
      className={props.className || 'tag-star-toggle-btn'}
      variant={starred ? 'warning' : (props.variant || 'secondary')}
      size={props.size}
      aria-label={starred ? 'Unstar tag' : 'Star tag'}
      aria-pressed={starred}
      title={starred ? 'Unstar tag' : 'Star tag'}
      onClick={toggle}
    >
      <span className={'tune-star-toggle-icon' + (starred ? ' tune-star-toggle-icon--on' : '')}>
        {starred ? (icons.starfilled || icons.star) : icons.star}
      </span>
    </Button>
  )
}
