import {useState} from 'react'
import {Button, Modal, Badge} from 'react-bootstrap'
import useGoogleDocument from '../useGoogleDocument'
import {Form} from 'react-bootstrap';
import {useNavigate} from 'react-router-dom'

export default function BulkChangeValueModal({tunebook, selected, onClose, forceRefresh}) {
  //console.log({tunebook, token,googleDocumentId, tiny, tuneId,currentTuneBook, variant})
  const [show, setShow] = useState(false);
  const navigate = useNavigate()
  const [selectedField, setSelectedField] = useState('');
  const [value, setValue] = useState('');
 
  const handleClose = () => {
      setShow(false);
      if (onClose) onClose()
  }
  const handleShow = () => setShow(true);
  
  function apply() {
      //console.log('apply',selectedField,value)
      var currentSelection = Object.keys(selected).filter(function(item) {
        return (selected[item] ? true : false)
      })
      tunebook.bulkChangeTunes(currentSelection, selectedField, value)
      //.then(function() {
      //setTimeout(function() {
      //navigate('/blank')
      //setTimeout(function() {
          //navigate('/tunes')
      //},500)
        //forceRefresh()
        //handleClose()
      //})
      forceRefresh()
      handleClose()
  }
  
  var selectedCount = Object.keys(selected).filter(function(item) {
        return (selected[item] ? true : false)
      }).length
      
  return (
    <>
      <Button variant={"warning"}  onClick={function() {
                   handleShow()
              
            }}>
        {tunebook.icons.pencil}
      </Button>

      <Modal  show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Bulk Update</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{height:'40em'}}>
            <Form.Text style={{marginBottom:'1.5em', display:'block'}} >
            Change a field value in {selectedCount} selected tunes
            </Form.Text>
            <Form.Label>Field to change</Form.Label>
           <Form.Select onChange={function(e) {setSelectedField(e.target.value)}} value={selectedField} >
              <option value=""></option>
              <option value="key">Key</option>
              <option value="tuning">Tuning</option>
              <option value="meter">Time Signature</option>
              <option value="tempo">Tempo</option>
              <option value="boost">Confidence</option>
              <option value="difficulty">Difficulty</option>
              <option value="rhythm">Rhythm</option>
              <option value="composer">Artist</option>
              <option value="tranpose">Transpose</option>
              <option value="repeats">Repeats</option>
              <option value="srcUrl">Source URL</option>
           </Form.Select>
           <Form.Label>New Value</Form.Label>
           <Form.Control type="text" placeholder="" onChange={function(e) {setValue(e.target.value)}} value={value} />
           <div style={{marginTop:'1em'}} >
               {(selectedField && value !== null) && <Button style={{marginRight:'1em'}}  variant="success" onClick={apply}  >Save</Button>}
               {(!selectedField || value === null) && <Button style={{marginRight:'1em'}}  variant="secondary"   >Save</Button>}
               <Button variant="danger" onClick={handleClose} >Cancel</Button>
           </div>
        </Modal.Body>
      </Modal>
    </>
  );
}
