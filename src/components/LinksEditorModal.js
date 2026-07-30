import {useState, useEffect, useRef} from 'react'
import {Button, Modal, Badge} from 'react-bootstrap'
import LinksEditor from './LinksEditor'
import { useResponsiveModalProps } from '../useResponsiveModalProps'


export default function LinksEditorModal(props) {
    var {tunebook, tune, onChange} = props
  const [show, setShow] = useState(false);
  const responsiveModalProps = useResponsiveModalProps();
  var [links, setLinks] = useState(props.tune && Array.isArray(props.tune.links) ? JSON.stringify(props.tune.links) : '[]')
  // Freeze the tune for the whole edit session so navigation while the modal is
  // open cannot apply these links to a different tune on close (or via auto-scan).
  const [editingTune, setEditingTune] = useState(null)
  const linksRef = useRef(links)
  linksRef.current = links


  const handleClose = () => {
      setShow(false);
      const targetTune = editingTune
      const targetId = targetTune && targetTune.id
      setEditingTune(null)
      if (!targetId || !onChange) return
      try {
        onChange(JSON.parse(linksRef.current), targetId)
      } catch (e) {
        // ignore invalid links JSON
      }
  }
  const handleShow = () => {
      const t = props.tune
      const snapshot = t
        ? Object.assign({}, t, {
            links: Array.isArray(t.links) ? t.links.map(function(link) { return Object.assign({}, link) }) : [],
          })
        : null
      setEditingTune(snapshot)
      setLinks(snapshot && Array.isArray(snapshot.links) ? JSON.stringify(snapshot.links) : '[]')
      setShow(true);
  }

  useEffect(function() {
    if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(show)
    return function() {
      if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(false)
    }
  }, [show, props.setBlockKeyboardShortcuts]);

    useEffect(function() {
      if (!show) {
        setLinks(props.tune && Array.isArray(props.tune.links) ? JSON.stringify(props.tune.links) : '[]')
      }
  },[props.tune, show])

  const activeTune = show && editingTune ? editingTune : tune
  const linkCount = (function() {
    try {
      return JSON.parse(links).length
    } catch (e) {
      return 0
    }
  })()

  return (
    <>
        
      <Button className="tune-meta-modal-btn" aria-label="Media" variant="warning" onClick={handleShow}><span aria-hidden="true" className="tune-meta-modal-icon">{tunebook.icons.link} </span><Badge bg="secondary" className="tune-meta-modal-badge" >{linkCount}</Badge></Button>

      <Modal
        show={show}
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
                    isOpen={show}
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
