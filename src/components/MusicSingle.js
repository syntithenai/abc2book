import {useState, useEffect, useRef} from 'react'
import {Link , useParams , useNavigate} from 'react-router-dom'
import {Button, Dropdown} from 'react-bootstrap'
import Abc from './Abc'
import BoostSettingsModal from './BoostSettingsModal'
//import ReactTags from 'react-tag-autocomplete'
import BookMultiSelectorModal from  './BookMultiSelectorModal'
import TagsSelectorModal from './TagsSelectorModal'
import ShareTunebookModal from './ShareTunebookModal'
import {useSwipeable} from 'react-swipeable'
import ButtonGroup from 'react-bootstrap/ButtonGroup';
import ButtonToolbar from 'react-bootstrap/ButtonToolbar';
import YouTube from 'react-youtube';  
import LinksEditorModal from './LinksEditorModal'
import ViewModeSelectorModal from './ViewModeSelectorModal'
import PlaylistManagerModal from './PlaylistManagerModal'
import abcjs from "abcjs";
//import ParserProblemsDiff from './ParserProblemsDiff'
import useAbcjsParser from '../useAbcjsParser'
import TitleAndLyricsEditorModal from './TitleAndLyricsEditorModal'
import MediaSeekSlider from '../components/MediaSeekSlider'
import MediaPlayerMedia from '../components/MediaPlayerMedia'
  //return (
    //<ReactTags
      //ref={reactTags}
      //tags={tags}
      //suggestions={suggestions}
      //onDelete={onDelete}
      //onAddition={onAddition}
    ///>
  //)

export default function MusicSingle(props) {
    let params = useParams();
    let navigate = useNavigate();
    const audioPlayer = useRef(); 
    //var youtubeProgressInterval = useRef()
    var speakTimeout = null
    const abcjsParser = useAbcjsParser({tunebook: props.tunebook})
    //var {searchYouTube} = useYouTubeSearch()
    //console.log('single',props)
    const [showMedia, setShowMedia] = useState(false)
    const [mediaLinkNumber, setMediaLinkNumber] = useState(params.mediaLinkNumber > 0 ? params.mediaLinkNumber : 0)
    const [mediaLoading, setMediaLoading] = useState(false)
    const [ytMediaPlayer, setYTMediaPlayer] = useState(null)
    const [mediaProgress, setMediaProgress] = useState(0)
    const [midiData, setMidiData] = useState(null)
    const [mediaRefresh, setMediaRefresh] = useState(new Date())
    const [isPlaying, setIsPlaying] = useState(false)
    const [autoStart, setAutoStart] = useState(false)
    const [hasSpoken, setHasSpoken] = useState(false)
    const [squashLyrics, setSquashLyrics] = useState(false)
    
    //const [abc, setAbc] = useState('')
    let tune = props.tunes ? props.tunes[new String(params.tuneId)] : null
    const [zoomChords, setZoomChords] = useState(!props.tunebook.hasLyrics(tune))
    
    //let abc = '' //props.tunebook.abcTools.settingFromTune(tune).abc
    const handlers = useSwipeable({
        delta:300,
        trackMouse: false,    
      onSwipedRight: (eventData) => {
          props.tunebook.navigateToPreviousSong(tune.id, navigate)
      },
      onSwipedLeft: (eventData) => {
          props.tunebook.navigateToNextSong(tune.id, navigate)
      }
    });  
    
    
    
    //useEffect(function() {
        //if (!showMedia) {
            ////console.log('stop tom er')
            //clearInterval(youtubeProgressInterval.current)
            //youtubeProgressInterval.current = null
        //}
    //}, [showMedia])
    
    function getBeatsPerBar(meter) {
          switch (meter) {
            case '2/2':
              return 2
            case '3/2':
              return 3
            case '4/2':
              return 4
            case '3/8':
              return 1
            case '6/8':
              return 2
            case '9/8':
              return 3
            case '12/8':
              return 4
            case '2/4':
              return 2
            case '3/4':
              return 3
            case '4/4':
              return 4
            case '6/4':
              return 2
            case '9/4':
              return 3
          }
          return 4
        
    }
    

    function setupTune() {
        let tune = props.tunes ? props.tunes[params.tuneId] : null
        setZoomChords(!props.tunebook.hasLyrics(tune))
        //console.log('setuptune',tune)
        if (tune) {
           // just lyrics
           if (!props.tunebook.hasNotesOrChords(tune))  {
               props.setViewMode('chords')
           // lyrics but no notes
           } else if (props.tunebook.hasLyrics(tune) && !props.tunebook.hasNotes(tune))  {
               props.setViewMode('chords')
           }
           // has music but no words
           if (!props.tunebook.hasLyrics(tune) && props.tunebook.hasNotes(tune))  {
               props.setViewMode('music')
           }
           props.tunebook.utils.scrollTo('topofpage')
           //setMediaLinkNumber(params.mediaLinkNumber)
           //console.log(params,tune.links)
           //props.mediaController.setTune(tune)
           //if (params.mediaLinkNumber > 0) props.mediaController.setSourceFromTune(params.mediaLinkNumber)
           
           //if (params.playState === "playMedia") {
               //props.mediaController.play()
                ////setAutoStart(false)
                ////if (Array.isArray(tune.links) && tune.links.length > 0) {
                    //////setMediaLinkNumber(0)
                    ////if (tune.links[0].startAt > 0) {
                        ////setMediaProgress(tune.links[0].startAt) 
                    ////} else {
                        ////setMediaProgress(0)
                    ////}
                    ////setMediaLoading(true); 
                    ////setShowMedia(true)
                ////}
           //} else if (params.playState === "playMidi") {
               ////console.log('playmidi')
               //props.mediaController.setSrc('')
               ////props.mediaController.ytPlayerRef.current = null
               ////props.mediaController.playerRef.current = null
                 ////props.mediaController.initMidi().then(function() {
                     ////props.mediaController.setCurrentTime(0)
                     //props.mediaController.play()
                 ////})
            //}
             ////else {
                ////props.mediaController.stop()
            ////}
             ////else {
                ////setAutoStart(false)
            ////}
            //console.log('Set Tune',tune)
            
        } else {
            //props.mediaController.setTune(null)
        }
    }

    useEffect(function() {
        setZoomChords(false)
        setupTune()
    },[params.tuneId,props.tunes])  //, params.mediaLinkNumber, params.playState

    useEffect(function() {
        setZoomChords(false)
        setupTune()
        //return function() {
            //props.mediaController.setTune(null)
        //}
    },[])

    function getTempo() {
        // use page tempo that has been updated from tune
        var tempo = (tune && tune.tempo > 0 ? tune.tempo :  100)
        if (tempo > 400) tempo = 400
        if (tempo < 1) tempo = 1
        return tempo
    }
 
    
       //<Button style={{float:'right'}} variant="danger" ><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path fill="none" d="M0 0h24v24H0z"/><path d="M12 3a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zm0-2a5 5 0 0 1 5 5v4a5 5 0 0 1-10 0V6a5 5 0 0 1 5-5zM3.055 11H5.07a7.002 7.002 0 0 0 13.858 0h2.016A9.004 9.004 0 0 1 13 18.945V23h-2v-4.055A9.004 9.004 0 0 1 3.055 11z"/></svg></Button>
    //console.log('single T',params.tuneId,tune,props.tunes)
    var words = {}
        
    if (tune) {
        var current = 0
        if (Array.isArray(tune.words)) {
            tune.words.forEach(function(line) {
              if (line && line.trim().length > 0) {
                  if (!Array.isArray(words[current])) words[current] = []
                  words[current].push(line)
              } else {
                  current++
              }
            })
        }  
        
        //<iframe src={link} ></iframe>
        //console.log('sING abc',props.tunebook.abcTools.tunesToAbc(props.tunes))
        var firstVoice = tune.voices && Object.keys(tune.voices).length > 0 ? Object.values(tune.voices)[0] : {notes:[]}
        //var parsed = props.tunebook.abcTools.parseAbcToBeats(firstVoice.notes.join("\n"))
        ////console.log('sING',parsed.chords)
        //var [a,b,chordsArray,c] = parsed
        var chords = abcjsParser.renderChords(props.tunebook.abcTools.emptyABC(tune.name)  + firstVoice.notes.join("\n"), false, tune.transpose, tune.key, tune.noteLength, tune.meter)
        //props.tunebook.abcTools.renderChords(chordsArray,false, tune.transpose)
        var uniqueChords={}
        chords.replaceAll("|",' ').split(' ').forEach(function(chord) {
            if (chord.trim().length > 0) uniqueChords[chord.trim()] = true
        })
        
        function getYouTubeId(url) {
            const arr = url.split(/(vi\/|v%3D|v=|\/v\/|youtu\.be\/|\/embed\/)/);
            return undefined !== arr[2] ? arr[2].split(/[^\w-]/i)[0] : arr[0];
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
        
        function shouldPlayMedia() {
            //console.log('SPM',showMedia,tune)
            return (showMedia && Array.isArray(tune.links) && tune.links.length > mediaLinkNumber && tune.links[mediaLinkNumber])
        }
        var useMediaLinkNumber = mediaLinkNumber > 0 ? mediaLinkNumber : 0
        
        // update state to next link or navigate to next tune where there is a currentMediaPlaylist
        function nextLinkOrTune() {
            props.tunebook.navigateToNextSong(tune.id, navigate)
        }
        
        function onEnded(progress, start, stop,seek) {
            if (props.mediaPlaylist || props.abcPlaylist) {
                nextLinkOrTune()
            }
        }
       
        function downloadMidi() {
            //console.log('DL')
            var useTune = JSON.parse(JSON.stringify(tune))
            // multiply notes to support repeats
            if (useTune.repeats > 1 && useTune.voices && Object.keys(useTune.voices).length > 0) {
                var newVoices = {}
                Object.keys(useTune.voices).map(function(vKey) {
                  newVoices[vKey] = useTune.voices[vKey]  
                  newVoices[vKey].notes = newVoices[vKey].notes.join("\n").repeat(useTune.repeats).split("\n")
                })
                useTune.voices = newVoices
            } 
            // transpose
            var abc = props.tunebook.abcTools.json2abc(useTune)
            //console.log("adddbc",abc)    
            if (useTune.transpose !== 0) { 
                var visualObj = abcjs.renderAbc("transpose_render", abc);
                try {
                    abc = abcjs.strTranspose(abc, visualObj, tune.transpose)
                } catch (e) {
                    console.log("Failed tranpose", e)
                }
            }
            var a = new Date().getTime()
            var midi = abcjs.synth.getMidiFile(abc, { chordsOff: false, midiOutputType: "binary" });
            console.log(new Date().getTime() - a,"ms to render midi")
            //document.getElementById("midi-link").innerHTML = midi;
            if (midi) { 
                var url = window.URL.createObjectURL(new Blob(midi, {type: 'audio/midi'}));
                var a = document.createElement("a");
                document.body.appendChild(a);
                a.style = "display: none";
                a.href = url;
                a.download = (tune.name ? tune.name : 'download') + ".midi";
                a.click();
                window.URL.revokeObjectURL(url);
            }
        }
        
        
        function fixLinks(tune,index,field,startOrEnd) {
            var previousKey = parseInt(index - 1)
            var link = tune.links[index]
            if (startOrEnd === 'start' && link[field] > 0) tune.links[previousKey].startAt = link[field]
            if (startOrEnd === 'end' && link[field] > 0) tune.links[previousKey].endAt = link[field]
            //console.log('update tune',tune,tune.links)
            props.tunebook.saveTune(tune)
        }
        
        function removeLink(tune,index) {
            console.log('remove links',tune.links,index)
            tune.links.splice(index,1)
            props.tunebook.saveTune(tune)
        }
        
        var abc = props.tunebook.abcTools.json2abc(tune)        
        var useInstrument = localStorage.getItem('bookstorage_last_chord_instrument') ? localStorage.getItem('bookstorage_last_chord_instrument') : 'guitar'
        //console.log('uniq',uniqueChords)
        return <div className="music-single" style={{border:'1px solid black'}} {...handlers} >
            <div className='music-buttons' style={{backgroundColor: '#80808033', width: '100%',height: '3em', padding:'0.1em', textAlign:'center'}}  >
                
                <ButtonGroup style={{float:'left', marginLeft:'0.1em'}}>
                 <Dropdown >
                      <Dropdown.Toggle variant="info" id="dropdown-basic" style={{height:'2.4em'}}>
                      </Dropdown.Toggle>

                      <Dropdown.Menu>
                        <Dropdown.Item><Button className='btn-primary'  onClick={window.print} >{props.tunebook.icons.printer} Print</Button></Dropdown.Item>
                        
                         <Dropdown.Item ><Button className='btn-success' style={{float:'left'}} onClick={function() {props.tunebook.utils.download((tune.name ? tune.name.trim() : 'tune') + '.abc',props.tunebook.abcTools.json2abc(tune).trim())}} >{props.tunebook.icons.save} Save</Button></Dropdown.Item>
                        
                         <Dropdown.Item ><Button id={'midi-download-button'} className='btn-success' style={{float:'left'}} onClick={downloadMidi} >{props.tunebook.icons.midi} MIDI</Button></Dropdown.Item>
                        
                        <Dropdown.Item><span style={{marginLeft:'0.2em', float:'left'}} ><Button variant="danger" className='btn-secondary' onClick={function(e) {if (window.confirm('Do you really want to delete this tune ?')) {props.tunebook.deleteTune(tune.id)}; navigate('/tunes') }} >{props.tunebook.icons.bin} Delete</Button></span></Dropdown.Item>
                        
                         <Dropdown.Item><span style={{marginLeft:'0.1em', float:'left'}} ><ShareTunebookModal tunebook ={props.tunebook} token={props.token} googleDocumentId={props.googleDocumentId} tiny={false} tuneId={tune.id} buttonSize={'small'}  /></span></Dropdown.Item>
               
                        
                      </Dropdown.Menu>
                    </Dropdown>
                    
                       <Link to={'/editor/'+params.tuneId}><Button className='btn-warning' >{props.tunebook.icons.pencil}</Button></Link>
                 </ButtonGroup>   
                
                
               
                <span style={{float:'left'}}><BoostSettingsModal tunebook={props.tunebook} value={tune.boost} onChange={function(val) {tune.boost = val; props.tunebook.saveTune(tune); props.forceRefresh()}} difficulty={tune.difficulty > 0 ? tune.difficulty : 0} onChangeDifficulty={function(val) {tune.difficulty = val; props.tunebook.saveTune(tune); props.forceRefresh()}} /></span  >
                
                
                
                <span style={{float:'left', marginLeft:'0.1em'}} ><BookMultiSelectorModal forceRefresh={props.forceRefresh} tunebook={props.tunebook} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions} value={tune.books} onChange={function(val) { tune.books = val; props.tunebook.saveTune(tune);} } /></span>
                
                <span style={{float:'left', marginLeft:'0.1em'}} ><TagsSelectorModal forceRefresh={props.forceRefresh} tunebook={props.tunebook} setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}  defaultOptions={props.tunebook.getTuneTagOptions} searchOptions={props.tunebook.getSearchTuneTagOptions} value={tune.tags} onChange={function(val) {  ;tune.tags = val; props.tunebook.saveTune(tune);} } /></span>

                <span style={{float:'right', marginLeft:'0.3em'}} ><ViewModeSelectorModal viewMode={props.viewMode} tunebook={props.tunebook}  onChange={function(val) {props.setViewMode(val)}} /></span>
                <ButtonToolbar
                
                    className=""
                  >
                  
                    
                    
    
                    {props.mediaPlaylist === null && <span style={{float:'left', marginLeft:'0.2em'}} >
                        
                        
                        
                        <LinksEditorModal icon="media" mediaController={props.mediaController} forceRefresh={props.forceRefresh} tunebook={props.tunebook}  tune={tune}  onChange={
                            function(links) { 
                                if (tune) {
                                    tune.links = links
                                    props.tunebook.saveTune(tune)
                                    //console.log("FR")
                                    //props.forceRefresh()
                                }
                            }    
                        } />
                        
                         
                 
                        
                    </span>}
                   
                  
                </ButtonToolbar>
                
            </div>
            
             <MediaSeekSlider  mediaController={props.mediaController} />
          
           
             {props.viewMode === 'chords' && <>
                {!zoomChords && <div style={{border:'1px solid black'}}>
                     <div className="title" style={{ marginTop:'0.25em',marginBottom:'1em', width:'55%', paddingLeft:'0.3em'}} >
                        {Object.keys(words).length > 0  && <Button style={{marginRight:'1em'}}  onClick={function() {setSquashLyrics(!squashLyrics)}}>{props.tunebook.icons.map2}</Button>}
                        <TitleAndLyricsEditorModal tunebook={props.tunebook} tune={tune} />
                        {tune.composer && <span> - {tune.composer}</span>}
                     </div>
                     
                     {(!squashLyrics && Object.keys(words).length > 0) && <div className="lyrics" style={{ width:'55%', paddingLeft:'0.3em' ,marginTop:'1em'}} >
                        {Object.keys(words).map(function(key) {
                            return <div  key={key} className="lyrics-block" style={{paddingTop:'1em',paddingBottom:'1em', pageBreakInside:'avoid'}} >{words[key].map(function(line,lk) {
                                    return <div key={lk} className="lyrics-line" >{line}</div>
                                })}</div>
                        })}
                        
                     </div>}
                     {(squashLyrics && Object.keys(words).length > 0) && <div className="lyrics" style={{ width:'55%', paddingLeft:'0.3em' ,marginTop:'2.5em'}} >
                        {Object.keys(words).map(function(key) {
                            return <div  key={key} className="lyrics-block" style={{paddingTop:'1em',paddingBottom:'1em', pageBreakInside:'avoid'}} >
                                    <div  className="lyrics-line" >{words[key][0]}</div>
                                    {words[key].length > 1 && <div  className="lyrics-line-first words" >{words[key].slice(1).map(function(line,lk) {
                                            var parts = line.trim().split(' ')
                                            return <span>{parts[0]} {parts[1]}...</span>
                                        })}
                                    </div>}
                                    
                             </div>
                        })}
                        
                     </div>}
                </div>  }
      
                 {(Object.keys(uniqueChords).length > 0) && <div style={{position:(zoomChords === true ? 'relative' : 'fixed'), fontSize:'1.1em', width: (zoomChords === true ? '100%' : '40%'),  right:'0.1em', top : (zoomChords ? '0em' : '7.4em'), bottom:'0%', zIndex: 999, backgroundColor: 'white', minHeight:'800px' }} >
                    {!(zoomChords === true) && <Button style={{color:'white'}} onClick={function() {setZoomChords(true)}} >{props.tunebook.icons.arrowlefts}</Button>}
                    {(zoomChords === true) && <Button style={{color:'white'}} onClick={function() {setZoomChords(false)}} >{props.tunebook.icons.arrowrights}</Button>}
                    <span>
                        {Object.keys(uniqueChords).map(function(chord) {
                            var chordLetter = chord
                            var chordType = ''
                            return <Link to={"/chords/"+useInstrument+"/"+chordLetter+"/"+chordType} ><Button>{chord}</Button></Link>
                        })}
                        </span>
                        {zoomChords && <TitleAndLyricsEditorModal tunebook={props.tunebook} tune={tune} />} 
                    <div style={{ overflowY:'scroll', height:'100%'}} >
                        <pre style={{ fontSize:(zoomChords === true ? '2.4em' : '') ,border:'1px solid black', borderRadius:'5px',marginTop:'1em', padding:'0.3em', lineHeight:'2em'}} >{chords}</pre>
                        
                        
                        <br/><br/><br/>
                    </div>
                 </div>}
             </>}
             
             
             {<div style={{paddingLeft:'0.7em', paddingRight:'0.7em'}}>
                 {(showMedia && Array.isArray(tune.links) && tune.links.length > 0) && <div style={{  clear:'both',  width:'100%', height:'3em'}} ></div>}
                 <div id={"abccontainer-"+(autoStart?"Y":"N")+"-"+(localStorage.getItem('bookstorage_autoprime') === "true"?"Y":"N")}  style={props.viewMode !== 'music' ? {position: 'relative', top: 2000} : {}}>
                    {autoStart && <Abc  showRepeats={true} warp={props.mediaController.playbackSpeed} onStarted={function() {props.mediaController.play()}} onStopped={function() {props.mediaController.pause()}}  mediaController={props.mediaController} speakTitle={localStorage.getItem('bookstorage_announcesong')} autoStart={true} autoPrime={true} autoScroll={props.viewMode === 'music'} setMidiData={setMidiData} forceRefresh={props.forceRefresh} metronomeCountIn={true}  tunes={props.tunes} editableTempo={true} repeat={tune.repeats > 0 ? tune.repeats : 1 } tunebook={props.tunebook}  abc={props.tunebook.abcTools.json2abc(tune)} tempo={getTempo()} meter={tune.meter}  onEnded={onEnded} hideSvg={false} hidePlayer={true} />}
                     {!autoStart && <Abc  showRepeats={true} warp={props.mediaController.playbackSpeed} onStarted={function() {props.mediaController.play()}} onStopped={function() {props.mediaController.pause()}}  mediaController={props.mediaController}  speakTitle={localStorage.getItem('bookstorage_announcesong')}  autoStart={false} autoPrime={true} autoScroll={props.viewMode === 'music'} setMidiData={setMidiData} forceRefresh={props.forceRefresh} metronomeCountIn={true}  tunes={props.tunes} editableTempo={true} repeat={tune.repeats > 0 ? tune.repeats : 1 } tunebook={props.tunebook}  abc={props.tunebook.abcTools.json2abc(tune)} tempo={getTempo()} meter={tune.meter}  onEnded={onEnded} hideSvg={false} hidePlayer={true} />}
                  </div>
             </div>}
             
             {(Array.isArray(tune.files) && tune.files.length > 0) && <div style={{  clear:'both',  width:'100%', height:'3em'}} >
                 {tune.files.map(function(file,fk) {
                    return file.type === 'image' ? <img key={fk} style={{width:'100%'}} src={file.data} /> : '' 
                  })}
              </div>}
             
             <MediaPlayerMedia mediaController={props.mediaController} tunebook={props.tunebook}  tune={tune} onEnded={onEnded} />
             
             <div style={{display:'none'}} id="transpose_render"></div>
        </div>
    }
}
 //{(!props.abcPlaylist && props.mediaPlaylist && props.mediaPlaylist.tunes && props.mediaPlaylist.tunes.length > 0) && <div style={{position:'fixed', top: '6px', right: '6px', zIndex:999}} >
                    //<ButtonGroup variant="danger">
                        //{(!mediaLoading && showMedia && isPlaying) && <Button variant="warning" onClick={function() {
                            ////console.log(audioPlayer)
                                //try {
                                    //if (audioPlayer && audioPlayer.current) audioPlayer.current.pause()
                                    //if (ytMediaPlayer) ytMediaPlayer.pauseVideo()
                                //} catch (e) {
                                    //console.log(e)
                                //}
                                //try {
                                    //setIsPlaying(false)
                                //} catch (e) {
                                    //console.log(e)
                                //}
                            //}} >{props.tunebook.icons.pause}</Button>}
                        //{(!mediaLoading && showMedia && !isPlaying) && <Button variant="success" onClick={function() {
                                //try {
                                    //if (audioPlayer && audioPlayer.current) audioPlayer.current.play()
                                    //if (ytMediaPlayer) ytMediaPlayer.playVideo()
                                //} catch (e) {
                                    //console.log(e)
                                //}
                                //try {
                                    //setIsPlaying(true)
                                //} catch (e) {
                                    //console.log(e)
                                //}
                            //}} >{props.tunebook.icons.play}</Button>}
                        //<Button variant="danger" size="xl"  onClick={function() {props.setMediaPlaylist(null); setShowMedia(false)}} >{mediaLoading ? props.tunebook.icons.waiting : props.tunebook.icons.stop} </Button>
                        
                    //</ButtonGroup>
               //</div>}
              //{(showMedia && Array.isArray(tune.links) && tune.links.length > useMediaLinkNumber && tune.links[useMediaLinkNumber]) && <div style={{  clear:'both',  width:'100%'}} key={tune.id+"-"+params.playState+"-"+useMediaLinkNumber} >
                        //{!isYoutubeLink(tune.links[useMediaLinkNumber].link) ? <audio  ref={audioPlayer} 
                            //onCanPlay={function(event) { 
                                //setMediaLoading(false);
                                //var toSpeak = tune.name
                                //if (tune.composer) toSpeak += " by " + tune.composer
                                //var speakTitle = localStorage.getItem('bookstorage_announcesong') === "true" ? true : false
                                //if (speakTitle && !hasSpoken) window.speak(toSpeak)
                                //setHasSpoken(true)
                                //setIsPlaying(true)
                                
                                
                            //}} 
                            //width="1px" height="1px" autoPlay={"true"} 
                            //onEnded={function() {
                                ////console.log('ended a')
                                //// next link
                                //if (props.mediaPlaylist || props.abcPlaylist) {
                                    //nextLinkOrTune()
                                //}
                            //}}
                            //onError={function(e) {
                                //console.log('err media',e); 
                                //if (props.mediaPlaylist || props.abcPlaylist) {
                                    //nextLinkOrTune()
                                //}
                            //}} 
                            //onTimeUpdate={function(e) {
                                //setMediaProgress(e.target.currentTime/e.target.duration)
                            //}}
                             //>
                                //<source src={tune.links[useMediaLinkNumber].link} type="video/ogg" />
                                //Your browser does not support the video tag.
                                //</audio> : <div style={{clear:'both'}} >
                                
                                //<YouTube videoId={getYouTubeId(tune.links[useMediaLinkNumber].link)} opts={{
                                  //width: '100%',
                                  //playerVars: {
                                    //loop : 1,
                                    //autoplay: 1,
                                    //controls: 0,
                                    //start: (tune.links[useMediaLinkNumber].startAt ? parseInt(tune.links[useMediaLinkNumber].startAt) : 0),
                                    //end: (tune.links[useMediaLinkNumber].endAt ? parseInt(tune.links[useMediaLinkNumber].endAt) : 0)
                                  //},
                                //}} 
                                //onEnd={function() {
                                    ////console.log('ty ended')
                                    //clearInterval(youtubeProgressInterval.current)
                                    //youtubeProgressInterval.current = null
                                    //if (props.mediaPlaylist || props.abcPlaylist) {
                                        //nextLinkOrTune()
                                    //}
                                //}} 
                                //onError={function(e) {
                                    //console.log('err yt',e)
                                    //clearInterval(youtubeProgressInterval.current)
                                    //youtubeProgressInterval.current = null
                                    //if (props.mediaPlaylist || props.abcPlaylist) {
                                        //nextLinkOrTune()
                                    //}
                                //}} 
                                //onReady={
                                    //function(event) {
                                        //setYTMediaPlayer(event.target); 
                                        //console.log('YTREDD')
                                        //var toSpeak = tune.name
                                        //if (tune.composer) toSpeak += " by " + tune.composer
                                        //var speakTitle = localStorage.getItem('bookstorage_announcesong') === "true" ? true : false
            
                                        //if (speakTitle && !hasSpoken) window.speak(toSpeak)
                                        //setHasSpoken(true)
                                        //event.target.playVideo()
                                        //setIsPlaying(true)
                                        
                                    //}    
                                //}
                                //onStateChange={
                                    //function(e) {
                                        //if (e.data === 1) {
                                            //setMediaLoading(false)
                                            //clearInterval(youtubeProgressInterval.current)
                                            //youtubeProgressInterval.current = setInterval(function() {
                                                //setMediaProgress(e.target.getCurrentTime()/e.target.getDuration())
                                                ////console.log('yt progress',e.target.getCurrentTime(),e.target.getDuration())
                                            //}, 100)
                                        //}
                                    //}
                                //} 
                                
                                 ///> 
                                
                            //</div>
                            
                        //}
                        
                   //</div>}
//{(showMedia && Array.isArray(tune.links) && tune.links.length > useMediaLinkNumber && tune.links[useMediaLinkNumber]) && <div style={{  clear:'both',  width:'100%'}} key={tune.id+"--"+params.playState+"-"+useMediaLinkNumber} >
                        
                        
                        //<div style={{float: 'left', fontSize:'0.6em', position:'relative', top:'1.5em'}} >
                            //{(audioPlayer && audioPlayer.current && audioPlayer.current.currentTime && audioPlayer.current.duration) ? <b>{audioPlayer.current.currentTime.toFixed(2)}/{audioPlayer.current.duration.toFixed(2)}</b> : null}
                            
                            //{(mediaProgress && ytMediaPlayer && ytMediaPlayer.getDuration && ytMediaPlayer.getDuration()  && ytMediaPlayer.seekTo) ? <b>{(mediaProgress * ytMediaPlayer.getDuration()).toFixed(2)}/{ytMediaPlayer.getDuration().toFixed(2)}</b> : null}
                        //</div>
                        
                        //<input style={{width:'100%',height:'40px', zIndex:9999999, marginTop:'1em'}} className="mediaprogressslider" type="range" min='0' max='1' step='0.0001' value={mediaProgress} onChange={function(e) {
                                        //setMediaProgress(e.target.value); 
                                            
                                        //try {
                                            ////console.log(e.target.value); 
                                            //if (ytMediaPlayer && ytMediaPlayer.getDuration && ytMediaPlayer.seekTo) {
                                                //ytMediaPlayer.seekTo(parseFloat(e.target.value * ytMediaPlayer.getDuration()).toFixed(2)) 
                                            //};
                                        //} catch (e) {
                                            //console.log(e)
                                        //}
                                        //if (audioPlayer && audioPlayer.current) {
                                            //audioPlayer.current.currentTime = parseFloat(e.target.value * audioPlayer.current.duration ).toFixed(2)
                                        //}
                                    
                                    //}}  />
                    //</div>}
//<Badge>{props.mediaPlaylist && props.mediaPlaylist.currentTune > 0 ? parseInt(props.mediaPlaylist.currentTune) + 1 : 1}/{props.mediaPlaylist.tunes.length}</Badge>
 //<Button title="Print" className='btn-primary'  style={{float:'left'}} onClick={window.print} >{props.tunebook.icons.printer}</Button>
                //<Button title="Download" className='btn-success' style={{float:'left'}} onClick={function() {props.tunebook.utils.download((tune.name ? tune.name.trim() : 'tune') + '.abc',props.tunebook.abcTools.json2abc(tune).trim())}} >{props.tunebook.icons.save}</Button>
                //<a  style={{float:'left'}}  target="_new" href={"https://www.youtube.com/results?search_query="+tune.name + ' '+(tune.composer ? tune.composer : '')} ><Button title="Search YouTube">{props.tunebook.icons.youtube}</Button></a>

//<Abc  autoPrime={localStorage.getItem('bookstorage_autoprime')} showTempoSlider={true} editableTempo={true} forceRefresh={props.forceRefresh} metronomeCountIn={true}  tunes={props.tunes} repeat={tune.repeats > 0 ? tune.repeats : 1 } tunebook={props.tunebook}  abc={props.tunebook.abcTools.json2abc(tune)} tempo={getTempo()} meter={tune.meter}  onEnded={onEnded} />
             



            //{props.viewMode === 'music' && <>
             
             
             //<div className="lyrics" style={{marginLeft:'2em'}} >
                //{Object.keys(words).map(function(key) {
                    //return <div  key={key} className="lyrics-block" style={{paddingTop:'1em',paddingBottom:'1em', pageBreakInside:'avoid'}} >{words[key].map(function(line,lk) {
                            //return <div key={lk} className="lyrics-line" >{line}</div>
                        //})}</div>
                //})}
             //</div>
             //</>}

 //{(window.location.href.startsWith('http://localhost') || (props.user && props.user.email &&  props.user.email === 'syntithenai@gmail.com')) &&  <div> {props.tunebook.hasLinks(tune) ? <div>
            //<div style={{clear:'both'}} ><br/><br/>    </div>
            //{tune.links.map(function(link,lk) {
                //return <div>{lk}&nbsp; 
                    //{true ? <>
                        //S:{link.startAt} {(parseInt(lk) > 0 && parseFloat(link.startAt) > 0) ? <><Button onClick={function() {fixLinks(tune,lk,'startAt','start')}}>Start</Button><Button onClick={function() {fixLinks(tune,lk,'startAt','end')}}>End</Button></> : ''} 
                        //E:{link.endAt} {(parseInt(lk) > 0 && parseFloat(link.endAt) > 0) ? <><Button onClick={function() {fixLinks(tune,lk,'endAt','start')}}>Start</Button><Button onClick={function() {fixLinks(tune,lk,'endAt','end')}}>End</Button></>:''}
                        //L:{link.link} {(parseInt(lk) > 0 && link.link.trim().length > 0) ? <><Button onClick={function() {fixLinks(tune,lk,'link','start')}}>Start</Button><Button onClick={function() {fixLinks(tune,lk,'link','end')}}>End</Button></> : ''}
                        //<Button variant="danger" onClick={function() {removeLink(tune,lk)}}>X</Button>
                    //</> : ''}
                    
                //</div>
            //})}
            
            //</div> : ''}
           //</div>}
