import { useState } from 'react'
import { Button } from 'react-bootstrap'
import { toast } from 'react-toastify'
import { hasUsableContour } from '../searchSimilarMelodies'
import FindSimilarMelodiesModal from './FindSimilarMelodiesModal'

/**
 * Pencil-menu control: open similar-melody search for the current tune.
 */
export default function TuneFindSimilarButton({
  tune,
  tunebook,
  tunes,
  token,
  className,
  toggleClassName,
  toggleLabel,
  labelClassName,
  hideLabel,
  onOpen,
}) {
  const [show, setShow] = useState(false)
  const icons = tunebook && tunebook.icons ? tunebook.icons : null
  const abcTools = tunebook && tunebook.abcTools
  const queryAbc = tune && abcTools && typeof abcTools.json2abc === 'function'
    ? String(abcTools.json2abc(tune) || '').trim()
    : ''
  const canSearch = !!(tune && tune.id && queryAbc && hasUsableContour(queryAbc))
  const label = toggleLabel != null ? toggleLabel : ' Find Similar'
  const wrapClass = className || 'tune-find-similar'
  const btnClass = toggleClassName || 'music-actions-menu-btn'

  function handleOpen(e) {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    if (!canSearch) {
      toast.info('Need notation with a melody to find similar tunes.')
      return
    }
    setShow(true)
    if (typeof onOpen === 'function') onOpen()
  }

  return (
    <span className={wrapClass} data-testid="tune-find-similar">
      <Button
        type="button"
        variant="info"
        className={btnClass + ' btn-info'}
        title="Find similar melodies"
        aria-label="Find Similar"
        disabled={!tune || !tune.id}
        onClick={handleOpen}
      >
        {icons && icons.search ? icons.search : null}
        {!hideLabel ? (
          <span className={labelClassName || 'music-actions-menu-btn-label'}>{label}</span>
        ) : null}
      </Button>
      <FindSimilarMelodiesModal
        show={show}
        onHide={function() { setShow(false) }}
        tune={tune}
        tunebook={tunebook}
        tunes={tunes}
        token={token}
      />
    </span>
  )
}
