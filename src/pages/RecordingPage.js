import { Link, useParams , useNavigate } from 'react-router-dom'
import {Button, Form} from 'react-bootstrap'
import {useState, useEffect, useRef} from 'react'
import WaveformPlaylist from "waveform-playlist";
import NewRecordingDialog from '../components/NewRecordingDialog'

export default function RecordingPage(props) {
    var params = useParams()
    var editor = useRef()
    var navigate = useNavigate()
    //var ee = useRef()
    const [recording, setRecording] = useState(null)
    const [ee, setEe] = useState(null)
    const [seekTo, setSeekTo] = useState(null)
    const [isSaving, setIsSaving] = useState(false)
    const [isChanged, setIsChanged] = useState(false)
    const [mode, setMode] = useState('seek')
    const [recordingTitle, setRecordingTitle] = useState('')
    var lastId = useRef()
    var titleChangeTimeout = useRef()
    function createPlaylist() {
      return new Promise(function(resolve,reject) {
        setIsChanged(false)
        var playlist = WaveformPlaylist({
          samplesPerPixel: 500,
          mono: true,
          waveHeight: 120,
          container: editor.current,
          state: "cursor",
          colors: {
            waveOutlineColor: "#E0EFF1",
            timeColor: "grey",
            fadeColor: "black",
          },
          timescale: true,
          controls: {
            show: true,
            width: '120',
          },
          ac: new (window.AudioContext || window.webkitAudioContext)(),
          exclSolo: true,
          isAutomaticScroll: true,
          zoomLevels: [50,75,100,250,500, 1000, 2000, 3000, 4000, 5000,6000,7000,8000,10000,12500, 15000,20000,30000,40000,50000],
        });
        playlist.initExporter()
        if (navigator.mediaDevices.getUserMedia) {
          const constraints = { audio: true };
          navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
            playlist.initRecorder(stream)
            resolve(playlist)
          },function(e) {
              console.log(e)
          })
        }
      })
      
    }
    
    
    useEffect(function() {
      console.log('eff',params.recordingId, lastId.current)
      if (params.recordingId !== lastId.current)  {
        lastId.current = params.recordingId
        props.tunebook.recordingsManager.loadRecording(params.recordingId).then(function(rec) {
          setRecording(rec)
          if (rec.title) setRecordingTitle(rec.title)
          createPlaylist().then(function(playlist) {
            if (rec && rec.data) { 
              playlist
                .load([
                  {
                    src: rec.data,
                    name: 'Main',
                    gain: 0.5,
                  }
                ])
            }    
            // async save after rendering finished
            var ee = playlist.getEventEmitter()
            ee.on('audiorenderingfinished', function (type, data) {
              console.log('render finish', type, data)
              setIsSaving(false)
              if (type == 'wav'){
                rec.data = data
                props.tunebook.recordingsManager.saveRecording(rec)
                setIsChanged(false)
                navigate('/recordings')
              }
            });
            
            ee.on('removeTrack', function() {
              setIsChanged(true)
            })
            ee.on('shift', function() {
              setIsChanged(true)
            })
            ee.on('select', function() {
              console.log('select')
            })
            
            setEe(ee)
          })
          //console.log('emitter',ee)
        })
      }
    },[ params.recordingId])
  //{JSON.stringify(recording)}
      
    return <div className="recording">
     
     
          <div className="playlist-toolbar">
            <Form className="form-inline">
               <span style={{marginRight:'1em'}} >{recording && <NewRecordingDialog recording={recording} setIsChanged={setIsChanged} tunebook={props.tunebook} ee={ee} />}</span>
           
              <div className="btn-group">
                <Button
                  variant="warning"
                  title="Rewind"
                  onClick={function() {ee.emit('rewind')}}
                >
                  {props.tunebook.icons.skipback}
                </Button>
                <Button variant="success" onClick={function() {ee.emit('play')}} title="Play">
                  {props.tunebook.icons.play}
                </Button>
                <Button variant="danger" onClick={function() {ee.emit('stop')}} title="Stop">
                  {props.tunebook.icons.stop}
                </Button>
                
              </div>

              <div className="btn-group" style={{marginLeft:'0.5em'}} >
                <Button
                  title="Zoom in"
                  variant="outline-dark"
                  onClick={function() {ee.emit('zoomin')}}
                >
                 {props.tunebook.icons.zoomin}
                </Button>
                <Button
                  title="Zoom out"
                  variant="outline-dark"
                  onClick={function() {ee.emit('zoomout')}}
                >
                 {props.tunebook.icons.zoomout}
                </Button>
              </div>
              
    


    <div className="btn-group" style={{marginLeft:'0.5em'}} >
      <Button
        title="Seek Mode"
        variant="outline-primary"
        onClick={function() {setMode('seek') ; ee.emit("statechange", "cursor");}}
      >
       {props.tunebook.icons.seekmode}
      </Button>
      <Button
        title="Select Mode"
        variant="outline-primary"
        onClick={function() {setMode('select') ;ee.emit("statechange", "select");}}
      >
       {props.tunebook.icons.selectmode}
      </Button>
       <Button
        title="Align Mode"
        variant="outline-primary"
        onClick={function() {setMode('shift') ;ee.emit("statechange", "shift");}}
      >
       {props.tunebook.icons.dragmode}
      </Button>
      {mode === 'select' && <Button
        title="Trim"
        variant="info"
        onClick={function() {setIsChanged(true); ee.emit('trim')}}
      >Trim</Button>}
    </div>
    
              
                <Link style={{marginLeft:'1em'}}  to="/recordings" ><Button
                  title="Delete"
                  variant="danger"
                  className="btn-zoom-in"
                  onClick={function() {props.tunebook.recordingsManager.deleteRecording(recording)}}
                >
                   {props.tunebook.icons.deletebin}
                </Button>
                </Link>
              
              
               <div className="dbtn-group"  style={{float:'right', paddingRight:'1em', paddingTop:'0.1em', paddingBottom:'0.1em'}} >
                
                <Button style={{marginRight:'1em', color: 'black'}}
                  title="Mix and Save"
                  variant={isSaving ? "secondary" : "success"}
                  onClick={function() {
                    ee.emit('startaudiorendering', 'wav');
                    //props.tunebook.recordingsManager.deleteRecording(recording.id)
                    console.log('saveing',recording)
                    setIsSaving(true)
                  }}
                >Mix {props.tunebook.icons.save} {isSaving ? props.tunebook.icons.timer2line : null}</Button>
               
                <Button
                  onClick={function(e) {
                      if (isChanged) {
                        if (window.confirm('Do you really want to discard your changes?'))  {
                          navigate('/recordings')
                        }
                      } else {
                        navigate('/recordings')
                      } 
                  }}
                  title="Recordings Manager"
                  variant="info"
                >{props.tunebook.icons.playlist}</Button>
                
                
              </div>  
              <div>
                <input type='text' value={recordingTitle} 
                  
                  onChange={function(e) {
                    setRecordingTitle(e.target.value)
                    clearTimeout(titleChangeTimeout.current)
                    titleChangeTimeout.current = setTimeout(function() {
                      props.tunebook.recordingsManager.updateRecordingTitle(Object.assign({},
                        recording,
                        {title: recordingTitle}))
                      .then(function() { 
                        console.log('updated')
                      })
                    },500)
                    
                    
                    
                  }} style={{width:'80%'}} />
              </div>
            <div className="loading-data"></div>
            
          </Form>

        </div>
          
        
        <div id="recordingeditor" ref={editor}   >
        </div>
    </div>
}
        
// KEEP ME
//ee.on("select", updateSelect);

