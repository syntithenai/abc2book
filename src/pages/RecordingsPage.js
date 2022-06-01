import { Link  } from 'react-router-dom'
import {Button, ListGroup} from 'react-bootstrap'
import {useState, useEffect} from 'react'
import QuickPlayButton from '../components/QuickPlayButton'

export default function RecordingsPage(props) {
    const  [recordings , setRecordings] = useState([])
    const  [searchText , setSearchText] = useState('')
    
    //console.log(props)
    function loadRecordings() {
      props.tunebook.recordingsManager.listRecordings().then(function(recordings) {
        console.log("listed", recordings)
          if (searchText && searchText.length > 0) {
            setRecordings(
              recordings
              .filter(function(recording) {
                if (recording.title && recording.title.toLowerCase().indexOf(searchText.toLowerCase()) !== -1) {
                  return true
                } else {
                  return false
                }
              })
              .sort(function(a,b) {
                if (a && b && a.createdTimestamp < b.createdTimestamp) {
                  return 1
                } else {
                  return -1
                }
              }))
          } else {
            setRecordings(recordings.sort(function(a,b) {
                if (a && b && a.createdTimestamp < b.createdTimestamp) {
                  return 1
                } else {
                  return -1
                }
              }))
          }
       })
    }
    
    useEffect(function() {
       loadRecordings()
    },[searchText])
  
    return <div className="recordingsmanager" >
    <Button style={{float:'right',marginRight:'1em'}} variant="success" onClick={function(e) {
        var title = window.prompt('Enter a title for the recording')
        if (title && title.trim()) {
          props.tunebook.recordingsManager.newRecording(title).then(function() {  
            loadRecordings()
          })
        }
      }}>{props.tunebook.icons.add}</Button>
    <h3>Recordings</h3>
      
      <input type='search' value={searchText} onChange={function(e) {setSearchText(e.target.value)}} />
      <ListGroup className="recordings">
        {recordings.map(function(recording, rk) {
              return <ListGroup.Item className={rk %2 === 1 ? 'odd' : 'even'} key={rk} >
                <Link to={'/recordings/'+recording.id} ><b>{recording.title}</b>  <span style={{marginLeft:'1.5em',fontSize:'0.8em'}}>{new Date(recording.createdTimestamp).toLocaleDateString()} {new Date(recording.createdTimestamp).toLocaleTimeString()}</span></Link>
                <span style={{marginLeft:'1em'}} >{recording.bitLength ? Math.floor(recording.bitLength/1024) + "Kb" : ''}</span>
                <span style={{width:'30%'}} >
                  <span style={{float:'right',marginRight:'0.1em'}} ><QuickPlayButton tunebook={props.tunebook} recording={recording} /></span>
                  
                  <Button style={{float:'right',marginRight:'0.1em'}}  onClick={function() {props.tunebook.recordingsManager.downloadRecording(recording.id)}} >{props.tunebook.icons.save}</Button>
                
                  
                  <Button style={{float:'right',marginRight:'0.1em'}} variant="danger" onClick={function(e) {props.tunebook.recordingsManager.deleteRecording(recording); loadRecordings()}}>{props.tunebook.icons.deletebin}</Button>
                </span>
            </ListGroup.Item>
            
        })}
      </ListGroup>
    </div>
}


// <Button style={{float:'right',marginRight:'0.1em'}} variant="success" onClick={function(e) {props.tunebook.recordingsManager.playRecording(recording.id)}}>{props.tunebook.icons.play}</Button>
               
