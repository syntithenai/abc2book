import {useState} from 'react'
import {Button, Modal, Form} from 'react-bootstrap'

export default function TransposeModal(props) {
  const handleClose = () => {
      props.setShow(false);
  }
  const handleShow = () => props.setShow(true);
  var tune = props.tune 
  
  function tranposeKey(key,transpose) {
    var t = parseInt(transpose)
    //console.log(t, typeof t, t === NaN, t === 'NaN')
    return key + '-' + ( isNaN(parseInt(transpose)) ? 0 : parseInt(transpose) )
  }
   
  return (
    <>
        <Modal show={props.show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Transpose</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Button  style={{float:'right'}} variant="success" onClick={handleClose} >OK</Button>
          <Form.Group className="mb-3" controlId="key">
            <div>Notation Key <b>{tune.key}</b></div>
           
          </Form.Group>
          <Form.Group className="mb-3" controlId="transpose">
            <Form.Label>Transpose</Form.Label>
            <Form.Control type="number" value={tune.transpose ? tune.transpose : ''} onChange={function(e) {tune.transpose = e.target.value; props.saveTune(tune)  }}/>
          </Form.Group> 
        </Modal.Body> 
        
        
      </Modal>
    </>
  );
}
//  <div>Transposed Key <b>{tranposeKey(tune.key,tune.tranpose)}</b></div>
