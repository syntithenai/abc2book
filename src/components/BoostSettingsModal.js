import {useState, useEffect} from 'react'
import {Button, Modal, Badge} from 'react-bootstrap'

function BoostSettingsModal(props) {
  const [show, setShow] = useState(false);
  const [boost, setBoost] = useState(props.value > 0 ? props.value : 0);
  const handleClose = (e) => {
    if (e) e.preventDefault(); 
    if (e) e.stopPropagation();
    setShow(false);
  }
  const handleShow = (e) => {
    if (e) e.preventDefault(); 
    if (e) e.stopPropagation();
    setShow(true);
  }
  const boostUp = (e) => {
      e.preventDefault(); 
      e.stopPropagation();
      
      let newBoost = parseInt(boost > 0 ? boost : 0) + 1
      setBoost(newBoost)
      props.onChange(newBoost)
  }
  const boostDown = (e) => {
      e.preventDefault(); 
      e.stopPropagation();
      let newBoost = parseInt(boost) - 1
      setBoost(newBoost > 0 ? newBoost : 0)
      props.onChange(newBoost > 0 ? newBoost : 0)
  }
  useEffect(function() {
      setBoost(props.value)
  },[props.value])
  
  function showOrBoost(e) {
    e.preventDefault(); 
    e.stopPropagation();
    if (props.badgeClickable !== false) {
       handleShow(e)
    } else {
      boostUp(e);
    }
  }
  
  return (
    <>
      <Button onClick={showOrBoost} style={{float:'left', marginLeft:'0.1em'}} variant="secondary">
        <span  >{props.tunebook.icons.reviewsmall}</span> <Badge onClick={showOrBoost}>{props.value}</Badge>
      </Button>

      <Modal onClick={function(e) {e.stopPropagation()}} show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Confidence</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <h4>{props.value} </h4>
          <input style={{width:'100%'}} type="range"  name="boost" min="0" max="20" step="1" value={props.value} onChange={function(e) {props.onChange(e.target.value) }}  />
        </Modal.Body>
      </Modal>
    </>
  );
}

//<Button variant="primary" onClick={boostUp}>
            //{props.tunebook.icons.arrowup}
          //</Button>
          //&nbsp;&nbsp;
          //<input size="6" type="text" value={boost} onChange={function(e) {setBoost(e.target.value)}}  onBlur={function(e) {props.onChange(boost) }} />
          //&nbsp;&nbsp;
          //<Button variant="primary" onClick={boostDown}>
            //{props.tunebook.icons.arrowdown}
          //</Button>

export default BoostSettingsModal
