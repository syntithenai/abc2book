import Metronome from '../Metronome'
import {useState} from 'react'
import {Button, Modal, ButtonGroup} from 'react-bootstrap'
  
export default function TempoControl(props) {
    
    var metronome = new Metronome(props.value, props.tunebook.beatsPerBar, 0, function() {console.log('done')});
    const handleClose = () => setShow(false);
    const handleShow = () => setShow(true);
    const [started, setStarted] = useState(false)
    const [show, setShow] = useState(false)
    
    return <span className="tempo-control">
       
        <ButtonGroup >
            <Button onClick={function(e) {metronome.startStop()}} >{props.tunebook.icons.metronome}</Button>
           
            <Button   onClick={handleShow}>
             <span style={{color:'black'}}>{props.value}</span>{props.tunebook.icons.arrowdowns}
            </Button>
        </ButtonGroup>
      
      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Tempo Control</Modal.Title>
        </Modal.Header>
        <Modal.Body>
           <label  id="tempo"  style={{float: 'left', marginRight: "0.2em"}} >
              <Button style={{float:'right'}}  variant="danger" onClick={function(e) { props.onChange('')}} >Clear</Button>
              Tempo <select id="tempovalue" onChange={function(e) { props.onChange(e.target.value)}} value={props.value} >
                <option value=""></option>
                <option value="30">Grave</option>
                <option value="42">Lento</option>
                <option value="47">Largo</option>
                <option value="60">Adagio</option>
                <option value="67">Adagietto</option>
                <option value="75">Andante</option>
                <option value="91">Moderato</option>
                <option value="104">Allegretto</option>
                <option value="120">Allegro</option>
                <option value="136">Vivace</option>
                <option value="170">Presto</option>
                <option value="180">Prestissimo</option>
              </select>
             <input type='number' onChange={function(e) { props.onChange(e.target.value)}} value={props.value} />
            </label>
             
           
            <label>Metronome Beats Per Bar<input type='number' value={props.tunebook.beatsPerBar} onChange={function(e) {props.tunebook.setBeatsPerBar(e.target.value)}} /></label>
            
        </Modal.Body>
        <Modal.Footer>
        <Button variant="success" onClick={handleClose} >OK</Button>
        </Modal.Footer>
      </Modal>
    </span>
        
        
       

}
