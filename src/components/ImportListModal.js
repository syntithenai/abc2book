import {useState} from 'react'
import {Button, Modal} from 'react-bootstrap'
import axios from 'axios'
import BookSelectorModal from './BookSelectorModal'
function ImportListModal(props) {
  const [show, setShow] = useState(false);
  const [list, setList] = useState("drowsy maggie\nthe high reel");
  const handleClose = () => {
      //setMessage(null)
      //setErrors('')
      //setTunes(null)
      setShow(false);
      props.closeParent()
      //props.forceRefresh()
  }
  const handleShow = () => setShow(true);
  var [tuneBook, setTuneBook] = useState('')
  var [started, setStarted] = useState(false)
  const [errorHistory, setErrorHistory] = useState([]);
  const [tunes, setTunes] = useState([]);
  const [message, setMessage] = useState(null)
  
   /** 
   * import songs to a tunebook from an list looked up on thesession.org
   */
  let [importQueue, setImportQueue] = useState([])
  
  function importTuneList(list) {
    if (list && list.trim && list.trim() === '') {
      setTunes([])
      setErrorHistory ([])
      setMessage(null)
      setStarted(false)
      return
    } 
    //setErrorHistory([])
    //console.log('imp list',list)
    var useList = (list && list.trim ? list : '').split("\n")
    useList.forEach(function(songTitle) {
      importQueue.push(songTitle)
    })
    setList('')
    setTunes([])
    setErrorHistory ([])
    setImportQueue(importQueue)
    
    setStarted(true)
    //props.forceRefresh()
    nextImportItem()
  }
  
  function nextImportItem() {   
    if (importQueue.length > 0) {
      var songTitle = importQueue.shift()
      //console.log('next   import item '+songTitle)
      setImportQueue(importQueue)
      
      if (songTitle && songTitle.trim().length > 0) {
        axios.get('https://thesession.org/tunes/search?format=json&perpage=50&q='+songTitle).then(function(searchRes) {
          //console.log(typeof searchRes, searchRes)
          if (searchRes && searchRes.data && searchRes.data.tunes && searchRes.data.tunes.length > 0 && searchRes.data.tunes[0].id) {
            axios.get('https://thesession.org/tunes/' + searchRes.data.tunes[0].id+'?format=json&perpage=50').then(function(res) {
              //console.log('TUNE',res)
              if (res.data) {
                var tune = res.data
                if (Array.isArray(tune.settings) && tune.settings.length > 0) {
                  var count = tune.settings.length -1
                  var found = null
                  // seek last setting with chords
                  while (count >= 0) {
                    if (tune.settings[count] && tune.settings[count].abc && props.tunebook.abcTools.hasChords(tune.settings[count].abc)) {
                      found = tune
                      found.voices = {default: {meta:'', notes: tune.settings[count].abc.split("\n")}}
                      count = -1
                    } else {
                      count --
                    }
                  }
                  // fallback to first setting
                  if (!found) {
                    found = tune
                    found.voices = {default: {meta:'', notes: tune.settings[0].abc.split("\n")}}
                  }
                  var hash = props.tunebook.abcTools.getTuneHash(tune) //hash = props.tunebook.utils.hash(found.notes.join("\n"))
                  //console.log("tryhash",hash,tunesHash.hashes[hash]   )
                  if (props.tunesHash.hashes[hash] === true) {
                    //console.log('dup ',found)
                    errorHistory.push('Duplicate tune '+songTitle)
                    setErrorHistory(errorHistory)
                    props.forceRefresh()
                    nextImportItem()
                  } else {
                    //console.log('imported ',found)
                    props.tunebook.saveTune(found)
                    tunes.push(found)
                    setTunes(tunes)
                    props.forceRefresh()
                    nextImportItem()
                  }
                   
                } else {
                  errorHistory.push('No setting for '+songTitle)
                  setErrorHistory(errorHistory)
                  props.forceRefresh()
                  nextImportItem()
                }
              } else {
                 errorHistory.push('Failed to load '+songTitle)
                 setErrorHistory(errorHistory)
                 props.forceRefresh()
                 nextImportItem()
              }        
              
            })
          } else {
             errorHistory.push('No match for '+songTitle)
             setErrorHistory(errorHistory)
             props.forceRefresh()
             nextImportItem()
          }  
        })
        
      }
    } else {
      onFinished()
       //errors.push({finished:'Imported '+songTitle})
       //setErrors(errors)
       //nextImportItem()
    }  
  }
  
  function onFinished() {
    //console.log('DONE')
    setStarted(false)
    setList('')
    props.forceRefresh()
  }
  
  //function importCallback(cbData) {
    //console.log('IIIIICCCC',cbData)
      //if (cbData && cbData.error) {
        //errors.push(cbData.error)
        //setErrors(errors)
      //} else if (cbData && cbData.tune) {
        //tunes.push(cbData.tune)
        //if (props.tunebook.importQueue && props.tunebook.importQueue.length) {
          //setMessage((props.tunebook.importQueue && props.tunebook.importQueue.length ? props.tunebook.importQueue.length : 0) + " remaining")
        //} else {
          //setMessage((props.tunebook.importQueue && props.tunebook.importQueue.length ? props.tunebook.importQueue.length : 0) + " remaining")
        //}
        //setTunes(tunes)
      //} else if (cbData && cbData.finished) {
        ////onFinished()
        //setMessage('Imported '+tunes.length + ' tunes')
      ////} else if (cbData && cbData.starting) {
        ////setMessage('Importing')
      //}
      //props.forceRefresh()
  //}
  
  //function onFinished() {
    ////setMessage(null)
    ////setList('')
  //}
     
  function fileSelected (event) {
      //console.log('FILESel',event,event.target.files[0]);
      
      //const fileList = event.target.files;
      function readFile(file){
          var reader = new FileReader();
          reader.onloadend = function(){
            //console.log("read"+reader.result )
            if (reader.result.trim().length > 0) {
              setList(reader.result)
              //importListFrom(reader.result)
              var i = document.getElementById('fileselector')
              i.value = null
              props.forceRefresh()
              
            }
          }
          if(file){
              reader.readAsText(file);
          }
      }
      readFile(event.target.files[0])
  }
  
  function importList() {
      //setMessage(' ')
      setErrorHistory([])
      setTunes([])
      importTuneList( list); 
  }
  function importListFrom(from) {
      //setMessage(' ')
      setErrorHistory([])
      setTunes([])
      importTuneList(from); 
  }
  //<>Complete  
                //<Button style={{float:'right'}} onClick={handleClose} variant="success">OK</Button>
                //</>
  const startedBlock = started ? <div style={{clear:'both'}} >Importing  ...</div> : ''
  const errorBlock= <div style={{color: 'red', clear:'both'}} >{Array.isArray(errorHistory) ? errorHistory.map(function (error,k) {
                return <div key={k}>{new String(error)}</div>
              }) : ''}
            </div>
  const progressBlock= (props.tunebook && props.tunebook.importQueue && props.tunebook.importQueue.length) 
                ?  <div style={{ fontWeight:'bold', clear:'both'}} >{props.tunebook.importQueue.length}}  remaining</div>
                : null
  const completeBlock=(tunes && tunes.length)  ?  <div style={{ fontWeight:'bold', clear:'both'}} >{tunes.length}  imported</div> : startedBlock
               
  return (
    <>
      <Button  style={{color:'black'}} variant="primary" onClick={handleShow}>
        {props.tunebook.icons.folderin} List
      </Button>

      <Modal backdrop="static"
        keyboard={false}
        show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Import a list of tunes from thesession.org</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          
          <div style={{backgroundColor:'lightblue', padding:'0.3em', height:'7em'}} >
            <div style={{borderBottom:'1px solid black', marginBottom:'1em', padding:'0.3em'}} > 
              Import into &nbsp;&nbsp;
              <BookSelectorModal  forceRefresh={props.forceRefresh} title={'Select a Book'} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  tunebook={props.tunebook} value={tuneBook} onChange={function(val) {props.setCurrentTuneBook(val)}} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions} triggerElement={<Button variant="primary" >TuneBook {props.currentTuneBook ? <b>{props.currentTuneBook}</b> : ''}</Button>} />
            </div>
            <Button style={{float:'left', marginBottom:'0.5em'}} variant="primary" onClick={importList}>Import</Button>
            <span style={{marginLeft:'0.5em',width:'30%', float:'left'}} ><input id="fileselector" style={{float:'left'}} className='btn' variant="primary" type="file" onChange={fileSelected} /></span>
          </div>
          <div>{message ? message : ''}</div>
          {progressBlock} 
          {completeBlock} 
          {errorBlock}
          <textarea value={list} onChange={function(e) {setList(e.target.value)}} style={{width:'100%', minHeight: '10em', clear:'both'}}  />
        </Modal.Body>
      </Modal>
    </>
  );
}
export default ImportListModal
