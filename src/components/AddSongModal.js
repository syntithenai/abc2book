import {useState, useEffect} from 'react'
import {ListGroup, Button, Modal, Badge, Tabs, Tab, ButtonGroup} from 'react-bootstrap'
import BookSelectorModal from './BookSelectorModal'
import {Fraction} from '../Fraction'
import {useNavigate} from 'react-router-dom'
import YouTubeSearchModal from './YouTubeSearchModal'    


function AddSongModal(props) {
  const navigate = useNavigate()
  const [show, setShow] = useState(props.show ==="addTune");
  const [songTitle, setSongTitle] = useState('')
  const [songMeter, setSongMeter] = useState('')
  const [songWords, setSongWords] = useState('')
  const [songChords, setSongChords] = useState('')
  const [songComposer, setSongComposer] = useState('')
  const [songNotes, setSongNotes] = useState('')
  const [songImage, setSongImage] = useState(null)
  const [songMedia, setSongMedia] = useState(null)
  
  const handleClose = () => {
      setShow(false);
      setForceNewTune(false)
      setSongTitle('')
      setSongMeter('')
      setSongWords('')
      setSongChords('')
      setSongComposer('')
      setSongNotes('')
      setSongImage(null)
      setSongMedia (null)
      if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(false)
  }
  const handleShow = () => setShow(true);
  const boostUp = () => {}
  const boostDown = () => {}
  
  
    function filterSearch(tune) {
        //console.log('filterSearch',props.currentTuneBook,filter)
        var filterOk = false
        if (!songTitle || songTitle.trim().length < 2) {
            filterOk = false
        } else {
            if (tune && tune.name && tune.name.length > 0 && songTitle.length > 0 && props.tunebook.utils.toSearchText(tune.name).indexOf(props.tunebook.utils.toSearchText(songTitle)) !== -1) {
                filterOk = true
            } 
        }
        return filterOk
    
    }
  
   useEffect(function() {
    if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(true)
   }, [])

  
  const [forceNewTune, setForceNewTune] = useState(false)
  const [matchingTunes, setMatchingTunes] = useState([])
  useEffect(function() {
      //console.log(props.tunes)
      if (songTitle.length > 1 && props.tunes) {
          setMatchingTunes(Object.values(props.tunes).filter(filterSearch))
          setForceNewTune(false)
      } else {
          setMatchingTunes([])
      }
  },[songTitle])
  
  function renderChords() {
    //const parsed = props.tunebook.abcTools.parseAbcToBeats("X:1\nK:G\n"+songNotes)
    var totals = [], notes  = [], chordArray  = [], preTexts = []
    var meterParts = songMeter ? songMeter.trim().split("/") : ['4','4']
    if (meterParts.length === 2) {
        var chordTextParsed = props.tunebook.abcTools.parseChordText(songChords,songMeter)
        chordTextParsed.map(function(line, lineNumber) {
        
            line.map(function(bar,bk) {
                var meterFraction = new Fraction(meterParts[0],meterParts[1])
                var noteLengthsPerBar = meterFraction.divide(props.tunebook.abcTools.getNoteLengthFraction()).numerator
                 //console.log(meterParts,"BAR",lineNumber, bk,"/",noteLengthsPerBar, bar)
                 if (!Array.isArray(chordArray[lineNumber])) chordArray[lineNumber] = []
                 if (!Array.isArray(chordArray[lineNumber][bk])) chordArray[lineNumber][bk] = []
                 // take the whole bar of chords
                 chordArray[lineNumber][bk] = bar
                 //console.log("BBB",bar)
                 // if more chords than notes add notes as rests to fill
                 if (!Array.isArray(notes[lineNumber])) notes[lineNumber]=[]
                 if (!Array.isArray(notes[lineNumber][bk])) {
                     notes[lineNumber][bk] = Array(noteLengthsPerBar + 1)
                     for (var k = 0; k < noteLengthsPerBar; k++) {
                        notes[lineNumber][bk][k] = ['z']
                     }
                     notes[lineNumber][bk][noteLengthsPerBar] = ["|"]
                    //  notes[lineNumber][bk] = [['z']]
                 }
                 // ensure tailing bar line
                 //if (bk === (line.length - 1)) {
                     //var lastBeatNumber = notes[lineNumber][bk].length - 1
                     //var lastBeat = notes[lineNumber][bk][lastBeatNumber]
                     //var barPos = lastBeat.indexOf('|')
                     //console.log('ensure',lineNumber,bk, lastBeatNumber,lastBeat,"P",barPos ,"N", notes[lineNumber][bk])
                     //if (barPos === -1) {
                        //notes[lineNumber][bk][noteLengthsPerBar-1].push("|")
                     //}
                 //}
            })
        })
        
        var final = props.tunebook.abcTools.renderAllChordsAndNotes(chordArray, notes, preTexts).split("\n")
        return final
    }
  }
  
  function addTuneToBook(tune, book) {
    var books = tune.books
    books.push(book.toLowerCase())
    tune.books = [...new Set(books)]
    props.tunebook.saveTune(tune); 
    props.setFilter('') ; 
    setSongTitle('')
    setSongWords('')
    setSongNotes('')
    setSongComposer('')
    setSongMeter('')
    setSongChords('')
    setSongImage(null)
    setSongMedia(null)
    props.forceRefresh()
    // force refresh list
    var finalTuneBook=props.currentTuneBook
    props.setCurrentTuneBook('')
    setTimeout(function() {
      props.setCurrentTuneBook(finalTuneBook)
      navigate("/tunes")
      //setTimeout(function() {
        //props.tunebook.utils.scrollTo('bottomofpage')
      //},100)
    },800)
    //props.updateList(songTitle,props.currentTuneBook)
    handleClose() 
  }
  
  
  function addTune() {
    var cleanNotes = songNotes.split("\n").filter(function(line) {
        if (props.tunebook.abcTools.isNoteLine(line)) {
          return true
        } else {
          return false
        }
    })
    var t = {name:songTitle, books :(props.currentTuneBook ? [props.currentTuneBook] : []), voices: { '1': {meta:'',notes: cleanNotes}}, words: songWords.trim().split("\n"), composer: songComposer, meter:songMeter, files:(songImage ? [{data:songImage,type:'image'}] : []), links:(songMedia ? [{link:songMedia}] : [])}
    console.log('ADD TUNE',t)
    props.tunebook.saveTune(t); 
    props.setFilter('') ; 
    setSongTitle('')
    setSongWords('')
    setSongNotes('')
    setSongComposer('')
    setSongMeter({})
    setSongChords({})
    props.forceRefresh()
    // force refresh list
    var finalTuneBook=props.currentTuneBook
    props.setCurrentTuneBook('')
    setTimeout(function() {
      props.setCurrentTuneBook(finalTuneBook)
      navigate("/tunes")
      //setTimeout(function() {
        //props.tunebook.utils.scrollTo('bottomofpage')
      //},100)
    },800)
    //props.updateList(songTitle,props.currentTuneBook)
    handleClose() 
  }
  
  function imageSelected (event) {
      function readFile(file){
          var reader = new FileReader();
          reader.onloadend = function(){
              //console.log("loaded",reader.result)
            if (reader.result.trim().length > 0) {
              setSongImage(reader.result)
            }
          }
          if(file){
              reader.readAsDataURL(file);
          }
      }
      readFile(event.target.files[0])
  }
   function isYoutubeLink(urlToParse){
       
            if (urlToParse) {
                var regExp = /^(?:https?:\/\/)?(?:m\.|www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})(?:\S+)?$/;
                if (urlToParse.match(regExp)) {
                    return true;
                }
            }
            return false;
        }
        
  function mediaSelected (event) {
      function readFile(file){
          var reader = new FileReader();
          reader.onloadend = function(){
              //console.log("loaded",reader.result)
            if (reader.result.trim().length > 0) {
              setSongMedia(reader.result)
            }
          }
          if(file){
              reader.readAsDataURL(file);
          }
      }
      readFile(event.target.files[0])
  }
  
//<YouTubeSearchModal onClick={props.handleClose} tunebook={props.tunebook} links={props.tune.links}  onChange={function(links) {
                    //var tune = props.tune
                    //tune.links = links; 
                    //props.tunebook.saveTune(tune); 
                //}}
                //setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts} 
                //triggerElement={<>{props.tunebook.icons.youtube} Search YouTube</>}
                //value={(props.tune.name ? props.tune.name : '') + (props.tune.composer ? ' ' + props.tune.composer : '')}
            ///>
  return (
    <>
      <Button variant="success" title="Add Tune" onClick={handleShow}>
        {props.tunebook.icons.fileadd} Add
      </Button>

      <Modal show={show} onHide={handleClose} backdrop="static"  keyboard="false" >
        <Modal.Header closeButton>
          <Modal.Title>Add a Tune</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div style={{marginLeft:'0.3em'}} >{(songTitle.length > 0 && forceNewTune) &&<Button style={{float:'right'}}  variant="success" onClick={addTune} >Add</Button>}
          {(songTitle.length === 0) &&<Button style={{float:'right'}} variant="secondary" >Add</Button>}
           <div>Add tune to &nbsp;&nbsp;&nbsp;<ButtonGroup variant="primary"  style={{ backgroundColor: '#3f81e3', borderRadius:'10px' , width: 'fit-content'}}>{props.currentTuneBook ? <Button  onClick={function(e) {props.setCurrentTuneBook('');  props.forceRefresh(); }} >{props.tunebook.icons.closecircle}</Button> : ''}<BookSelectorModal  forceRefresh={props.forceRefresh} title={'Select a Book'} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  tunebook={props.tunebook} value={props.currentTuneBook} onChange={function(val) {props.setCurrentTuneBook(val)}} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions} triggerElement={<Button style={{marginLeft:'0.1em', color:'black'}} >{props.tunebook.icons.book} {(props.currentTuneBook ? <b>{props.currentTuneBook}</b> : '')}</Button>}   />
           </ButtonGroup>
           </div>
           <br/>
          <label>Title <input type="text" value={songTitle} autoFocus={true} onChange={function(e) {setSongTitle(e.target.value) }} /></label>
          {!forceNewTune && <>
               <ListGroup >
                  <ListGroup.Item variant="success" action onClick={function() {setForceNewTune(true)}}>
                        New Tune
                  </ListGroup.Item>
                  {matchingTunes.map(function(tune,tk) {
                      return <ListGroup.Item key={tk} disabled={props.currentTuneBook ? false : true} variant="primary" action onClick={function() {addTuneToBook(tune,props.currentTuneBook)}}>
                        {tune.name}
                      </ListGroup.Item>
                  })}
                </ListGroup>
          </>}
          {forceNewTune && <>
              <label>Composer <input type="text" value={songComposer} onChange={function(e) {setSongComposer(e.target.value) }} /></label>
              
              <label style={{display:'block'}}>  Meter <select  value={songMeter} onChange={function(e) {setSongMeter(e.target.value) }} >
              <option></option>
              <option>4/4</option>
              <option>3/4</option>
              <option>2/4</option>
              <option>6/8</option>
              <option>9/8</option>
              <option>12/8</option>
              </select></label>
              
              
              <label>Lyrics&nbsp;&nbsp;
              {songTitle && <a target="_new" href={"https://www.google.com/search?q=lyrics "+songTitle + ' '+(songComposer ? songComposer : '') + (songWords ? ' ' + songWords.slice(0,50) : '')} ><Button>Search Lyrics</Button></a>}
              <textarea  value={songWords} onChange={function(e) {setSongWords(e.target.value) }} rows='4' style={{width:'100%'}}/></label>
              {localStorage.getItem('bookstorage_inlineaudio') === "true" && <>
                  <hr/>
              <label>Image&nbsp;&nbsp;
                <input type='file' onChange={imageSelected}/>
                {songImage && <img style={{width:'150px'}} src={songImage}  />}
              </label>
              <hr/>
              <label>Media&nbsp;&nbsp;
                <input type='file' onChange={mediaSelected} />
                <YouTubeSearchModal onClick={props.handleClose} tunebook={props.tunebook}   onChange={function(link) {
                    setSongMedia(link.link)
                }}
                setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts} 
                triggerElement={<>{props.tunebook.icons.youtube} Search YouTube</>}
                value={(songTitle) + (songComposer ? ' ' + songComposer : '')}
               />
               
                {(songMedia && !isYoutubeLink(songMedia)) && <audio controls={true} src={songMedia}  />}
              </label>
              <hr/></>}
              <Tabs defaultActiveKey={songMeter ? "chords" : "notes"} id="chordstab"  >
                {songMeter && <Tab eventKey="chords" title="Chords" >
                  <label>Chords&nbsp;&nbsp;
                  {songTitle && <a target="_new" href={"https://www.google.com/search?q=chords "+songTitle + ' '+(songComposer ? songComposer : '')} ><Button>Search Chords</Button></a>}
                  <textarea  value={songChords} onChange={function(e) {setSongChords(e.target.value); var c = renderChords(); if (c) {setSongNotes(c.join("\n"))} }} rows='8' style={{width:'100%'}}/></label>
                </Tab>}
                <Tab eventKey="notes" title="Notes">
                  <label>ABC Notes<textarea  value={songNotes} onChange={function(e) {setSongNotes(e.target.value) }} rows='8' style={{width:'100%'}}/></label>
                </Tab>
              </Tabs>
            </>}
            </div>
        </Modal.Body>
      </Modal>
    </>
  );
}
export default AddSongModal
