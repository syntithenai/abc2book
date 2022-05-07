import {useState} from 'react'
import {Button, Modal, ListGroup} from 'react-bootstrap'
import BookSelectorModal from './BookSelectorModal'

function ImportCollectionModal(props) {
  
  
  const [show, setShow] = useState(false);
  var [filter, setFilter] = useState('')
  var [list, setList] = useState('')
  var [tuneBook, setTuneBook] = useState('')
  var [duplicates, setDuplicates] = useState([])
  var [message, setMessage] = useState(null)
  const [options, setOptions] = useState(getOptions());
  
  const handleClose = () => {
      setMessage(null)
      setFilter('')
      setDuplicates(null)
      setShow(false);
      props.closeParent()
      props.forceRefresh()
  }
  const handleShow = () => setShow(true);
  
  var filterChangeTimeout = null
  
  function filterChange(e) {
    setFilter(e.target.value)
    if (e.target.value.trim() === '') {
      setOptions(getOptions())
    } else {
      if (filterChangeTimeout) clearTimeout(filterChangeTimeout) 
      filterChangeTimeout = setTimeout(function() {
        setOptions(getSearchOptions(e.target.value))
      },500)
    }
  } 
  function getOptions() {
        var final = {}
        Object.keys(props.tunebook.curatedTuneBooks).forEach(function(tuneBookKey) {
            final[tuneBookKey] = tuneBookKey
        })
        return final
    }
    
    function getSearchOptions(filter) {
      //console.log('search cur')
        var opts = getOptions()
        var filtered = {}
        Object.keys(opts).forEach(function(key) {
            var val = opts[key]
            if (!filter || filter.trim() === '')  {
              filtered[key] = val
            } else if (val && val.indexOf(filter) !== -1) {
                filtered[key] = val
            }
        })
        //console.log('search cur', filtered)
        return filtered
    }
  
  function doImport(collection) {
    console.log('import')
    var [inserts, updates, duplicates] = props.tunebook.importCollection(collection, props.currentTuneBook)
    console.log('imported',inserts,updates,duplicates)
    //setMessage(null)
    
    if (duplicates.length > 0) {
          console.log('import dup', duplicates)

      setDuplicates(duplicates)
      setMessage(<div>
        {inserts.length > 0 && <div style={{color:'red'}} >Inserted {inserts.length} tunes</div>}
        {updates.length > 0 && <div style={{color:'red'}}>Updated {updates.length} tunes</div>}
        Skipped {duplicates.length} duplicate tunes<Button style={{marginLeft:'1em'}}  variant="primary" onClick={function(e) {forceImport(duplicates)}}>Import Duplicates</Button></div>
      )
    } else {
      console.log('import ok', inserts, updates)
      //setList('')
      //props.forceRefresh()
      setMessage(<>
        {inserts.length > 0 && <div style={{color:'red'}} >Inserted {inserts.length} tunes</div>}
        {updates.length > 0 && <div style={{color:'red'}}>Updated {updates.length} tunes</div>}
      </>)
    }
  }
  
  function forceImport(duplicates) {
    var [inserts, updates, d] = props.tunebook.importAbc(duplicates.map(function(d) {return props.tunebook.abcTools.json2abc(d) }).join("\n"), props.currentTuneBook, true)
     setMessage(<>
      {<div style={{color:'red'}} >Inserted {inserts.length} tunes</div>}
    </>)
  }
      
  function fileSelected (event) {
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
      <Button style={{color:'black'}} variant='primary' onClick={handleShow} >{props.tunebook.icons.folderin} Book</Button>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title> Import a curated book</Modal.Title>
          
        </Modal.Header>
        {message ? <div>
          <Modal.Body>{message}</Modal.Body>
          <Modal.Footer><Button variant="success" onClick={handleClose} >OK</Button></Modal.Footer>
        </div>
          : <>
        <Modal.Body>
          <input type='text' value={filter} onChange={filterChange}  autoFocus />
          {props.extraButtons && <span>{props.extraButtons}</span>}
        </Modal.Body>
        <Modal.Footer>
          <ListGroup  style={{clear:'both', width: '100%'}}>
            {Object.keys(options).map(function(option,tk) {
              return <ListGroup.Item  key={tk} className={(tk%2 === 0) ? 'even': 'odd'} onClick={function(e) {doImport(option); }} >{options[option]}</ListGroup.Item>
            })}
          </ListGroup>
        </Modal.Footer></>}
      </Modal>
    </>
  );
  
  
  return (
    <>
      <Button  style={{color:'black'}}  variant="success" onClick={handleShow}>
        {props.tunebook.icons.folderin} Collection
      </Button>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Import a curated collection</Modal.Title>
        </Modal.Header>
        {(!message) ? <Modal.Body>
          <div style={{backgroundColor:'lightblue', padding:'0.3em', height:'7em'}} >
            <div style={{borderBottom:'1px solid black', marginBottom:'1em', padding:'0.3em'}} > 
              Import into &nbsp;&nbsp;
              <BookSelectorModal  forceRefresh={props.forceRefresh} title={'Select a Book'} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  tunebook={props.tunebook} value={tuneBook} onChange={function(val) { ;props.setCurrentTuneBook(val)}} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions}   triggerElement={<Button variant="primary" >Book {props.currentTuneBook ? <b>{props.currentTuneBook}</b> : ''}</Button>}  />
            </div>
            
            {(list.trim().length > 0) ? <Button style={{float:'left', marginBottom:'0.5em'}} variant="primary" onClick={function() {doImport(list)}}>Import</Button> : <Button style={{float:'left', marginBottom:'0.5em'}} variant="secondary" >Import</Button>}
            
            <span style={{marginLeft:'0.5em',width:'30%', float:'left'}} >
              <input  style={{float:'left'}} className='btn' variant="primary" type="file" onChange={fileSelected} />
            </span>
          </div>
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
export default ImportCollectionModal