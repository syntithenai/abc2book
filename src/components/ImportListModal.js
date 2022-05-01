import {useState} from 'react'
import {Button, Modal} from 'react-bootstrap'
import ListSelectorModal from './ListSelectorModal'
function ImportListModal(props) {
  const [show, setShow] = useState(false);
  const [list, setList] = useState('');
  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);
  var [tuneBook, setTuneBook] = useState('')
  
  function getOptions() {
      return {'a':'a ver a ','b is a nother key': 'bbbbbbbbbbbbbbbbbs'}
  }
  
  function getSearchOptions(filter) {
      var opts = getOptions()
      var filtered = {}
      Object.keys(opts).forEach(function(key) {
          var val = opts[key]
          if (val && val.indexOf(filter) !== -1) {
              filtered[key] = val
          }
      })
      return filtered
  }
  return (
    <>
      <Button  style={{color:'black'}} variant="secondary" onClick={handleShow}>
        {props.tunebook.icons.folderin} List
      </Button>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Import a list of songs</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div style={{backgroundColor:'lightblue', padding:'0.3em', height:'7em'}} >
          <div style={{borderBottom:'1px solid black', marginBottom:'1em', padding:'0.3em'}} > 
            Import into &nbsp;&nbsp;
            <ListSelectorModal title={'Select a Tunebook'} value={tuneBook} onChange={function(val) {console.log('sel',val) ;props.setCurrentTuneBook(val)}} defaultOptions={getOptions} searchOptions={getSearchOptions} triggerElement={<Button variant="primary" >TuneBook <b>{props.currentTuneBook}</b></Button>} extraButtons={[<Button>New Book</Button>, <Button>Collections</Button>]} />
          </div>
          <Button style={{float:'left', marginBottom:'0.5em'}} variant="primary" onClick={handleClose}>Import</Button>
          <span style={{marginLeft:'0.5em',width:'30%', float:'left'}} ><input style={{float:'left'}} className='btn' variant="primary" type="file" onClick={handleClose} /></span>
          </div>
          <textarea value={list} onChange={function(e) {setList(e.target.value)}} style={{width:'100%', minHeight: '10em', clear:'both'}}  />
        </Modal.Body>
      </Modal>
    </>
  );
}
export default ImportListModal
