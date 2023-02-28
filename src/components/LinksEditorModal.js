import {useState, useEffect} from 'react'
import {Button, Modal, Badge} from 'react-bootstrap'
import LinksEditor from './LinksEditor'


export default function LinksEditorModal(props) {
    var {tunebook, tune, icon, onChange, forceRefresh} = props
  const [show, setShow] = useState(false);
  var [links, setLinks] = useState(props.tune && Array.isArray(props.tune.links) ? JSON.stringify(props.tune.links) : '[]')
  
  
  const handleClose = () => {
      setShow(false);
      onChange(JSON.parse(links)) 
  }
  const handleShow = () => {
      setShow(true);
  }
  

  return (
    <>
        
      <Button variant="danger"   onClick={function() {
          handleShow()
        }}>{icon ==="media" ?  tunebook.icons.link : tunebook.icons.dropdown}</Button>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Links</Modal.Title>
        </Modal.Header>
        <Modal.Body>
            <div  >
                <LinksEditor onChange={function(links) {
                        setLinks(JSON.stringify(links))
                    }}  tunebook={tunebook} links={JSON.parse(links)} tune={tune} handleClose={handleClose} />
            </div>
         
        </Modal.Body>
        
      </Modal>
    </>
  );
}
