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
    //console.log('single',props.tunebook.tunes)
    let [isPlaying, setIsPlaying] = useState(false)
    let [isWaiting, setIsWaiting] = useState(false)
    let [seekTo, setSeekTo] = useState(false)
    //let [timer, setTimer] = useState(0)
    let [prevent, setPrevent] = useState(false)
    //let buttonRef = useRef()

    let delay = 500;
      
    var timer
    function onClickHandler() {
        console.log('singleS');
        if (timer) {
            console.log('double');
            clearTimeout(timer)
            timer = null
            if (props.midiBuffer) props.midiBuffer.stop()
            if (props.timingCallbacks) props.timingCallbacks.stop()
            setSeekTo(0)
            setIsWaiting(true); 
            setIsPlaying(true);
        } else {
            timer = setTimeout(() => {
                console.log('single');
                clearTimeout(timer)
                timer = null
                setIsWaiting(true); 
                setIsPlaying(true);
            }, delay)
        }
        
    };

    var [ready, setReady] = useState(false)
        
    function audioCallback(event) {
        console.log('cab',event)
        if (event ==='ended' || event ==='error' || event === 'stop') {
            setIsPlaying(false)
            setIsWaiting(false)
        } else if (event === 'started') {
            setIsWaiting(false)
        } else if (event === 'ready') {
            setReady(true)
        } 
    }
    
    let tune = props.tunebook.tunes[params.tuneId]
    let abc = '' //props.tunebook.abcTools.settingFromTune(tune).abc
    useEffect(function() {
         tune = props.tunebook.tunes[params.tuneId]
         if (!tune) navigate("/tunes")
    },[params.tuneId])
   
    function getTempo() {
        return (props.tunebook.tempo > 0 ? props.tunebook.tempo : (props.tunebook.abcTools.getTempo(tune) > 0 ? props.tunebook.abcTools.getTempo(tune) : 100))
    }
    if (tune) {
       return <div className="music-single">
            <div className='music-buttons' style={{backgroundColor: '#80808033', width: '100%',height: '3em', padding:'0.5em', textAlign:'center'}}  >
                <Link to={'/editor/'+params.tuneId}><Button className='btn-secondary' style={{float:'left'}} >{props.tunebook.icons.pencil}</Button></Link>
                <span style={{float:'left', marginLeft:'0.3em'}} ><BookMultiSelectorModal forceRefresh={props.forceRefresh} tunebook={props.tunebook} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions} value={tune.books} onChange={function(val) {console.log("save book selection",val); tune.books = val; props.tunebook.saveTune(tune);} } /></span>

                <BoostSettingsModal tunebook={props.tunebook} value={tune.boost} onChange={function(val) {tune.boost = val; props.tunebook.saveTune(tune); props.forceRefresh()}} />
                
                {!ready && <>
                    {!isPlaying && <Button  className='btn-secondary' style={{float:'right'}} >{props.tunebook.icons.timer}{props.tunebook.icons.start}</Button>}
                    {isPlaying && <Button className='btn-secondary' style={{float:'right'}}  >{isWaiting && <span  >{props.tunebook.icons.timer}</span>} {props.tunebook.icons.stop}</Button>}
                </>}
                {ready && <>
                    {!isPlaying && <Button  className='btn-success' style={{float:'right'}} onClick={function(e) {onClickHandler() }} >{props.tunebook.icons.start}</Button>}
                    {isPlaying && <Button className='btn-danger' style={{float:'right'}} onClick={function(e) {setIsPlaying(false)}} >{isWaiting && <span  >{props.tunebook.icons.timer}</span>} {props.tunebook.icons.stop}</Button>}
                </>}
                {props.audioContext && <input type="range" min='0' max='1' step='0.0001' value={props.seekTo} onChange={function(e) {seekPlayerTo(e.target.value)}}  style={{marginTop:'0.5em',marginBottom:'0.5em', width:'100%'}}/>}

            </div>
            
        </div>
    }
}
//<Abc tunebook={props.tunebook} seekTo={seekTo} setSeekTo={setSeekTo} audioContext={props.audioContext} setAudioContext={props.setAudioContext} midiBuffer={props.midiBuffer} setMidiBuffer={props.setMidiBuffer} timingCallbacks={props.timingCallbacks} setTimingCallbacks={props.setTimingCallbacks}   setReady={setReady} abc={props.tunebook.abcTools.json2abc(tune)} isPlaying={isPlaying} audioCallback={audioCallback} tempo={getTempo()} milliSecondsPerMeasure={(props.tunebook.abcTools.getMilliSecondsPerMeasure(tune, getTempo()))} />
