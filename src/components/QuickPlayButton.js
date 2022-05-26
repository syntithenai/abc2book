import {Button, Dropdown, ButtonGroup} from 'react-bootstrap'
import {useState, useEffect} from 'react'
import {Link} from 'react-router-dom'

export default function QuickPlayButton(props) {
    //console.log('button',tune)
    
    const [started, setStarted] = useState()
    
    function clickPlay(e) {
      setStarted(true)
      props.tunebook.recordingsManager.playRecording(props.recording.id, function() {
        setStarted(false)
      })
      //clickStopPlaying()
      //tunebook.recordingsManager.stopRecording(tune).then(function() {
        //setTimeout(function() {
          //loadRecordings()
        //},200)
      //})
    }
    
    function clickStop(e) {
      setStarted(false)
      props.tunebook.recordingsManager.stopPlayRecording()
      //clickStopPlaying()
      //props.tunebook.recordingsManager.stopRecording(tune).then(function() {
        //setTimeout(function() {
          //loadRecordings()
        //},200)
      //})
    }
    
    
    if (!started) {
      return <Button  className='btn-success' onClick={clickPlay} >
        {props.tunebook.icons.start}
      </Button>
     
    } else {
      return <Button  className='btn-danger' onClick={clickStop} >
        {props.tunebook.icons.stop}
      </Button>
    }
 
  }
