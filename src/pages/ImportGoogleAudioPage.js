import {Link , useNavigate , useParams} from 'react-router-dom'
import {useState, useEffect} from 'react'
import {Button, Modal} from 'react-bootstrap'
import useGoogleDocument from '../useGoogleDocument'
export default function ImportGoogleAudioPage({tunebook, token, refresh}) {
    var navigate = useNavigate()
    var params = useParams()
    const [error,setError] = useState('')
    var docs = useGoogleDocument(token, refresh)
    //if (curated.hasOwnProperty(params.curation)) {
    //} 
    const [agree, setAgree] = useState(false)
    const [show, setShow] = useState(false)
    
    function handleCloseAgree() {
        //if (params.tuneId) {
            //navigate("/recordings/"+params.googleDocumentId)
        //} else {
            navigate("/recordings")
        //}
    }
    
    function onClose() {
        //props.setCurrentTuneBook(params.googleDocumentId)
        navigate("/recordings")
    }
    
    useEffect(function() {
      if (!params.googleDocumentId) {
          navigate("/recordings")
      } else {
          if (token) {
              // load document 
              docs.getDocumentMeta(params.googleDocumentId).then(function(rec) {
                  docs.getDocumentBlob(params.googleDocumentId).then(function(recData) {
                    if (rec && rec.name && recData) {
                        tunebook.recordingsManager.newRecording(rec.name,new Blob([recData], { 'type' : 'audio/ogg; codecs=opus' })).then(function() {
                          navigate('/recordings')  
                        })
                    } else {
                        setError("Unable to load import source")
                    } 
                  //if (fullSheet) {
                      //tunebook.importAbc(fullSheet,null,params.tuneId)
                      //navigate("/recordings")
                  //} else {
                      //setError("Unable to load import source")
                  //}
                 })
              })
            }
      }
    }, [params.googleDocumentId, token, navigate, docs, tunebook.recordingsManager])
    
    return <>{(params.googleDocumentId && params.googleDocumentId.trim()) ? <div className="App-import">
     <h1>Import A Recording </h1>
     {!token && <>To import this recording, you will need to <Button style={{marginLeft:'0.3em'}} variant="success" onClick={refresh} >Login</Button></>}
     {(token && !error) && <>Loading..</>}
     {(token && error) && <>{error}</>}
    </div> : null}</>   
}
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
