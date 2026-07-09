import { useEffect } from 'react'
import { Modal } from 'react-bootstrap'
import { useResponsiveModalProps } from '../useResponsiveModalProps'
import {
  LYRICS_TOOLS_CLOSE_MESSAGE,
  buildLyricsToolsIframeSrc,
} from '../embedFrameUtils'

/**
 * Lyrics tools dialog: embeds the lyrics page without app chrome.
 * Closes on backdrop click, Escape (including from inside the iframe), or the header close button.
 */
export default function LyricsToolsModal(props) {
  const { show, onHide, query } = props
  const responsiveModalProps = useResponsiveModalProps()

  useEffect(function() {
    if (!show) return undefined
    function onMessage(event) {
      if (event.origin !== window.location.origin) return
      if (event.data && event.data.type === LYRICS_TOOLS_CLOSE_MESSAGE) {
        if (onHide) onHide()
      }
    }
    window.addEventListener('message', onMessage)
    return function() {
      window.removeEventListener('message', onMessage)
    }
  }, [show, onHide])

  return (
    <Modal
      show={show}
      onHide={onHide}
      size="xl"
      keyboard={true}
      backdrop={true}
      {...responsiveModalProps}
    >
      <Modal.Header closeButton>
        <Modal.Title>Lyrics Tools</Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ padding: 0 }}>
        {show ? (
          <iframe
            title="Lyrics tools"
            src={buildLyricsToolsIframeSrc(query)}
            style={{ width: '100%', minHeight: '70vh', border: 'none' }}
          />
        ) : null}
      </Modal.Body>
    </Modal>
  )
}
