import {useState, useEffect} from 'react'
import {Button, Modal, Badge} from 'react-bootstrap'

function BoostSettingsModal(props) {
  const [show, setShow] = useState(false);
  const [boost, setBoost] = useState(props.value > 0 ? props.value : 0);
  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);
  const boostUp = () => {
      let newBoost = parseInt(boost > 0 ? boost : 0) + 1
      setBoost(newBoost)
      props.onChange(newBoost)
  }
  const boostDown = () => {
      let newBoost = parseInt(boost) - 1
      setBoost(newBoost > 0 ? newBoost : 0)
      props.onChange(newBoost > 0 ? newBoost : 0)
  }
  useEffect(function() {
      setBoost(props.value)
  },[props.value])
  return (
    <>
      <Button style={{float:'left', marginLeft:'1em'}} variant="secondary">
        <span onClick={function(e) {boostUp()}} >{props.tunebook.icons.reviewsmall}</span> <Badge onClick={handleShow}>{props.value}</Badge>
      </Button>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Confidence</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Button variant="primary" onClick={boostUp}>
            {props.tunebook.icons.arrowup}
          </Button>
          &nbsp;&nbsp;
          <input size="6" type="text" value={boost} onChange={function(e) {setBoost(e.target.value)}}  onBlur={function(e) {props.onChange(boost) }} />
          &nbsp;&nbsp;
          <Button variant="primary" onClick={boostDown}>
            {props.tunebook.icons.arrowdown}
          </Button>
        </Modal.Body>
      </Modal>
    </>
  );
}
export default BoostSettingsModal
