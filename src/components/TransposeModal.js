import {useState, useEffect} from 'react'
import {Button, Modal, Form} from 'react-bootstrap'

export default function TransposeModal(props) {
  const handleClose = () => {
      props.setShow(false);
  }
  const handleShow = () => props.setShow(true);
  var tune = props.tune 
  const [destKey, setDestKey] = useState()
  
  //useEffect(function() {
    //setDestKey(transposeKey(props.tune.transpose,props.tune.key))
  //},[props.tune.transpose,props.tune.key])
  
  //function tranposeKey(key,transpose) {
    //var t = parseInt(transpose)
    ////console.log(t, typeof t, t === NaN, t === 'NaN')
    //return key + '-' + ( isNaN(parseInt(transpose)) ? 0 : parseInt(transpose) )
  //}
  
  //function transposeKey(chord, amount) {
    //console.log('transp',chord, amount)
        //var scale = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
        //var normalizeMap = {"Cb":"B", "Db":"C#", "Eb":"D#", "Fb":"E", "Gb":"F#", "Ab":"G#", "Bb":"A#",  "E#":"F", "B#":"C"}
        //var re =  chord.replace(/[CDEFGAB](b|#)?/g, function(match) {
            //var i = (scale.indexOf((normalizeMap[match] ? normalizeMap[match] : match)) + amount) % scale.length
            //console.log("dd",i)
            
            //return scale[ i < 0 ? i + scale.length : i ]
        //})
        //console.log("dd",re,scale)
        //return re
        
    //}
   
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
