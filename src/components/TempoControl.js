import Metronome from '../Metronome'
import {useState, useRef} from 'react'
import {Button, Modal, ButtonGroup} from 'react-bootstrap'
  
export default function TempoControl(props) {
    var metronome = useRef(null)
    metronome.current = new Metronome(props.value, props.beatsPerBar, 0, function() {console.log('done')});
    const handleClose = () => setShow(false);
    const handleShow = () => setShow(true);
    const [started, setStarted] = useState(false)
    const [show, setShow] = useState(false)
    var options = {30:'Grave',42:'Lento', 47:'Largo', 60: 'Adagio', 67: 'Adagietto', 75: 'Andante', 91: 'Moderato', 104: 'Allegretto', 120: 'Allegro', 136:'Vivace', 170: 'Presto', 180:'Prestissimo'}
    
    return <span className="tempo-control">
       
        <ButtonGroup size="sm">
            <Button onClick={function(e) {metronome.current.startStop()}} >{props.tunebook.icons.metronome}</Button><Button   onClick={handleShow}><span style={{color:'black'}}>{props.value}</span>{props.tunebook.icons.arrowdowns}</Button>
        </ButtonGroup>
      
      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Tempo Control</Modal.Title>
        </Modal.Header>
        <Modal.Body>
           <label  id="tempo"  style={{float: 'left', marginRight: "0.2em"}} >
              <Button style={{float:'right'}}  variant="danger" onClick={function(e) { props.onChange(''); handleClose()}} >Clear</Button>
              <Button onClick={function () {props.onChange(props.value + 5)}}>+</Button>Tempo<Button onClick={function () {props.onChange(Math.max((props.value - 5),1))}} >-</Button>
             <input type='number' onChange={function(e) { props.onChange(e.target.value)}} value={props.value} />
            <div style={{marginTop:'1em', marginBottom:'1em'}} >
                {Object.keys(options).map(function(key) {
                    return <Button key={key} onClick={function() {
                                        props.onChange(key)
                                        handleClose()
                                }} >
                                {options[key]}
                            </Button>
                })}
            </div>
            </label>
            <label>Metronome Beats Per Bar<input type='number' value={props.beatsPerBar} onChange={function(e) {props.setBeatsPerBar(e.target.value)}} /></label>
            
        </Modal.Body>
        <Modal.Footer>
        <Button variant="success" onClick={handleClose} >OK</Button>
        </Modal.Footer>
      </Modal>
    </span>
        
        
       

}
