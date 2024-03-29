import {useState, useEffect} from 'react'
import {Button, Modal, Badge} from 'react-bootstrap'
import {useNavigate} from 'react-router-dom'

function BoostSettingsModal(props) {
  const navigate = useNavigate()
  const [show, setShow] = useState(false);
  const [boost, setBoost] = useState(props.value > 0 ? props.value : 0);
  
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
  const boostUp = (e) => {
      if (e) {
          e.preventDefault(); 
          e.stopPropagation();
      }
      let newBoost = (parseInt(boost > 0 ? boost : 0) + 1) %20
      //console.log('BUP',newBoost)
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
      <Button onClick={showOrBoost} style={{position:'relative', float:'left', marginLeft:'0.1em', width:'2.6em', height:'2.37em'}} variant="secondary" alt={'Confidence'} >
        <span  style={{position:'absolute', top:props.value !== '' ? '1px': '12px', left:'1.3em', opacity: 0.9, fontSize:'0.5em'}} >{props.tunebook.icons.reviewsmall}</span> 
        <Badge variant="secondary" style={{position:'absolute', top:'26px', left:(props.difficulty > 0 ? '.9em' : '1.4em'),  fontSize:'0.5em'}} onClick={showOrBoost}>{parseInt(props.value) > 0 ? props.value : 0}{parseInt(props.difficulty) > 0 ? ":" + props.difficulty : ''}</Badge>
      </Button>

      <Modal  onClick={function(e) {e.stopPropagation()}} show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Confidence {parseInt(boost) > 0 ? parseInt(boost) : ''}</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{height:'40em'}}>
          <Button style={{float:'right', marginLeft: '2em'}}  variant="success" onClick={function() {
              //var b = 0
              //if (parseInt(boost) > 0) {
                  //b = (parseInt(boost) + 1)%20
              //} 
              //setBoost(b)
              //props.onChange(b)
              boostUp()
          }} >{props.tunebook.icons.add} Boost</Button>
          
         <span  >{props.explicitSave ? 'How well do you know these '+(props.count > 0 ? props.count : '')+' tunes?' : 'How well do you know this tune?'}</span>
          <br/>

          <input style={{width:'100%'}} type="range"  name="boost" min="0" max="20" step="1" value={boost} onChange={function(e) {if (props.explicitSave) {
                setBoost(e.target.value)
              } else {
                   props.onChange(e.target.value) 
              }     
            }}  />
          
          
          {!props.explicitSave ? <>
              <hr style={{width:'100%', borderTop:'2px solid black'}} />
              <h4 style={{marginTop:'1em'}} >Difficulty {props.difficulty} </h4>
              <input style={{width:'100%'}} type="range"  name="difficulty" min="0" max="20" step="1" value={props.difficulty} onChange={function(e) { 
                  props.onChangeDifficulty(e.target.value) 
              }}  />
           </> : null }
           {props.explicitSave ? <> 
            <Button variant="success" onClick={function() {
                var currentSelection = Object.keys(props.selected).filter(function(item) {
                    return (props.selected[item] ? true : false)
                  })
                  
                props.tunebook.bulkChangeTunes(currentSelection.filter(function(item) {
                    if (item) return true
                    else return false
                }), 'boost', boost)
                    handleClose()
                    navigate('/blank')
                    setTimeout(function() {
                        navigate('/tunes')
                    }, 500)
                
             }} >Save</Button>
            <Button style={{marginLeft:'2em'}}  variant="danger" onClick={function() {
                handleClose()

             }} >Cancel</Button>
             </>: ''}
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
