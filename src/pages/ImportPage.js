import {Link , useNavigate , useParams} from 'react-router-dom'
import {useState} from 'react'
import {Button, Modal} from 'react-bootstrap'
import curated from '../CuratedTuneBooks'
import ImportCollectionModal from '../components/ImportCollectionModal'

export default function ImportPage(props) {
    var navigate = useNavigate()
    var params = useParams()
    console.log(params, curated)
    if (curated.hasOwnProperty(params.curation)) {
        console.log("D",params.curation) //curated[params.curation])
    } 
    const [agree, setAgree] = useState(false)
    const [show, setShow] = useState(false)
    function handleCloseAgree() {
        navigate("/tunes")
    }
    
    function onClose() {
        console.log('onClose')
        props.setCurrentTuneBook(params.curation)
        navigate("/tunes")
    }
    
    return <div className="App-import">
     {agree 
         ? <ImportCollectionModal autoStart={params.curation} forceRefresh={props.forceRefresh}  tunebook={props.tunebook}   currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook} closeParent={onClose} /> 
         : <Modal show={!agree} onHide={handleCloseAgree}>
        <Modal.Header closeButton>
          <Modal.Title>Import a Book</Modal.Title>
          
        </Modal.Header>
       
        <Modal.Body>
        Do you want to import the book <i>{params.curation}</i>? 
        <div style={{fontWeight: 'bold'}} >This will override any changes you have made to prior imports.</div>
        </Modal.Body>
        <Modal.Footer>
        <Button onClick={function(e) {setAgree(true)}} variant="success" >OK</Button>
        <Button onClick={function(e) {navigate('/tunes')}} variant="danger" >Cancel</Button>
        
        </Modal.Footer>
      </Modal>
     }
    </div>
}

