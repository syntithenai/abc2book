import {useState} from 'react'
import {Button, Modal} from 'react-bootstrap'
import ListSelectorModal from './ListSelectorModal'
import ImportAbcModal from './ImportAbcModal'
import ImportCollectionModal from './ImportCollectionModal'
import ImportListModal from './ImportListModal'
import ImportXmlModal from './ImportXmlModal'
import ImportYouTubeModal from './ImportYouTubeModal'
import ImportCollectionsAccordion from './ImportCollectionsAccordion'
import ImportFilesModal from './ImportFilesModal'

function ImportOptionsModal(props) {
  const [show, setShow] = useState(props.show);
  const [duplicates, setDuplicates] = useState([])
  const [message, setMessage] = useState(null)
  //const [list, setList] = useState('');

  const handleClose = () => {
    //console.log('close')
    setShow(false);
  }
  const handleShow = () => setShow(true);

    //function getCuratedTuneBookOptions() {
        //var final = {}
        //Object.keys(props.tunebook.curatedTuneBooks).forEach(function(tuneBookKey) {
            //final[tuneBookKey] = tuneBookKey
        //})
        //return final
    //}
    
    //function getSearchCuratedTuneBookOptions(filter) {
      //console.log('search cur')
        //var opts = getCuratedTuneBookOptions()
        //var filtered = {}
        //Object.keys(opts).forEach(function(key) {
            //var val = opts[key]
            //if (!filter || filter.trim() === '')  {
              //filtered[key] = val
            //} else if (val && val.indexOf(filter) !== -1) {
                //filtered[key] = val
            //}
        //})
        //console.log('search cur', filtered)
        //return filtered
    //}
    
  //function importCuratedCollection(val) {
    //props.tunebook.importTuneBook(val); 
    //props.setCurrentTuneBook(val); 
    //props.forceRefresh(); 
    //setShow(false)
  //}
  
  function importCuratedCollection(val) {
    props.setCurrentTuneBook(val);
    var [inserts, updates, duplicates] = props.tunebook.collection(val, props.currentTuneBook)
    //console.log('impcur', {inserts, updates, duplicates})
    setMessage(null)
    setDuplicates(duplicates)
    //setList('')
    //props.forceRefresh()
    setMessage(<>
      {inserts.length > 0 && <div style={{color:'red'}} >Inserted {inserts.length} tunes</div>}
      {updates.length > 0 && <div style={{color:'red'}}>Updated {updates.length} tunes</div>}
    </>)
    if (duplicates.length === 0) {
      
      setTimeout(function() {
        handleClose()
        setMessage(null)
        //props.closeParent()
      },2000)
    }
  }
  
  function forceImport(val) {
    var [inserts, updates, duplicates] = props.tunebook.importAbc(val, true)
    setDuplicates([])
    //setList('')
    setMessage(<>
      {<div style={{color:'red'}} >Inserted {inserts.length} tunes</div>}
      {<div style={{color:'red'}}>Updated {updates.length} tunes</div>}
    </>)
    //props.updateList('',props.currentTuneBook)
       
    setTimeout(function() {
      handleClose()
      //props.closeParent()
      setMessage(null)
       props.forceRefresh()
    },2000)
   
  }
  
  return (
    <>
      <Button title="Import" variant="success" onClick={handleShow}>
        {props.tunebook.icons.folderin} Import
      </Button>

      <Modal show={show} onHide={handleClose}  style={{marginTop:'5em'}} >
        <Modal.Header closeButton>
          <Modal.Title >Import from </Modal.Title>
        </Modal.Header>
        <Modal.Footer  >
			<ImportAbcModal  forceRefresh={props.forceRefresh}  tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook} closeParent={handleClose}/>
            <ImportXmlModal  forceRefresh={props.forceRefresh}  tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook} closeParent={handleClose}/>
            {props.token && <ImportYouTubeModal  forceRefresh={props.forceRefresh}  tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook} closeParent={handleClose} token={props.token} />}
            <div>
                <ImportCollectionsAccordion tunebook={props.tunebook} setCurrentTuneBook={props.setCurrentTuneBook} />
            </div>
        </Modal.Footer>
      </Modal>
    </>
  );
}
export default ImportOptionsModal

//<ImportFilesModal  forceRefresh={props.forceRefresh} tunes={props.tunes} tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook} closeParent={handleClose}/>
            
//<ImportListModal tunesHash={props.tunesHash} forceRefresh={props.forceRefresh}  tunebook={props.tunebook}   currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook} closeParent={handleClose}/>
            //<ImportCollectionModal forceRefresh={props.forceRefresh}  tunebook={props.tunebook}   currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook} closeParent={handleClose}/>
