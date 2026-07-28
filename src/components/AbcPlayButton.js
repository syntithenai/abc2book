import {Button, Dropdown, ButtonGroup} from 'react-bootstrap'
import {useState, useEffect, useCallback} from 'react'
import {Link} from 'react-router-dom'
import QuickPlayButton from '../components/QuickPlayButton'

var ALLOW_RECORDING = false

export default function AbcPlayButton({tune, started, ready, isPlaying, clickInit, clickPlay, setIsPlaying, clickStopPlaying, tunebook, forceRefresh}) {
    
    const [isRecording, setIsRecording] = useState(false)
    const [recordings, setRecordings] = useState([])

    const loadRecordings = useCallback(function() {
      tunebook.recordingsManager.listRecordingsByTuneId(tune.id).then(function(list) {
        setRecordings(list.sort(function(a,b) {
          if (a && b && a.createdTimestamp < b.createdTimestamp) {
            return 1
          } else {
            return -1
          }
        }))
      })
    }, [tune, tunebook.recordingsManager])

    const clickStop = useCallback(function(e) {
      setIsRecording(false)
      clickStopPlaying()
      tunebook.recordingsManager.stopRecording(tune).then(function() {
        setTimeout(function() {
          loadRecordings()
        },200)
      })
    }, [clickStopPlaying, loadRecordings, tune, tunebook.recordingsManager])
    
    useEffect(function() {
      if (!isPlaying && isRecording) {
        clickStop()
      }
    },[isPlaying, isRecording, clickStop])
    
    function clickRecord(e) {
      setIsRecording(true)
      tunebook.recordingsManager.startRecording(tune).then(function() {
        clickPlay(0)
      })
    }
    
    useEffect(function() {
      if (ALLOW_RECORDING && tune && tune.id) {
        loadRecordings()
      }
      return function() {
        ////clickStop()
        //clickStopPlaying()
      }
    }, [loadRecordings, tune])
    
    var RecordingDropdown = function() {return null}
    if (ALLOW_RECORDING) {
        RecordingDropdown = function() {
          var items= [<Dropdown.Item key="admin" href="#/recordings">Recordings Manager</Dropdown.Item>, <Dropdown.Divider key="divider" />]
          recordings.forEach(function(recording,rk) {
            items.push(<Dropdown.Item key={rk} className={rk %2 === 1 ? 'odd' : 'even'} ><Link style={{textDecoration:'none', color:'black', marginRight:'1em'}} to={"/recordings/"+recording.id}>{new Date(recording.createdTimestamp).toLocaleDateString()} {new Date(recording.createdTimestamp).toLocaleTimeString()} </Link>
            <Button onClick={function() {tunebook.recordingsManager.downloadRecording(recording)}} >{tunebook.icons.save}</Button>
            <Button style={{marginLeft:'0.1em'}} variant="danger" onClick={function(e) {tunebook.recordingsManager.deleteRecording(recording); loadRecordings()}}>{tunebook.icons.deletebin}</Button>
            <QuickPlayButton tunebook={tunebook} recording={recording} />
            </Dropdown.Item>)
          })
          
          return <Dropdown as={ButtonGroup} style={{color:'black', marginRight:'0.2em'}} >
            <Button   id="abcrecordbutton" className='btn-danger' size="lg"  onClick={function(e) {clickRecord() }} >
              {tunebook.icons.recordcircle}
            </Button>
            <Dropdown.Toggle split variant="danger" id="dropdown-split-basic" style={{color:'black'}} />
            <Dropdown.Menu>
              {items}
            </Dropdown.Menu>
          </Dropdown>
        }
    }
    
    if (!started) {
      return  <Button  id="abcplaybutton"  className='btn-secondary' size="lg"  style={{float:'right'}} onClick={function(e) { e.stopPropagation();  clickInit(e)}}  >
        {tunebook.icons.start}
      </Button>
             
    } else {
        if (!ready) {
          if (!isPlaying) {
            return <Button  id="abcplaybutton" className='btn-secondary' size="lg"  style={{float:'right'}}   >
              {tunebook.icons.timer}
              {tunebook.icons.start}
            </Button>
          } else {
            return <Button  id="abcplaybutton" className='btn-secondary' size="lg" style={{float:'right'}} onClick={clickStop} >
              {tunebook.icons.timer}
              {tunebook.icons.stop}
            </Button>
            
          }
        } else {
          //<Button onClick={function(e) {tunebook.recordingsManager.playRecording(recording.id)}}>{tunebook.icons.play}</Button>
            
          if (!isPlaying) {
            
           
            
            return <><Button   id="abcplaybutton" className='btn-success' size="lg" style={{float:'right'}} onClick={function(e) {clickPlay() }} >
              {tunebook.icons.start}
            </Button>
            <RecordingDropdown />
            
            
            </>
          } else {
            return <Button id="abcplaybutton"  className='btn-danger' size="lg"  style={{float:'right'}} onClick={clickStop} >
              {tunebook.icons.stop}
            </Button>
          }
        }
    }
  }
