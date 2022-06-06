import {useState, useEffect, useRef} from 'react'
import {Link , useParams , useNavigate} from 'react-router-dom'
import {Button} from 'react-bootstrap'
import Abc from './Abc'
import BoostSettingsModal from './BoostSettingsModal'
//import ReactTags from 'react-tag-autocomplete'
import BookMultiSelectorModal from  './BookMultiSelectorModal'

  
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
        //console.log("ON ENDfED", progress, start, stop, seek)
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
        var chords = props.tunebook.abcTools.renderChords(chordsArray,false)
       return <div className="music-single">
            <div className='music-buttons' style={{backgroundColor: '#80808033', width: '100%',height: '3em', padding:'0.1em', textAlign:'center'}}  >
             
                
                <Link to={'/editor/'+params.tuneId}><Button className='btn-warning' style={{float:'left'}} >{props.tunebook.icons.pencil}</Button></Link>
                
                <Button className='btn-primary' style={{float:'left'}} onClick={window.print} >{props.tunebook.icons.printer}</Button>
                <Button className='btn-success' style={{float:'left'}} onClick={function() {props.tunebook.utils.download((tune.name ? tune.name.trim() : 'tune') + '.abc',props.tunebook.abcTools.json2abc(tune).trim())}} >{props.tunebook.icons.save}</Button>
                
                
                
                <span style={{float:'left', marginLeft:'0.1em'}} ><BookMultiSelectorModal forceRefresh={props.forceRefresh} tunebook={props.tunebook} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions} value={tune.books} onChange={function(val) {console.log("save book selection",val); tune.books = val; props.tunebook.saveTune(tune);} } /></span>

                <BoostSettingsModal forceRefresh={props.forceRefresh} tunebook={props.tunebook} value={tune.boost} onChange={function(val) {tune.boost = val; props.tunebook.saveTune(tune); props.forceRefresh()}} />
                <span style={{float:'left', marginLeft:'0.3em'}} >
               {props.viewMode !=='music' && <Button onClick={function() {props.setViewMode('music')}}>{props.tunebook.icons.music}</Button>}
               {props.viewMode !=='chords' && <Button onClick={function() {props.setViewMode('chords')}} >{props.tunebook.icons.guitar}</Button>}
                </span>
                <span style={{marginLeft:'0.2em', float:'right'}} ><Button variant="danger" className='btn-secondary' onClick={function(e) {if (window.confirm('Do you really want to delete this tune ?')) {props.tunebook.deleteTune(tune.id)}; navigate('/tunes') }} >{props.tunebook.icons.bin}</Button></span>
            </div>
            
            {props.viewMode === 'music' && <>
             <Abc autoScroll={true} forceRefresh={props.forceRefresh} metronomeCountIn={true}  tunes={props.tunes} editableTempo={true} repeat={tune.repeats > 0 ? tune.repeats : 1 } tunebook={props.tunebook}  abc={props.tunebook.abcTools.json2abc(tune)} tempo={getTempo()} meter={tune.meter}  onEnded={onEnded} />
             
             <div className="lyrics" style={{marginLeft:'2em'}} >
                {Object.keys(words).map(function(key) {
                    return <div  key={key} className="lyrics-block" style={{paddingTop:'1em',paddingBottom:'1em', pageBreakInside:'avoid'}} >{words[key].map(function(line,lk) {
                            return <div key={lk} className="lyrics-line" >{line}</div>
                        })}</div>
                })}
             </div>
             </>}
             
             {props.viewMode === 'chords' && <>
             
             <pre style={{clear:'both', position:'fixed', fontSize:'0.8em', top:'5em', right:'0.1em', width: '30%', overflow: 'show', zIndex: 999,border:'1px solid black', backgroundColor: 'white'}} >{chords}</pre>
             
             <div className="lyrics" style={{clear:'both', marginLeft:'0.1em', width:'65%'}} >
                {Object.keys(words).map(function(key) {
                    return <div  key={key} className="lyrics-block" style={{paddingTop:'1em',paddingBottom:'1em', pageBreakInside:'avoid'}} >{words[key].map(function(line,lk) {
                            return <div key={lk} className="lyrics-line" >{line}</div>
                        })}</div>
                })}
             </div>
              <Abc showTempoSlider={true} editableTempo={true} forceRefresh={props.forceRefresh} metronomeCountIn={true}  tunes={props.tunes} repeat={tune.repeats > 0 ? tune.repeats : 1 } tunebook={props.tunebook}  abc={props.tunebook.abcTools.json2abc(tune)} tempo={getTempo()} meter={tune.meter}  onEnded={onEnded} />
             
            
             </>}
             
             
             
        </div>
    }
}
