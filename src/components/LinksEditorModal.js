import {useState, useEffect} from 'react'
import {Button, Modal, Badge} from 'react-bootstrap'
import LinksEditor from './LinksEditor'
import { useResponsiveModalProps } from '../useResponsiveModalProps'


export default function LinksEditorModal(props) {
    var {tunebook, tune, onChange} = props
  const [show, setShow] = useState(false);
  const responsiveModalProps = useResponsiveModalProps();
  var [links, setLinks] = useState(props.tune && Array.isArray(props.tune.links) ? JSON.stringify(props.tune.links) : '[]')
  
  
  const handleClose = () => {
      setShow(false);
      onChange(JSON.parse(links)) 
  }
  const handleShow = () => {
      setLinks(props.tune && Array.isArray(props.tune.links) ? JSON.stringify(props.tune.links) : '[]')
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

  return (
    <>
        
      <Button className="tune-meta-modal-btn" aria-label="Media links" style={{position:'relative', float:'left', marginLeft:'0.1em', width:'2.6em', height:'2.37em'}} variant="warning" onClick={handleShow}><span aria-hidden="true" style={{position:'absolute', top:'1px', left:'1.3em', opacity: 0.9, fontSize:'0.5em'}}>{tunebook.icons.link} </span><Badge size="sm" style={{position:'absolute', top:'26px', left:'1.4em',  fontSize:'0.5em'}} >{JSON.parse(links).length}</Badge></Button>

      <Modal show={show} onHide={handleClose} {...responsiveModalProps}>
        <Modal.Header closeButton>
          <Modal.Title>Links</Modal.Title>
        </Modal.Header>
        <Modal.Body>
            <div  >
                <LinksEditor mediaController={props.mediaController} onChange={function(links) {
                        setLinks(JSON.stringify(links))
                    }}  tunebook={tunebook} links={JSON.parse(links)} tune={tune} handleClose={handleClose} />
            </div>
         
        </Modal.Body>
        
      </Modal>
    </>
  );
}
