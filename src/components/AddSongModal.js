import {useState, useEffect} from 'react'
import {ListGroup, Button, Modal, Badge, Tabs, Tab, ButtonGroup, Form, Row, Col} from 'react-bootstrap'
import BookSelectorModal from './BookSelectorModal'
import {Fraction} from '../Fraction'
import {useNavigate} from 'react-router-dom'
import YouTubeSearchModal from './YouTubeSearchModal'    
import AsyncCreatableSelect from 'react-select/async-creatable';
import CreatableSelect from 'react-select/creatable';
import useMusicBrainz from '../useMusicBrainz'
import TagsSelectorModal from './TagsSelectorModal'
import Abc from './Abc'

function AddSongModal(props) {
    //console.log('props.tagFilter',props.tagFilter)
  const navigate = useNavigate()
  const musicBrainz = useMusicBrainz()
  const [show, setShow] = useState(props.show ==="addTune");
  const [songTitle, setSongTitle] = useState('')
  const [songTags, setSongTags] = useState()
  const [songMeter, setSongMeter] = useState('')
  const [songRhythm, setSongRhythm] = useState('')
  const [songWords, setSongWords] = useState('')
  const [songChords, setSongChords] = useState('')
  const [songComposer, setSongComposer] = useState('')
  const [songComposerId, setSongComposerId] = useState('')
  const [songNotes, setSongNotes] = useState('')
  const [songImage, setSongImage] = useState(null)
  const [songMedia, setSongMedia] = useState(null)
  const [worksOptions, setWorksOptions] = useState([])
  const [timeSignatureOptions, setTimeSignatureOptions] = useState([])
  const [rhythmTypeOptions, setRhythmTypeOptions] = useState([])
  const [forceNewTune, setForceNewTune] = useState(false)
  const [matchingTunes, setMatchingTunes] = useState([])
  const [indexMatches, setIndexMatches] = useState([])
  const [settings, setSettings] = useState(null)
  
  
  
  
  useEffect(function() {
      setSongTags(Array.isArray(props.tagFilter) ? props.tagFilter : [])
  },[props.tagFilter])
  
  useEffect(function() {
      setSongTags(Array.isArray(props.tagFilter) ? props.tagFilter : [])
      var tso = props.tunebook.abcTools.getTimeSignatureTypes().map(function(type,key) {
        return {value:type, label: type}
      })
      tso.unshift({value:'', label: 'None'})
      setTimeSignatureOptions(tso)
      
      var rto = Object.keys(props.tunebook.abcTools.getRhythmTypes()).map(function(type,key) {
        return {value:type, label: type}
      })
      rto.unshift({value:'', label: 'None'})
      setRhythmTypeOptions(rto)
      
  },[])
  
  useEffect(function() {
      //console.log('composer change', songComposerId)  
      if (songComposerId) {
        musicBrainz.worksByArtist(songComposerId, songTitle).then(function(works) {
          //console.log('works',works)  
          var filterWorks = works.map(function(work) {
              return {value:work.title, label:work.title}
          })
          filterWorks.sort(function(a,b) {
            return (a && b && a.label < b.label)  ? 1 : -1
          })
          //console.log('f works',filterWorks)  
          setWorksOptions(filterWorks)
        })
      } else {
          setWorksOptions([])
      }
  },[songComposerId])
  
  const handleClose = () => {
      setShow(false);
      setForceNewTune(false)
      setSongTitle('')
      clearForm()
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
       setSettings(null)
    if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(true)
   }, [])

  
  useEffect(function() {
      
      if (songTitle.length > 1 && props.tunes) {
          const matching = Object.values(props.tunes).filter(filterSearch).sort(function(a,b) {
            return (a && b && a.name < b.name)  ? -1 : 1
          })
          setMatchingTunes(matching)
          setForceNewTune(false)
          //console.log('set tunes',songTitle,matching,props.tunes)
      } else {
          setMatchingTunes([])
          //console.log('clear tunes')
      }
      // matching from resources
      if (songTitle.trim()) { 
          props.searchIndex(songTitle,function(data) {
              //console.log("SE",data)
              setIndexMatches(data)  
          })
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
  
  function selectSetting(setting) {
        //console.log('select setting ', setting, props.currentTune)
        var tune = props.tunebook.abcTools.abc2json(setting)
        tune.books = (props.currentTuneBook ? [props.currentTuneBook] : [])
        tune.tags = songTags
        tune.composer = songComposer
        tune.rhythm = songRhythm 
        tune.meter = songMeter
        tune.files = (songImage ? [{data:songImage,type:'image'}] : [])
        tune.links = (songMedia ? [{link:songMedia}] : [])
        setSettings(null)
        
        var newTune = props.tunebook.saveTune(tune); 
        props.setFilter('') ; 
        setSettings(null)
        setSongTitle('')
        clearForm()
        setSongChords({})
        props.forceRefresh()
        // force refresh list
        var finalTuneBook=props.currentTuneBook
        props.setCurrentTuneBook('')
        setTimeout(function() {
          props.setCurrentTuneBook(finalTuneBook)
          if (newTune && newTune.id) {   
            navigate("/editor"+"/" + newTune.id)
          } else {
              navigate("/tunes")
          }
        },800)
        handleClose() 
  }
  
  function addTuneToBook(tune, book) {
    var books = Array.isArray(tune.books) ? tune.books : []
    books.push(book.toLowerCase())
    tune.books = [...new Set(books)]
    props.tunebook.saveTune(tune); 
    props.setFilter('') ; 
    setSongTitle('')
    setSettings(null)
    clearForm()
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
    var t = {name:songTitle, tags: songTags, books :(props.currentTuneBook ? [props.currentTuneBook] : []), voices: { '1': {meta:'',notes: cleanNotes}}, words: songWords.trim().split("\n"), composer: songComposer, rhythm: songRhythm, meter:songMeter, files:(songImage ? [{data:songImage,type:'image'}] : []), links:(songMedia ? [{link:songMedia}] : [])}
    //console.log('ADD TUNE',t)
    var newTune = props.tunebook.saveTune(t); 
    props.setFilter('') ; 
    setSettings(null)
    setSongTitle('')
    clearForm()
    setSongChords({})
    props.forceRefresh()
    // force refresh list
    var finalTuneBook=props.currentTuneBook
    props.setCurrentTuneBook('')
    setTimeout(function() {
      props.setCurrentTuneBook(finalTuneBook)
      if (newTune && newTune.id) {   
        navigate("/editor"+"/" + newTune.id)
      } else {
          navigate("/tunes")
      }
    },800)
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
  
  
  function clearForm() {
      setSongTags([])
      setSongRhythm('')
      setSongMeter('')
      setSongWords('')
      setSettings(null)
      setSongChords('')
      setSongComposer('')
      setSongComposerId('')
      setSongNotes('')
      setSongImage(null)
      setSongMedia (null)
  }
  

  
//<YouTubeSearchModal onClick={props.handleClose} tunebook={props.tunebook} links={props.tune.links}  onChange={function(links) {
                    //var tune = props.tune
                    //tune.links = links; 
                    //props.tunebook.saveTune(tune); 
                //}}
                //setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts} 
                //triggerElement={<>Search YouTube</>}
                //value={(props.tune.name ? props.tune.name : '') + (props.tune.composer ? ' ' + props.tune.composer : '')}
            ///>
    return (
    <>
      <Button variant="success" title="Add Tune" onClick={handleShow}>
        {props.tunebook.icons.fileadd} Add 
      </Button>

      <Modal show={show} onHide={handleClose} backdrop="static"  keyboard="false" >
      
      {settings !== null && 
          <>
          <Modal.Header closeButton>
          <Modal.Title>Pick a setting</Modal.Title>
          
          </Modal.Header>
         <Modal.Body>
          <ListGroup  style={{clear:'both', width: '100%'}}>
          {settings.map(function(setting, sk) {
            var tune = props.tunebook.abcTools.abc2json(setting)
            var useSetting = props.tunebook.abcTools.json2abc_cheatsheet(tune)
            return <div key={sk} >
              <Button  style={{float:'right'}} onClick={function(e) {
                   selectSetting(setting); 
                setShow(false)
              }} > Select</Button>
              
             
              
              <Abc abc={useSetting}  tunebook={props.tunebook} />
              <hr style={{width:'100%'}} />
            </div>
          })}</ListGroup>
          </Modal.Body>   
         
          </>
        }
      
      { settings === null && <>
        <Modal.Header closeButton>
          <Modal.Title>Add a Tune </Modal.Title>
        </Modal.Header>
        <Modal.Body>
            {(songTitle.length > 0 && forceNewTune) &&<Button size="lg" style={{marginLeft:'1em',float:'right'}}  variant="success" onClick={addTune} >{props.tunebook.icons.add} Add</Button>}
            {!(songTitle.length > 0 && forceNewTune) &&<Button size="lg" style={{marginLeft:'1em',float:'right'}} variant="secondary" >{props.tunebook.icons.add} Add</Button>}
             
            <div>Add tune to &nbsp;&nbsp;&nbsp;
               <ButtonGroup variant="primary"  style={{ backgroundColor: '#3f81e3', borderRadius:'10px' , width: 'fit-content'}}>{props.currentTuneBook ? <Button  onClick={function(e) {props.setCurrentTuneBook('');  props.forceRefresh(); }} >{props.tunebook.icons.closecircle}</Button> : ''}<BookSelectorModal  forceRefresh={props.forceRefresh} title={'Select a Book'} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  tunebook={props.tunebook} value={props.currentTuneBook} onChange={function(val) {props.setCurrentTuneBook(val)}} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions} triggerElement={<Button style={{marginLeft:'0.1em', color:'black'}} >{props.tunebook.icons.book} {(props.currentTuneBook ? <b>{props.currentTuneBook}</b> : '')}</Button>}   />
               </ButtonGroup>
           </div>
           
           <div style={{clear:'both'}} >
               <Form.Group className="mb-3" controlId="tags">
                   <Form.Label>Tags</Form.Label>
                   <div style={{clear:'both'}} ></div>
                   <span>
                   <TagsSelectorModal  forceRefresh={props.forceRefresh} tunebook={props.tunebook} setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}  defaultOptions={props.tunebook.getTuneTagOptions} searchOptions={props.tunebook.getSearchTuneTagOptions}  value={songTags}  onChange={function(value) {setSongTags(value) ; props.setTagFilter(value) }} showTags={true} />
                   <span >{Array.isArray(songTags) && songTags.map(function(selectedTag) {
                      return <Button key={selectedTag} style={{marginLeft:'0.2em'}} variant="outline-info" >{selectedTag}</Button>
                    })}</span>
                    </span>
               </Form.Group > 
           </div> 
           
        </Modal.Body>
        <hr/>
        <Modal.Body > 
            <div style={{marginLeft:'0.3em'}} >
               
           
           
           
           <div style={{clear:'both'}} ></div>
           <Form>
           
           <Form.Group className="mb-3" controlId="composer">
                <Form.Label>Composer </Form.Label>
                <AsyncCreatableSelect
                         
                            value={songComposer ? {value:songComposerId, label:songComposer} : {value:'', label:''}}
                            onChange={function(val,type) {setSongComposerId(val.value); setSongComposer(val.label)  }}
                            defaultOptions={[]} loadOptions={musicBrainz.artistOptions}
                            isClearable={false}
                            blurInputOnSelect={true}
                            createOptionPosition={"first"}
                            allowCreateWhileLoading={true}
                            styles={{
                                control: (baseStyles, state) => ({
                                  ...baseStyles,
                                  minWidth: '400px',
                                }),
                            }}
                          />
            </Form.Group>
           
          <Form.Group className="mb-3" controlId="title">
                <Form.Label>Title</Form.Label>
                 <Form.Control type="text" value={songTitle} autoComplete={"off"} onChange={function(e) {setSongTitle(e.target.value) }} />
          </Form.Group>
          {!forceNewTune && <>
               <ListGroup >
                  <ListGroup.Item variant="success"  onClick={function() {clearForm(); setForceNewTune(true)}}>
                        New Tune
                  </ListGroup.Item>
                  {matchingTunes.map(function(tune,tk) {
                      return <ListGroup.Item key={tk} disabled={props.currentTuneBook ? false : true} variant="primary" action onClick={function() {addTuneToBook(tune,props.currentTuneBook)}}>
                        {tune.name}
                      </ListGroup.Item>
                  })}
                </ListGroup>
          </>}
          {!forceNewTune && <>
               <ListGroup >
                  {worksOptions.filter(function(work) {
                        if (!songTitle) return true
                        if (work && work.label && work.label.toLowerCase().indexOf(songTitle.toLowerCase()) !== -1) {
                            return true
                        }
                        return false
                      }).sort(function(a,b) {
                          return (a && b && a.label < b.label) ? -1 : 1
                      }).map(function(work,tk) {
                      return <ListGroup.Item key={tk} disabled={props.currentTuneBook ? false : true} variant="info"  onClick={function() {
                        //addTuneToBook({name:work.label, composer: songComposer, tags: songTags,books :(props.currentTuneBook ? [props.currentTuneBook] : []) , notes:[] , voices:{} ,words: [] ,links: []},props.currentTuneBook); return false  
                          setForceNewTune(true)
                          setSongTitle(work.label)
                          props.forceRefresh()
                        } }>
                        {work.label}
                      </ListGroup.Item>
                  })}
                </ListGroup>
          </>}
          {!forceNewTune && <>
               <ListGroup >
                    {indexMatches.map(function(work,tk) {
                      return <ListGroup.Item key={tk} disabled={props.currentTuneBook ? false : true} variant="outline-info"  onClick={function() {
                        //addTuneToBook({name:work.label, composer: songComposer, tags: songTags,books :(props.currentTuneBook ? [props.currentTuneBook] : []) , notes:[] , voices:{} ,words: [] ,links: []},props.currentTuneBook); return false  
                          setForceNewTune(true)
                          setSongTitle(work.name)
                          props.loadTuneTexts(work.ids).then(function(texts) {
                              setSettings(texts)
                                props.forceRefresh()
                          });
                           //setSettings()
                           
                        } }>
                        {work.name}
                      </ListGroup.Item>
                  })}
                </ListGroup>
          </>}
          {forceNewTune && <>
              <hr/>
              <Row>
              <Col>
                <Form.Label>Rhythm</Form.Label>
              
                <CreatableSelect
                    value={songRhythm ? {value:songRhythm, label:songRhythm} : {value:'', label:''}}
                    onChange={function(val) {setSongRhythm(val.value); if(props.tunebook.abcTools.timeSignatureFromTuneType(val.value)) {setSongMeter(props.tunebook.abcTools.timeSignatureFromTuneType(val.value))}}}
                    options={rhythmTypeOptions}
                    isClearable={true}
                    blurInputOnSelect={true}
                    createOptionPosition={"first"}
                    allowCreateWhileLoading={true}
                    styles={{
                        control: (baseStyles, state) => ({
                          ...baseStyles,
                          minWidth: '400px',
                        }),
                    }}
                 />
              </Col>
              <Col>
                <Form.Label>Time Signature</Form.Label>
                <CreatableSelect
                    value={songMeter ? {value:songMeter, label:songMeter} : {value:'', label:''}}
                    onChange={function(val) {setSongMeter(val.value)  }}
                    options={timeSignatureOptions}
                    isClearable={true}
                    blurInputOnSelect={true}
                    createOptionPosition={"first"}
                    allowCreateWhileLoading={true}
                    styles={{
                        control: (baseStyles, state) => ({
                          ...baseStyles,
                          minWidth: '400px',
                        }),
                    }}
                  />
              </Col>
              </Row>
              <hr/>
              <Form.Group className="mb-3" controlId="lyrics">
                <Form.Label>Lyrics</Form.Label>
                  {songTitle && <a target="_new" href={"https://www.google.com/search?q=lyrics "+songTitle + ' '+(songComposer ? songComposer : '') + (songWords ? ' ' + songWords.slice(0,50) : '')} ><Button>Search Lyrics</Button></a>}
                  <Form.Control as='textarea'  value={songWords} onChange={function(e) {setSongWords(e.target.value) }} rows='4' style={{width:'100%'}}/>
              </Form.Group>
              
              {localStorage.getItem('bookstorage_inlineaudio') === "true" && <>
                  <hr/>
              <Form.Group className="mb-3" controlId="image">
                <Form.Label>Image</Form.Label>
                <Form.Control type='file' onChange={imageSelected}/>
                {songImage && <img style={{width:'150px'}} src={songImage}  />}
              </Form.Group>
              <hr/>
              <label>Media&nbsp;&nbsp;
                <input type='file' onChange={mediaSelected} />
                <YouTubeSearchModal onClick={props.handleClose} tunebook={props.tunebook}   onChange={function(link) {
                    setSongMedia(link.link)
                }}
                setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts} 
                triggerElement={<>Search YouTube</>}
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
            </Form>
            </div>
        </Modal.Body></>}
        
      </Modal>
    </>
  );
}
export default AddSongModal
