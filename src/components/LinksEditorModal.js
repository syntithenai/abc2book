import {useState, useEffect, useRef} from 'react'
import {Button, Modal, Badge} from 'react-bootstrap'
import LinksEditor from './LinksEditor'
import { useResponsiveModalProps } from '../useResponsiveModalProps'

function snapshotTune(sourceTune) {
  return sourceTune
    ? Object.assign({}, sourceTune, {
        links: Array.isArray(sourceTune.links)
          ? sourceTune.links.map(function(link) { return Object.assign({}, link) })
          : [],
      })
    : null
}

function sessionFromTune(sourceTune) {
  const snapshot = snapshotTune(sourceTune)
  if (!snapshot || !snapshot.id) return null
  return { id: snapshot.id, tune: snapshot }
}

function applySessionTuneUpdate(session, updated) {
  if (!session || !session.id) return session
  const nextTune = Object.assign({}, session.tune, {
    links: Array.isArray(updated && updated.links) ? updated.links : session.tune.links,
  })
  if (updated && updated.mediaCacheLocked !== undefined) {
    nextTune.mediaCacheLocked = updated.mediaCacheLocked
  }
  nextTune.id = session.id
  return { id: session.id, tune: nextTune }
}

export default function LinksEditorModal(props) {
  var {tunebook, tune, onChange} = props
  const isControlled = typeof props.show === 'boolean'
  const [internalShow, setInternalShow] = useState(false)
  const visible = isControlled ? props.show : internalShow
  const responsiveModalProps = useResponsiveModalProps();
  var [links, setLinks] = useState(props.tune && Array.isArray(props.tune.links) ? JSON.stringify(props.tune.links) : '[]')
  const [session, setSession] = useState(null)
  const linksRef = useRef(links)
  const sessionIdRef = useRef(null)
  linksRef.current = links

  function setVisible(next) {
    if (isControlled) {
      if (props.onShowChange) props.onShowChange(next)
      return
    }
    setInternalShow(next)
  }

  if (visible && !session && tune) {
    const nextSession = sessionFromTune(tune)
    if (nextSession) {
      sessionIdRef.current = nextSession.id
      setSession(nextSession)
      setLinks(JSON.stringify(Array.isArray(nextSession.tune.links) ? nextSession.tune.links : []))
    }
  }
  if (!visible && session) {
    sessionIdRef.current = null
    setSession(null)
  }

  const handleClose = () => {
      const targetId = sessionIdRef.current || (session && session.id)
      let parsedLinks = []
      try {
        parsedLinks = JSON.parse(linksRef.current)
      } catch (e) {
        parsedLinks = []
      }
      setVisible(false);
      if (!targetId || !onChange) return
      onChange(parsedLinks, targetId)
  }
  const handleShow = () => {
      const nextSession = sessionFromTune(props.tune)
      if (nextSession) {
        sessionIdRef.current = nextSession.id
        setSession(nextSession)
        setLinks(JSON.stringify(Array.isArray(nextSession.tune.links) ? nextSession.tune.links : []))
      }
      setVisible(true);
  }

  useEffect(function() {
    if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(visible)
    return function() {
      if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(false)
    }
  }, [visible, props.setBlockKeyboardShortcuts]);

  useEffect(function() {
    if (!visible) {
      setLinks(props.tune && Array.isArray(props.tune.links) ? JSON.stringify(props.tune.links) : '[]')
    }
  },[props.tune, visible])

  const activeTune = (visible && session && session.tune) ? session.tune : tune
  const activeTuneId = (visible && (sessionIdRef.current || (session && session.id)))
    || (activeTune && activeTune.id)
    || null
  const linkCount = (function() {
    try {
      return JSON.parse(links).length
    } catch (e) {
      return 0
    }
  })()

  return (
    <>
      {!props.hideTrigger ? (
        <Button className="tune-meta-modal-btn" aria-label="Media" variant="warning" onClick={handleShow}><span aria-hidden="true" className="tune-meta-modal-icon">{tunebook.icons.link} </span><Badge bg="secondary" className="tune-meta-modal-badge" >{linkCount}</Badge></Button>
      ) : null}

      <Modal
        show={visible}
        onHide={handleClose}
        size="xl"
        dialogClassName="links-editor-modal-dialog"
        {...responsiveModalProps}
      >
        <Modal.Header closeButton>
          <Modal.Title>Media{activeTune && activeTune.name ? ' — ' + activeTune.name : ''}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
            <div  >
                <LinksEditor
                    isOpen={visible}
                    mediaController={props.mediaController}
                    onChange={function(nextLinks) {
                        setLinks(JSON.stringify(nextLinks))
                    }}
                    tunebook={tunebook}
                    links={JSON.parse(links)}
                    tune={activeTune}
                    tuneId={activeTuneId}
                    handleClose={handleClose}
                    token={props.token}
                    user={props.user}
                    googleDocumentId={props.googleDocumentId}
                    forceRefresh={props.forceRefresh}
                    login={props.login}
                    onTuneChange={function(updated) {
                        const nextSession = applySessionTuneUpdate(session || sessionFromTune(activeTune), updated)
                        if (!nextSession) return
                        sessionIdRef.current = nextSession.id
                        setSession(nextSession)
                        setLinks(JSON.stringify(Array.isArray(nextSession.tune.links) ? nextSession.tune.links : []))
                        if (typeof props.onTuneChange === 'function') {
                            props.onTuneChange(nextSession.tune)
                        }
                    }}
                />
            </div>
         
        </Modal.Body>
        
      </Modal>
    </>
  );
}
