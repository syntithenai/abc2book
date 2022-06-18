import {useState} from 'react'
import {Button, Modal, Badge, Tabs, Tab} from 'react-bootstrap'
import BookSelectorModal from './BookSelectorModal'
import {Fraction} from '../Fraction'


function AddSongModal(props) {
  const [show, setShow] = useState(props.show ==="addTune");
  const [songTitle, setSongTitle] = useState('')
  const [songMeter, setSongMeter] = useState('')
  const [songWords, setSongWords] = useState('')
  const [songChords, setSongChords] = useState('')
  const [songComposer, setSongComposer] = useState('')
  const [songNotes, setSongNotes] = useState('')
  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);
  const boostUp = () => {}
  const boostDown = () => {}
  
  
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
  
  function addTune() {
    var cleanNotes = songNotes.split("\n").filter(function(line) {
        if (props.tunebook.abcTools.isNoteLine(line)) {
          return true
        } else {
          return false
        }
    })
    var t = {name:songTitle, books :(props.currentTuneBook ? [props.currentTuneBook] : []), voices: { '1': {meta:'',notes: cleanNotes}}, words: songWords.trim().split("\n"), composer: songComposer, meter:songMeter}
    //console.log('ADD TUNE',t)
    props.tunebook.saveTune(t); 
    props.setFilter('') ; 
    setSongTitle('')
    setSongWords('')
    setSongNotes('')
    setSongComposer('')
    setSongMeter('')
    setSongChords('')
    props.forceRefresh()
    // force refresh list
    var finalTuneBook=props.currentTuneBook
    props.setCurrentTuneBook('')
    setTimeout(function() {
      props.setCurrentTuneBook(finalTuneBook)
      setTimeout(function() {
        props.tunebook.utils.scrollTo('bottomofpage')
      },100)
    },300)
    //props.updateList(songTitle,props.currentTuneBook)
    handleClose() 
  }

  return (
    <>
      <Button variant="success" onClick={handleShow}>
        {props.tunebook.icons.fileadd}
      </Button>

      <Modal show={show} onHide={handleClose} backdrop="static"  keyboard="false" >
        <Modal.Header closeButton>
          <Modal.Title>Add a tune</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div style={{marginLeft:'0.3em'}} >{(songTitle.length > 0) &&<Button style={{float:'right'}}  variant="success" onClick={addTune} >Add</Button>}
          {(songTitle.length === 0) &&<Button style={{float:'right'}} variant="secondary" >Add</Button>}
           <div>Add tune to <BookSelectorModal  forceRefresh={props.forceRefresh} title={'Select a Book'} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  tunebook={props.tunebook} value={props.currentTuneBook} onChange={function(val) {props.setCurrentTuneBook(val)}} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions} triggerElement={<Button style={{marginLeft:'1em'}} >Book {(props.currentTuneBook ? <b>{props.currentTuneBook}</b> : '')} </Button>}   />
           </div>
           <br/>
          <label>Title <input type="text" value={songTitle} onChange={function(e) {setSongTitle(e.target.value) }} /></label>
          <label style={{display:'block'}}>  Meter <select  value={songMeter} onChange={function(e) {setSongMeter(e.target.value) }} >
          <option></option>
          <option>4/4</option>
          <option>3/4</option>
          <option>2/4</option>
          <option>6/8</option>
          <option>9/8</option>
          </select></label>
          <label>Composer <input type="text" value={songComposer} onChange={function(e) {setSongComposer(e.target.value) }} /></label>
          
          </div>
          <label>Lyrics&nbsp;&nbsp;
          {songTitle && <a target="_new" href={"https://www.google.com/search?q=lyrics "+songTitle + ' '+(songComposer ? songComposer : '') + (songWords ? ' ' + songWords.slice(0,50) : '')} ><Button>Search Lyrics</Button></a>}
          <textarea  value={songWords} onChange={function(e) {setSongWords(e.target.value) }} rows='4' style={{width:'100%'}}/></label>
          <Tabs defaultActiveKey={songMeter ? "chords" : "notes"} id="chordstab"  >
            {songMeter && <Tab eventKey="chords" title="Chords" >
              <label>Chords&nbsp;&nbsp;
              {songTitle && <a target="_new" href={"https://www.google.com/search?q=chords "+songTitle + ' '+(songComposer ? songComposer : '')} ><Button>Search Chords</Button></a>}
              <textarea  value={songChords} onChange={function(e) {setSongChords(e.target.value); var c = renderChords(); console.log(c); if (c) {setSongNotes(c.join("\n"))} }} rows='8' style={{width:'100%'}}/></label>
            </Tab>}
            <Tab eventKey="notes" title="Notes">
              <label>ABC Notes<textarea  value={songNotes} onChange={function(e) {setSongNotes(e.target.value) }} rows='8' style={{width:'100%'}}/></label>
            </Tab>
          </Tabs>
        </Modal.Body>
      </Modal>
    </>
  );
}
export default AddSongModal
