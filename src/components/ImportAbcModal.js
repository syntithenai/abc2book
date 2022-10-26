import {useState} from 'react'
import {Button, Modal, ButtonGroup} from 'react-bootstrap'
import BookSelectorModal from './BookSelectorModal'
function ImportAbcModal(props) {
  const [show, setShow] = useState(false);
  const [list, setList] = useState('');
  const handleClose = () => {
      setMessage(null)
      setList('')
      setDuplicates(null)
      setShow(false);
      if (props.closeParent) props.closeParent()
      //props.forceRefresh()
  }
  const handleShow = () => setShow(true);
  var [filter, setFilter] = useState('')
  var [tuneBook, setTuneBook] = useState('')
  var [duplicates, setDuplicates] = useState([])
  var [message, setMessage] = useState(null)
  
  function doImport(list) {
    //console.log('import',list)
    const importResults = props.tunebook.importAbc(list, props.currentTuneBook)
     setTimeout(function() {
      props.tunebook.utils.scrollTo('bottomofpage')
    },100)
    handleClose()
    //console.log('imported',inserts,updates,duplicates)
    //props.setImportResults(importResults)
    //var [inserts, updates, duplicates] = importResults
    //setMessage(null)
    
    //if (duplicates.length > 0) {
      //setDuplicates(duplicates)
      //setMessage(<div>
        //{inserts.length > 0 && <div style={{color:'red'}} >Inserted {inserts.length} tunes</div>}
        //{updates.length > 0 && <div style={{color:'red'}}>Updated {updates.length} tunes</div>}
        //Skipped {duplicates.length} duplicate tunes<Button style={{marginLeft:'1em'}}  variant="primary" onClick={function(e) {forceImport(duplicates)}}>Import Duplicates</Button></div>
      //)
    //} else {
      //setList('')
      //props.forceRefresh()
      //setMessage(<>
        //{inserts.length > 0 && <div style={{color:'red'}} >Inserted {inserts.length} tunes</div>}
        //{updates.length > 0 && <div style={{color:'red'}}>Updated {updates.length} tunes</div>}
        
      //</>)
    //}
  }
  
  //function forceImport(duplicates) {
    //var [inserts, updates, d] = props.tunebook.importAbc(duplicates.map(function(d) {return props.tunebook.abcTools.json2abc(d) }).join("\n"), props.currentTuneBook, true)
    ////console.log('FFimported',inserts,updates,duplicates,d)
     //setMessage(<>
      //{<div style={{color:'red'}} >Inserted {inserts.length} tunes</div>}
    //</>)
    ////setTimeout(,2000)
   
  //}
      
  function fileSelected (event) {
      //console.log('FILESel',event,event.target.files[0]);
      
      //const fileList = event.target.files;
      function readFile(file){
          var reader = new FileReader();
          reader.onloadend = function(){
            //console.log("read"+reader.result.length )
            if (reader.result.trim().length > 0) {
              setList(reader.result)
              doImport(reader.result)
            }
          }
          if(file){
              reader.readAsText(file);
          }
      }
      readFile(event.target.files[0])
  }
   
  return (
    <>
      <Button  style={{color:'black'}}  variant="primary" onClick={handleShow}>
        {props.tunebook.icons.folderin} ABC
      </Button>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Import ABC music</Modal.Title>
        </Modal.Header>
        {(!message) ? <Modal.Body>
          <div style={{backgroundColor:'lightblue', padding:'0.3em', height:'7em'}} >
          <div style={{borderBottom:'1px solid black', marginBottom:'1em', padding:'0.3em'}} > 
            Import into &nbsp;&nbsp;
            <ButtonGroup variant="primary"  style={{ backgroundColor: '#3f81e3', borderRadius:'10px' , width: 'fit-content'}}>{props.currentTuneBook ? <Button  onClick={function(e) {props.setCurrentTuneBook('');  props.forceRefresh(); }} >{props.tunebook.icons.closecircle}</Button> : ''}<BookSelectorModal  forceRefresh={props.forceRefresh} title={'Select a Book'} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  tunebook={props.tunebook} value={tuneBook} onChange={function(val) { props.setCurrentTuneBook(val)}} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions}   triggerElement={<Button variant="primary" >{props.tunebook.icons.book} {props.currentTuneBook ? <b>{props.currentTuneBook}</b> : ''}</Button>}  /></ButtonGroup>
          </div>
          {(list.trim().length > 0) ? <Button style={{float:'left', marginBottom:'0.5em'}} variant="primary" onClick={function() {doImport(list)}}>Import</Button> : <Button style={{float:'left', marginBottom:'0.5em'}} variant="secondary" >Import</Button>}
          <span style={{marginLeft:'0.5em',width:'30%', float:'left'}} >
            <input  style={{float:'left'}} className='btn' variant="primary" type="file" onChange={fileSelected} />
          </span>
          </div>
          <textarea placeholder="Paste ABC text here" value={list} onChange={function(e) {setList(e.target.value)}} style={{width:'100%', minHeight: '10em', clear:'both'}}  />
        </Modal.Body> : ''}
        
        
        {message &&
        <>
        <Modal.Body> 
          {message}
        </Modal.Body> 
        <Modal.Footer>
          <Button  variant="success" onClick={handleClose} >OK</Button>
        </Modal.Footer>
        </>}
      </Modal>
    </>
  );
}
export default ImportAbcModal
