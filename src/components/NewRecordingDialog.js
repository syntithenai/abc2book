import {useState, useEffect, useCallback} from 'react'
import {Button, Modal, ListGroup, Form} from 'react-bootstrap'
import VoiceFillInput from './VoiceFillInput'

function NewRecordingDialog(props) {
  const { tunebook, recording: currentRecording } = props
  const [show, setShow] = useState(false);

  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);
  const  [recordings , setRecordings] = useState([])
  const  [searchText , setSearchText] = useState('')
    
    
    const loadRecordings = useCallback(function() {
      tunebook.recordingsManager.listRecordings().then(function(recordings) {
          if (searchText && searchText.length > 0) {
            setRecordings(
              recordings
              .filter(function(item) {
              
                if (item.title && item.title.trim() && item.title.toLowerCase().indexOf(searchText.toLowerCase()) !== -1) {
                  if (currentRecording && currentRecording.id && currentRecording.id === item.id) {
                    return false
                  } else {
                    return true
                  }
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
            setRecordings(recordings.filter(function(item) {
                if (currentRecording && currentRecording.id && currentRecording.id === item.id) {
                  return false
                } else {
                  return true
                }
              }).sort(function(a,b) {
                if (a && b && a.createdTimestamp < b.createdTimestamp) {
                  return 1
                } else {
                  return -1
                }
              }))
          }
       })
    }, [tunebook, searchText, currentRecording])
    
    
    function fileSelected (event) {
      props.ee.emit("newtrack", event.target.files[0] );
      props.setIsChanged(true)
      handleClose()
    }
    
    function recordingSelected (recording) {
      tunebook.recordingsManager.loadRecording(recording.id).then(function(rec) {
          props.setIsChanged(true)
          props.ee.emit("newtrack", rec.data );
          handleClose()
      })
      //props.ee.emit("newtrack", event.target.files[0] );
      //handleClose()
    }
    
    
    
    
    useEffect(function() {
       loadRecordings()
    },[loadRecordings])
    
  return (
    <>
      <Button  variant="success" onClick={handleShow}>
        +
      </Button>

      <Modal  style={{minWidth:'500px'}} show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>New Track</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div style={{width:'100%'}} >
            <Form>
              <Button style={{marginRight:'2em', float:'left'}}
                variant="danger"
                title="Record"
                size="lg"
                onClick={function() {props.ee.emit('record'); handleClose()}}
              >
                  {props.tunebook.icons.recordcircle}
                </Button>
              
              <Form.Control  style={{fontSize:'0.7em' ,width:'15em' ,float:'right'}} type='file' onChange={fileSelected} accept="audio/wav" />
              
              <div style={{width:'100%', clear:'both', paddingTop:'1em'}} >
                <h6>Select a Recording</h6>
                 <VoiceFillInput
                   layout="wrap"
                   className="w-100"
                   style={{clear:'both'}}
                   useFormControl={false}
                   type="text"
                   value={searchText}
                   onChange={function(e) { setSearchText(e.target.value) }}
                   setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                   token={props.token}
                   fieldKind="search"
                 />
                 <ListGroup className="recordings">
                {recordings.map(function(recording, rk) {
                  return <ListGroup.Item onClick={function(e) {recordingSelected(recording)}} className={rk %2 === 1 ? 'odd' : 'even'} key={rk} >
                    <div><b>{recording.title}</b>  <span style={{marginLeft:'1.5em',fontSize:'0.8em'}}>{new Date(recording.createdTimestamp).toLocaleDateString()} {new Date(recording.createdTimestamp).toLocaleTimeString()}</span></div>
                </ListGroup.Item>
                })}
              </ListGroup>
              
            </div>
            </Form>
          </div>
        </Modal.Body>
      </Modal>
    </>
  );
}
export default NewRecordingDialog
