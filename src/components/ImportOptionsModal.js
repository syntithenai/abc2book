import {useState} from 'react'
import {Button, Modal} from 'react-bootstrap'
import ListSelectorModal from './ListSelectorModal'
import ImportAbcModal from './ImportAbcModal'
import ImportCollectionModal from './ImportCollectionModal'
import ImportListModal from './ImportListModal'

function ImportOptionsModal(props) {
  const [show, setShow] = useState(false);
  const [duplicates, setDuplicates] = useState([])
  const [message, setMessage] = useState(null)
  //const [list, setList] = useState('');

  const handleClose = () => {
    console.log('close')
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
    console.log('impcur', {inserts, updates, duplicates})
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
      <Button  variant="success" onClick={handleShow}>
        {props.tunebook.icons.folderin}
      </Button>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Import from </Modal.Title>
        </Modal.Header>
        <Modal.Footer>
            <ImportAbcModal  forceRefresh={props.forceRefresh}  tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook} closeParent={handleClose}/>
            <ImportListModal tunesHash={props.tunesHash} forceRefresh={props.forceRefresh}  tunebook={props.tunebook}   currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook} closeParent={handleClose}/>
            <ImportCollectionModal forceRefresh={props.forceRefresh}  tunebook={props.tunebook}   currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook} closeParent={handleClose}/>
        </Modal.Footer>
      </Modal>
    </>
  );
}
export default ImportOptionsModal
