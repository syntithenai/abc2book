import {useState, useEffect} from 'react'
import {Button, Modal, Badge, ButtonGroup} from 'react-bootstrap'
import {useNavigate} from 'react-router-dom'

export default function RepeatsEditorModal(props) {
  const navigate = useNavigate()
  const [show, setShow] = useState(false);
  const [repeats, setRepeats] = useState(props.value > 1 ? props.value : 1);
  
  const handleClose = (e) => {
    if (e) e.preventDefault(); 
    if (e) e.stopPropagation();
    if (props.handleClose) props.handleClose()
    setShow(false);
  }
  const handleShow = (e) => {
    if (e) e.preventDefault(); 
    if (e) e.stopPropagation();
    setShow(true);
  }
  const valueUp = (e) => {
      if (e) {
          e.preventDefault(); 
          e.stopPropagation();
      }
      let newRepeats = parseInt(repeats) + 1
      setRepeats(newRepeats)
      props.onChange(newRepeats)
  }
  const valueDown = (e) => {
      if (e) {
          e.preventDefault(); 
          e.stopPropagation();
      }
      let newRepeats = parseInt(repeats) - 1
      newRepeats = newRepeats > 1 ? newRepeats : 1
      setRepeats(newRepeats)
      props.onChange(newRepeats)
  }
  useEffect(function() {
      var r = (parseInt(props.value) > 1 ? parseInt(props.value) : 1)
      setRepeats(r)
  },[props.value])

  
  return (
    <>
      {(props.mediaController && props.mediaController.mediaLinkNumber === null) && <Button onClick={handleShow} variant="primary" >{props.tunebook.icons.timer2line} {props.playCount + 1}/{repeats}</Button>}

      <Modal  onClick={function(e) {e.stopPropagation()}} show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Repeats</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{height:'40em'}}>
          <div style={{marginBottom:'1em'}}>How many times should this tune repeat before finishing?</div>
          <ButtonGroup>
              <Button variant="primary" onClick={valueDown}>
                {props.tunebook.icons.arrowdown}
              </Button>
              <Button style={{marginRight:'1em'}} variant="primary" onClick={valueUp}>
                {props.tunebook.icons.arrowup}
              </Button>
              <input style={{width:'100%'}} type="text"  name="repeats" value={repeats} onChange={function(e) {props.onChange(e.target.value) }}  />
        </ButtonGroup>
        </Modal.Body>
      </Modal>
    </>
  );
}
//<Button style={{float:'right', marginLeft: '2em'}}  variant="success" onClick={function() {
              //boostUp()
          //}} >{props.tunebook.icons.add} Boost</Button>
          



