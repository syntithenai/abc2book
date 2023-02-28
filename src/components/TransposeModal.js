import {useState, useEffect} from 'react'
import {Button, Modal, Form} from 'react-bootstrap'
import { chordParserFactory, chordRendererFactory } from 'chord-symbol';

export default function TransposeModal(props) {
  const handleClose = () => {
      props.setShow(false);
  }
  const handleShow = () => props.setShow(true);
  var tune = props.tune 
  const [destKey, setDestKey] = useState('')
  
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
   var dest = ''
   //console.log('tk',tune.key)
   if (tune.key) {
     //try {
      const parseChord = chordParserFactory();
      var config = { useShortNamings: true }
      if (tune.transpose) config.transposeValue = Number(tune.transpose)
      const renderChord = chordRendererFactory(config);
      const destChord = parseChord(tune.key);
      if (!destChord.error) {
          try {
            dest = renderChord(destChord)
           } catch (e) {}
      }
      //console.log('tk dd',dest,destChord)
      //setDestKey(dest)
      //} catch (e) {
        //console.log(e)
      //}
   }
      //console.log(renderChord(chord));
  return (
    <>
        <Modal show={props.show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Transpose</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Button  style={{float:'right'}} variant="success" onClick={handleClose} >OK</Button>
          <Form.Group className="mb-3" controlId="key">
            <div>Notation Key <Form.Control  value={tune.key ? tune.key : ''} onChange={function(e) {tune.key = e.target.value; props.saveTune(tune); props.forceRefresh();   }}/></div>
            {dest && <div>Transposed Key <b>{dest}</b></div>}
          </Form.Group>
          <Form.Group className="mb-3" controlId="transpose">
            <Form.Label>Transpose</Form.Label>
            <Form.Control disabled={!tune.key} type="number" value={tune.transpose ? Number(tune.transpose) : 0} onChange={function(e) {tune.transpose = e.target.value; props.saveTune(tune);  }}/>
          </Form.Group> 
        </Modal.Body> 
        
        
      </Modal>
    </>
  );
}
//  
