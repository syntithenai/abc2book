import {useState, useEffect, useRef} from 'react'
import {Link , useParams , useNavigate} from 'react-router-dom'
import {Button, Dropdown} from 'react-bootstrap'
import Abc from './Abc'
import BoostSettingsModal from './BoostSettingsModal'
//import ReactTags from 'react-tag-autocomplete'
import BookMultiSelectorModal from  './BookMultiSelectorModal'
import ShareTunebookModal from './ShareTunebookModal'
import {useSwipeable} from 'react-swipeable'
import ButtonGroup from 'react-bootstrap/ButtonGroup';
import ButtonToolbar from 'react-bootstrap/ButtonToolbar';
  
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
    //console.log('single',props)
    
    let tune = props.tunes ? props.tunes[new String(params.tuneId)] : null
    let abc = '' //props.tunebook.abcTools.settingFromTune(tune).abc
    const handlers = useSwipeable({
        delta:300,
        trackMouse: true,    
      onSwipedRight: (eventData) => {
          props.tunebook.navigateToPreviousSong(tune.id,navigate)
      },
      onSwipedLeft: (eventData) => {
          props.tunebook.navigateToNextSong(tune.id,navigate)
      }
    });  
    

    
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
    

    useEffect(function() {
       let tune = props.tunes ? props.tunes[params.tuneId] : null
       // props.tempo is an integer
       // tune tempo includes beat length eg 3/8=100
       if (tune) {
           //var tempo = props.tunebook.abcTools.cleanTempo(tune.tempo)
           //if (tune.meter) {
             //var bpb = getBeatsPerBar(tune.meter)
             //props.setBeatsPerBar(bpb)
           //}
           //if (tempo != props.tempo) {
               //props.setTempo(tempo)
           //}
           props.tunebook.utils.scrollTo('topofpage')
        }
    },[params.tuneId])

    function getTempo() {
        // use page tempo that has been updated from tune
        var tempo = (tune && tune.tempo > 0 ? tune.tempo :  100)
        if (tempo > 400) tempo = 400
        if (tempo < 1) tempo = 1
        return tempo
    }
 
    function onEnded(progress, start, stop,seek) {
        console.log("ON ENDfED", progress, start, stop, seek)
        ////stop()
        //seek(0)
        //start()
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
        //console.log('sING abc',props.tunebook.abcTools.tunesToAbc(props.tunes))
        var firstVoice = Object.keys(tune.voices).length > 0 ? Object.values(tune.voices)[0] : {notes:[]}
        var parsed = props.tunebook.abcTools.parseAbcToBeats(firstVoice.notes.join("\n"))
        //console.log('sING',parsed.chords)
        var [a,b,chordsArray,c] = parsed
        var chords = props.tunebook.abcTools.renderChords(chordsArray,false, tune.transpose)
        var uniqueChords={}
        //console.log('sING',chords, JSON.stringify(chordsArray))
        var chordLines = chords.split("\n")
        chordLines.forEach(function(chordLine) {
            var chordParts = chordLine.split("|")
            chordParts.forEach(function(chordPart) {
                var chordPartsInner = chordPart.split(" ")
                chordPartsInner.forEach(function(cpi) {
                    if (cpi.trim().length > 0) {
                       uniqueChords[cpi] = true 
                    }
                })
            })
        })
        var useInstrument = localStorage.getItem('bookstorage_last_chord_instrument') ? localStorage.getItem('bookstorage_last_chord_instrument') : 'guitar'
        //console.log('uniq',uniqueChords)
        return <div className="music-single" {...handlers} >
            <div className='music-buttons' style={{backgroundColor: '#80808033', width: '100%',height: '3em', padding:'0.1em', textAlign:'center'}}  >
                <Link to={'/editor/'+params.tuneId}><Button className='btn-warning' style={{float:'left'}} >{props.tunebook.icons.pencil}</Button></Link>
               
                
                <Dropdown style={{float:'left', marginLeft:'0.1em'}}>
                  <Dropdown.Toggle variant="warning" id="dropdown-basic" style={{height:'2.4em'}}>
                  </Dropdown.Toggle>

                  <Dropdown.Menu>
                    <Dropdown.Item><Button className='btn-primary'  onClick={window.print} >{props.tunebook.icons.printer} Print</Button></Dropdown.Item>
                     <Dropdown.Item ><Button className='btn-success' style={{float:'left'}} onClick={function() {props.tunebook.utils.download((tune.name ? tune.name.trim() : 'tune') + '.abc',props.tunebook.abcTools.json2abc(tune).trim())}} >{props.tunebook.icons.save} Save</Button></Dropdown.Item>
                     
                    <Dropdown.Item><span style={{marginLeft:'0.2em', float:'left'}} ><Button variant="danger" className='btn-secondary' onClick={function(e) {if (window.confirm('Do you really want to delete this tune ?')) {props.tunebook.deleteTune(tune.id)}; navigate('/tunes') }} >{props.tunebook.icons.bin} Delete</Button></span></Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>
                
                 <span style={{marginLeft:'0.1em', float:'left'}} ><ShareTunebookModal tunebook ={props.tunebook} token={props.token} googleDocumentId={props.googleDocumentId} tiny={true} tuneId={tune.id} buttonSize={'small'}  /></span>
               
                
                <span style={{float:'left', marginLeft:'0.3em'}} ><BookMultiSelectorModal forceRefresh={props.forceRefresh} tunebook={props.tunebook} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions} value={tune.books} onChange={function(val) { tune.books = val; props.tunebook.saveTune(tune);} } /></span>

  
                <ButtonToolbar
                
                    className="justify-content-between"
                  >
                    <ButtonGroup aria-label="First group" variant="info" style={{marginLeft:'0.3em'}}
                    >
                      <Button onClick={function() {props.setViewMode('music')}} variant="secondary">{props.tunebook.icons.music}</Button>{' '}
                      <Button onClick={function() {props.setViewMode('chords')}}  variant="secondary">{props.tunebook.icons.guitar}</Button>{' '}
                      
                    </ButtonGroup>
                    <span style={{float:'left', marginLeft:'0.3em'}} >
                   <a target="_new" href={"https://www.youtube.com/results?search_query="+tune.name + ' '+(tune.composer ? tune.composer : '')} ><Button>{props.tunebook.icons.youtube}</Button>
                        
                        </a> 
                    </span>

                </ButtonToolbar>

               
                
            </div>
            

             {props.viewMode === 'chords' && <>
             
             
             <div className="lyrics" style={{float:'left', marginLeft:'0.1em', width:'65%'}} >
                {Object.keys(words).map(function(key) {
                    return <div  key={key} className="lyrics-block" style={{paddingTop:'1em',paddingBottom:'1em', pageBreakInside:'avoid'}} >{words[key].map(function(line,lk) {
                            return <div key={lk} className="lyrics-line" >{line}</div>
                        })}</div>
                })}
                
             </div>
              
  
             <div style={{position:'fixed', fontSize:'1.1em', width: '30%',  right:'0.1em', top:'4em', bottom:'0%', zIndex: 999, backgroundColor: 'white'}} >
                <div style={{ overflowY:'scroll', height:'100%'}} >
                    <pre style={{ border:'1px solid black',marginTop:'1em', padding:'0.3em', lineHeight:'2em'}} >{chords}</pre>
                    
                    <div>
                    {Object.keys(uniqueChords).map(function(chord) {
                        var chordLetter = chord
                        var chordType = ''
                        return <Link to={"/chords/"+useInstrument+"/"+chordLetter+"/"+chordType} ><Button>{chord}</Button></Link>
                    })}
                    </div>
                    <br/><br/><br/>
                </div>
             </div>
             </>}
             {props.viewMode !== 'chords' && <>
              <Abc  autoPrime={localStorage.getItem('bookstorage_autoprime') === "true" ? true : false} autoScroll={props.viewMode === 'music'} forceRefresh={props.forceRefresh} metronomeCountIn={true}  tunes={props.tunes} editableTempo={true} repeat={tune.repeats > 0 ? tune.repeats : 1 } tunebook={props.tunebook}  abc={props.tunebook.abcTools.json2abc(tune)} tempo={getTempo()} meter={tune.meter}  onEnded={onEnded} />
             </>}
             
             
             
             
        </div>
    }
}

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
