import {useState, useEffect} from 'react'
import {Button, Modal, Badge} from 'react-bootstrap'
import { useResponsiveModalProps } from '../useResponsiveModalProps'

function BoostSettingsModal(props) {
  const [show, setShow] = useState(false);
  const responsiveModalProps = useResponsiveModalProps();
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
      if (e) {
          e.preventDefault(); 
          e.stopPropagation();
      }
      let newBoost = (parseInt(boost > 0 ? boost : 0) + 1) %20
      setBoost(newBoost)
      props.onChange(newBoost)
  }
  const boostDown = (e) => {
      if (e) {
          e.preventDefault(); 
          e.stopPropagation();
      }
      let newBoost = parseInt(boost) - 1
      setBoost(newBoost > 0 ? newBoost : 0)
      props.onChange(newBoost > 0 ? newBoost : 0)
  }
  useEffect(function() {
      setBoost(parseInt(props.value) > 0 ? parseInt(props.value) : 0)
  },[props.value])

  useEffect(function() {
    if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(show)
    return function() {
      if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(false)
    }
  }, [show, props.setBlockKeyboardShortcuts]);
  
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
      <Button onClick={showOrBoost} className="tune-meta-modal-btn" aria-label="Confidence and difficulty" variant="secondary" alt={'Confidence'} >
        <span className={'tune-meta-modal-icon' + (props.value !== '' ? '' : ' tune-meta-modal-icon--centered')} >{props.tunebook.icons.reviewsmall}</span>
        <Badge bg="secondary" className="tune-meta-modal-badge" onClick={showOrBoost}>{parseInt(props.value) > 0 ? props.value : 0}{parseInt(props.difficulty) > 0 ? ':' + props.difficulty : ''}</Badge>
      </Button>

      <Modal onClick={function(e) {e.stopPropagation()}} show={show} onHide={handleClose} {...responsiveModalProps}>
        <Modal.Header closeButton>
          <Modal.Title>Confidence {parseInt(boost) > 0 ? parseInt(boost) : ''}</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{height:'40em'}}>
          <Button style={{float:'right', marginLeft: '2em'}}  variant="success" onClick={function() {
              boostUp()
          }} >{props.tunebook.icons.add} Boost</Button>
          
         <span>How well do you know this tune?</span>
          <br/>

          <input style={{width:'100%'}} type="range"  name="boost" min="0" max="20" step="1" value={boost} onChange={function(e) {
              setBoost(e.target.value)
              props.onChange(e.target.value)
            }}  />
          
          {props.onChangeDifficulty ? <>
          <hr style={{width:'100%', borderTop:'2px solid black'}} />
          <h4 style={{marginTop:'1em'}} >Difficulty {props.difficulty > 0 ? props.difficulty : 0} </h4>
          <input style={{width:'100%'}} type="range"  name="difficulty" min="0" max="20" step="1" value={props.difficulty > 0 ? props.difficulty : 0} onChange={function(e) { 
              props.onChangeDifficulty(e.target.value) 
          }}  />
          </> : null}
        </Modal.Body>
      </Modal>
    </>
  );
}

export default BoostSettingsModal
