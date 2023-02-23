import {useState} from 'react'
import {Button, Modal, ListGroup} from 'react-bootstrap'
import {useNavigate, Link, useParams} from 'react-router-dom'

function AbcPlaylistManagerModal(props) {
  const [show, setShow] = useState(false);
  const [filter, setFilter] = useState(props.value);
  const [options, setOptions] = useState({});
  var params = useParams()
  const handleClose = () => {
    setShow(false);
  }
  const handleShow = () => setShow(true);
  const navigate = useNavigate()
  
  return (
   <>{(props.abcPlaylist && props.abcPlaylist.tunes && props.abcPlaylist.tunes.length > 0) && <>
      <Button onClick={handleShow} variant="primary" size="xl" >{props.tunebook.icons.menu}</Button>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Midi Playlist</Modal.Title>
          
        </Modal.Header>
       
        {<>
        <Modal.Body>
        <div>
           <Button onClick={function() {props.tunebook.navigateToPreviousSong(params.tuneId,navigate); handleClose()}} >{props.tunebook.icons.skipback}</Button>
           <Button onClick={function() {props.tunebook.navigateToNextSong(params.tuneId,navigate); handleClose()}} >{props.tunebook.icons.skipforward}</Button>
        </div>
          <input type='text' value={filter} onChange={function(e) {setFilter(e.target.value)}}   />   
        </Modal.Body>
        <Modal.Footer>
          <ListGroup  style={{clear:'both', width: '100%'}}>
            {(props.abcPlaylist && props.abcPlaylist.tunes) ? props.abcPlaylist.tunes.map(function(tune,tk) {
              return (!filter || filter.trim().length === 0 || tune && filter && tune.name && tune.name.toLowerCase().indexOf(filter.toLowerCase()) !== -1) ?  <ListGroup.Item  key={tk} className={(tk%2 === 0) ? 'even': 'odd'} style={{border:(tk === props.abcPlaylist.currentTune ? '2px solid blue' : 'none')}} >
                <Link to={"/tunes/"+tune.id} onClick={function() {var newPL = props.abcPlaylist
                    newPL.currentTune = tk
                   props.setAbcPlaylist(newPL); handleClose()}} ><b>{tune.name}</b></Link>
                <Button style={{float:'right'}} variant="success"  onClick={function() {
                    var newPL = props.abcPlaylist
                    newPL.currentTune = tk
                   props.setAbcPlaylist(newPL)
                   navigate("/tunes/"+tune.id+"/playMidi") 
                   setFilter('')
                   handleClose()
                   
                }} >{props.tunebook.icons.play}</Button>
                   
              </ListGroup.Item> : null
            }): null}
          </ListGroup>
        </Modal.Footer></>}
      </Modal></>}
    </>
  );
}
export default AbcPlaylistManagerModal
