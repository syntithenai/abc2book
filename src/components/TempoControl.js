//import Metronome from '../Metronome'
import {useState, useRef, useEffect} from 'react'
import {Button, Modal, ButtonGroup} from 'react-bootstrap'
import {isMobile} from 'react-device-detect';
  
export default function TempoControl(props) {
    //var metronome = useRef(null)
    //metronome.current = new Metronome(props.value, props.beatsPerBar, 0, function() {console.log('done')});
    const handleClose = () => props.setShowTempo(false);
    const handleShow = () => props.setShowTempo(true);
    const [started, setStarted] = useState(false)
    const [tempo, setTempo] = useState(props.value)
    //const [show, setShow] = useState(false)
    var options = {30:'Grave',42:'Lento', 47:'Largo', 60: 'Adagio', 67: 'Adagietto', 75: 'Andante', 91: 'Moderato', 104: 'Allegretto', 120: 'Allegro', 136:'Vivace', 170: 'Presto', 180:'Prestissimo'}
    
    //useEffect(function() {
      //return function cleanup() {
          //if (metronome.current) metronome.current.stop()
      //}  
    //},[])
     
//{isMobile && <Button onClick={handleShow} >{props.tunebook.icons.metronome}</Button>}
 //  <Button style={{float:'right'}}  variant="danger" onClick={function(e) { props.onChange('100'); handleClose()}} >Reset</Button>
        //{!isMobile && <ButtonGroup size="sm">
            //<Button onClick={function(e) {metronome.current.startStop()}} >{props.tunebook.icons.metronome}</Button><Button   onClick={handleShow}><span style={{color:'black'}}>{props.value}</span>{props.tunebook.icons.arrowdowns}</Button>
        //</ButtonGroup>}               
    return <span className="tempo-control">
       
  
       
      <Modal show={props.showTempo} onHide={handleClose}>
        <Modal.Header closeButton>
          
          <Modal.Title>Tempo</Modal.Title>
        </Modal.Header>
        <Modal.Body>
           <label  id="tempo"  style={{float: 'left', marginRight: "0.2em"}} >
              
              <Button onClick={function () {setTempo(parseInt(tempo > 0 ? tempo : 0) + 5)}}>+</Button>&nbsp;&nbsp;&nbsp;Tempo&nbsp;&nbsp;&nbsp;<Button onClick={function () {setTempo(Math.max((parseInt(tempo > 0 ? tempo : 0) - 5),1))}} >-</Button>
             <input type='number' onChange={function(e) { setTempo(e.target.value)}} value={tempo} />
            <div style={{marginTop:'1em', marginBottom:'1em'}} >
                {Object.keys(options).map(function(key) {
                    return <Button key={key} onClick={function() {
                                        setTempo(key)
                                        //handleClose()
                                }} >
                                {options[key]}
                            </Button>
                })}
            </div>
            </label>
          
            
        </Modal.Body>
        <Modal.Footer>
        <Button variant="danger" onClick={handleClose} >Cancel</Button>
        <Button variant="success" onClick={function() {try {props.onChange(tempo)} catch (e) {}; handleClose()}} >OK</Button>
        </Modal.Footer>
      </Modal>
    </span>
        
        
       

}
 //<Button style={{marginBottom:'0.2em'}}  variant={started ? "danger" : "success"} onClick={started ? function(e) { metronome.current.stop(); setStarted(false)} : function(e) { metronome.current.start(); setStarted(true)}  } >{started ? "Stop Metronome" : "Start Metronome"}</Button>
           
  //<label>Metronome Beats Per Bar<input type='number' value={props.beatsPerBar} onChange={function(e) {props.setBeatsPerBar(e.target.value)}} /></label>
