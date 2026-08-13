import { useEffect, useMemo } from 'react'
import { Button, Modal } from 'react-bootstrap'
import { useResponsiveModalProps } from '../useResponsiveModalProps'
import { resolveResolverAccessToken } from '../resolverAccessToken'
import {
  LYRICS_TOOLS_CLOSE_MESSAGE,
  buildLyricsToolsIframeSrc,
} from '../embedFrameUtils'

/**
 * Lyrics tools dialog: embeds the lyrics page without app chrome.
 * Closes on backdrop click, Escape (including from inside the iframe),
 * the header close control, or the footer Close button.
 *
 * Remounts the iframe when auth becomes available so a login completed in the
 * parent window reloads tools with a token and re-runs the embedded search.
 */
export default function LyricsToolsModal(props) {
  const { show, onHide, query } = props
  const responsiveModalProps = useResponsiveModalProps()
  const authKey = useMemo(function() {
    return resolveResolverAccessToken(props.token) ? 'in' : 'out'
  }, [props.token])

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
            key={authKey + ':' + String(query || '')}
            title="Lyrics tools"
            src={buildLyricsToolsIframeSrc(query)}
            style={{ width: '100%', minHeight: '70vh', border: 'none' }}
          />
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  )
}
