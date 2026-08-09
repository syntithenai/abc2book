import {useState, useEffect, useRef} from 'react'
import {Button, Modal, Badge} from 'react-bootstrap'
import LinksEditor from './LinksEditor'
import { useResponsiveModalProps } from '../useResponsiveModalProps'


export default function LinksEditorModal(props) {
    var {tunebook, tune, onChange} = props
  const isControlled = typeof props.show === 'boolean'
  const [internalShow, setInternalShow] = useState(false)
  const visible = isControlled ? props.show : internalShow
  const responsiveModalProps = useResponsiveModalProps();
  var [links, setLinks] = useState(props.tune && Array.isArray(props.tune.links) ? JSON.stringify(props.tune.links) : '[]')
  // Freeze the tune for the whole edit session so navigation while the modal is
  // open cannot apply these links to a different tune on close (or via auto-scan).
  const [editingTune, setEditingTune] = useState(null)
  const linksRef = useRef(links)
  const openedSessionRef = useRef(false)
  linksRef.current = links

  function setVisible(next) {
    if (isControlled) {
      if (props.onShowChange) props.onShowChange(next)
      return
    }
    setInternalShow(next)
  }

  function snapshotTune(sourceTune) {
    return sourceTune
      ? Object.assign({}, sourceTune, {
          links: Array.isArray(sourceTune.links)
            ? sourceTune.links.map(function(link) { return Object.assign({}, link) })
            : [],
        })
      : null
  }

  function beginEditSession(sourceTune) {
    const snapshot = snapshotTune(sourceTune)
    setEditingTune(snapshot)
    setLinks(snapshot && Array.isArray(snapshot.links) ? JSON.stringify(snapshot.links) : '[]')
  }

  const handleClose = () => {
      setVisible(false);
      const targetTune = editingTune
      const targetId = targetTune && targetTune.id
      setEditingTune(null)
      openedSessionRef.current = false
      if (!targetId || !onChange) return
      try {
        onChange(JSON.parse(linksRef.current), targetId)
      } catch (e) {
        // ignore invalid links JSON
      }
  }
  const handleShow = () => {
      beginEditSession(props.tune)
      setVisible(true);
  }

  useEffect(function() {
    if (!visible) {
      openedSessionRef.current = false
      return
    }
    if (!isControlled || openedSessionRef.current) return
    openedSessionRef.current = true
    beginEditSession(props.tune)
  }, [visible, isControlled, props.tune, props.tune && props.tune.id])

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

  const activeTune = visible && editingTune ? editingTune : tune
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
                    tuneId={activeTune && activeTune.id}
                    handleClose={handleClose}
                    token={props.token}
                    user={props.user}
                    googleDocumentId={props.googleDocumentId}
                    forceRefresh={props.forceRefresh}
                    login={props.login}
                    onTuneChange={function(updated) {
                        setEditingTune(updated)
                        setLinks(JSON.stringify(Array.isArray(updated.links) ? updated.links : []))
                        if (typeof props.onTuneChange === 'function') {
                            props.onTuneChange(updated)
                        }
                    }}
                />
            </div>
         
        </Modal.Body>
        
      </Modal>
    </>
  );
}
