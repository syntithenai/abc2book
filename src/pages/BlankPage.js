import useMidiSynth from '../useMidiSynth'
import {useState, useEffect} from 'react'

  
function loadFileFromUrl(url) {
    return new Promise(function(resolve,reject) {
        const xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function() {
          if (this.readyState === 4 && this.status === 200) {
            resolve(xhr.response)
          }
        };
        xhr.open('GET', url, true);
        xhr.responseType = 'arraybuffer';
        xhr.send();
    })
}  
  
export default function BlankPage(props) {
    const [midiData, setMidiData] = useState(null)
    const {seek, init, playerRef, instrumentsRef} = useMidiSynth({midiData: midiData, onLoading: function(v) {props.mediaController.setIsLoading(v)} , onReady: props.mediaController.onAbcReady, onEnded: function() {console.log("BLANK END")}})
    
    const sampleFile = 'http://localhost:4000/sample3.midi'             
    var [progress, setProgress] = useState()
    
    useEffect(function() {
        loadFileFromUrl(sampleFile).then(function(midiData) {
            console.log('LOADED',midiData)
            init(midiData)
            if (playerRef.current) playerRef.current.on('midiEvent',function(e) {
                //console.log(e)
                setProgress((playerRef.current ? playerRef.current.getSongPercentRemaining(): 100))   
            })
        });
    },[])
    
    //useEffect(function() {
        //console.log('BLANK pchange')
         //setProgress((playerRef.current ? playerRef.current.getSongPercentRemaining(): 100))   
    //},[(playerRef.current ? playerRef.current.getSongPercentRemaining(): 100)])
    
    console.log('BLANK')
    
    function start() {
        console.log('START',playerRef.current)
        if (playerRef.current) playerRef.current.play()
    }
    
    function stop() {
        console.log("MIDI SYNTH stOP", playerRef.current)
        if (playerRef.current) playerRef.current.pause();
        // stop all currently playing sounds
        if (Array.isArray(instrumentsRef.current)) {
            instrumentsRef.current.forEach(function(i) {i.stop()})
        }
    }
    
    function lseek(progress) {
        var isPlaying = playerRef.current.isPlaying
        stop()
        playerRef.current.skipToPercent(progress)
        if (isPlaying) start()
    }
    
    
    return <div>
    {progress}
        <button onClick={start} >Play</button>
        <button onClick={stop} >Pause</button>
        <button onClick={function() {seek(0.25)}} >A</button>
        <button onClick={function() {seek(0.95)}} >B</button>
    </div>
}
