import {Link , useNavigate , useParams} from 'react-router-dom'
import {useState, useEffect} from 'react'
import {Button, Modal} from 'react-bootstrap'
import curated from '../CuratedTuneBooks'
import ImportCollectionModal from '../components/ImportCollectionModal'
import { buildCuratedImportPath } from '../curatedImportMatch'
import { useDocumentTitle } from '../pageTitle'

export default function ImportPage(props) {
    useDocumentTitle('Import')
    var navigate = useNavigate()
    var params = useParams()
    const [error, setError] = useState(false)
    var collection = params.curation
    
    
    useEffect(function() {
        if (props.tunebook.curatedTuneBooks[collection]) {
          const meta = props.tunebook.curatedTuneBooks[collection]
          if (meta.link) {
            const importPath = buildCuratedImportPath(meta)
            if (importPath) navigate(importPath)
          } else if (meta.googleDocumentId) {
            navigate("/importdoc/"+meta.googleDocumentId)
          } 
        } else {
            setError('Unable to import '+collection)
        }
    }, [collection, navigate, props.tunebook.curatedTuneBooks])
    
    return error ? <b>{error}</b> : <b>Loading....</b>
    
    
    //if (curated.hasOwnProperty(params.curation)) {
    //} 
    //const [agree, setAgree] = useState(false)
    //const [show, setShow] = useState(false)
    
    //function handleCloseAgree() {
        //if (params.tuneId) {
            //navigate("/tunes/"+params.tuneId)
        //} else {
            //navigate("/tunes")
        //}
    //}
    
    //function onClose() {
        //props.setCurrentTuneBook(params.curation)
        //navigate("/tunes")
    //}
    
    //useEffect(function() {
      //if (!params.curation) {
          //navigate("/tunes")
      //}
    //}, [params.curation])
    
    //return <>{(params.curation && params.curation.trim()) ? <div className="App-import">
     //{agree 
         //? <ImportCollectionModal autoStart={params.curation && params.curation.trim() ? params.curation : false} forceRefresh={props.forceRefresh}  tunebook={props.tunebook}   currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook} closeParent={handleCloseAgree} /> 
         //: <Modal show={!agree} onHide={handleCloseAgree}>
        //<Modal.Header closeButton>
          //<Modal.Title>Import a Book</Modal.Title>
          
        //</Modal.Header>
       
        //<Modal.Body> 
        //Do you want to import the book <i>{params.curation}</i>? 
        //<div style={{fontWeight: 'bold'}} >This will override any changes you have made to prior imports.</div>
        //</Modal.Body>
        //<Modal.Footer>
        //<Button onClick={function(e) {setAgree(true)}} variant="success" >OK</Button>
        //<Button onClick={function(e) {navigate('/tunes')}} variant="danger" >Cancel</Button>
        
        //</Modal.Footer>
      //</Modal>
     //}
    //</div> : null}</>
}

