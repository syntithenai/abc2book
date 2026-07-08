import {useState} from 'react'
import {Button, Modal, ListGroup} from 'react-bootstrap'
import {useNavigate, Link} from 'react-router-dom'

function PlaylistManagerModal(props) {
  const [show, setShow] = useState(false);
  const [filter, setFilter] = useState(props.value);
  const [options, setOptions] = useState({});
  const handleClose = () => {
    setShow(false);
  }
  const handleShow = () => {
      setShow(true);
      //console.log('SHOW',props.mediaPlaylist.currentTune)
      //if (props.mediaPlaylist.currentTune > 0) {
          //console.log('SCROLLTO','playlist-tune-'+props.mediaPlaylist.currentTune)
        //setTimeout(function() {
            //props.tunebook.utils.scrollTo('playlist-tune-'+props.mediaPlaylist.currentTune)
        //},200)
      //}
  }
  const navigate = useNavigate()
  return (
    <>
    {(props.mediaPlaylist && props.mediaPlaylist.tunes && props.mediaPlaylist.tunes.length > 0) && 
        <>
      <Button onClick={handleShow} variant="primary" size="xl" >{props.tunebook.icons.menu}</Button>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Media Playlist</Modal.Title>
          
        </Modal.Header>
       
        {<>
        <Modal.Body>
          <input type='text' value={filter} onChange={function(e) {setFilter(e.target.value)}}   />   
        </Modal.Body>
        <Modal.Footer>
          <ListGroup  style={{clear:'both', width: '100%'}}>
            {props.mediaPlaylist.tunes.map(function(tune,tk) {
              return (!filter || filter.trim().length === 0 || tune && filter && tune.name && tune.name.toLowerCase().indexOf(filter.toLowerCase()) !== -1) ?  <ListGroup.Item   key={tk} className={(tk%2 === 0) ? 'even': 'odd'} style={{border:(tk === props.mediaPlaylist.currentTune ? '2px solid blue' : 'none')}} >
                <b >{tune.name}</b>
                <div>{tune.links.map(function(link,lk) {
                    return <div key={lk} style={{borderBottom:'1px solid black',borderTop:'1px solid black', minHeight:'3em'}} >
                        <Button style={{float:'right'}} variant="success"  onClick={function() {
                            var newPL = props.mediaPlaylist
                            newPL.currentTune = tk
                           props.setMediaPlaylist(newPL)
                           navigate("/tunes/"+tune.id+"/playMedia/"+lk) 
                           setFilter('')
                           handleClose()
                           
                        }} >{props.tunebook.icons.play}</Button>
                        
                        
                    </div> 
                })}</div>
              </ListGroup.Item> : null
            })}
          </ListGroup>
        </Modal.Footer></>}
      </Modal>
    </>}
    </>
  );
}
export default PlaylistManagerModal
