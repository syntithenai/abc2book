import {useState} from 'react'
import {Button, Modal, ListGroup} from 'react-bootstrap'
import {useNavigate, Link, useParams} from 'react-router-dom'

function AbcPlaylistManager(props) {
  const [filter, setFilter] = useState(props.value);
  const [options, setOptions] = useState({});
  var params = useParams()
  const navigate = useNavigate()
  
  return (
   <>{(props.abcPlaylist && props.abcPlaylist.tunes && props.abcPlaylist.tunes.length > 0) && <div style={{clear:'both',marginTop:'1em', borderTop: '1px solid black'}} >
        <h3>Midi Playlist</h3>
        
        
          <input type='text' value={filter} onChange={function(e) {setFilter(e.target.value)}}   />   
          <ListGroup  style={{clear:'both', width: '100%'}}>
            {(props.abcPlaylist && props.abcPlaylist.tunes) ? props.abcPlaylist.tunes.map(function(tune,tk) {
              return (!filter || filter.trim().length === 0 || tune && filter && tune.name && tune.name.toLowerCase().indexOf(filter.toLowerCase()) !== -1) ?  <ListGroup.Item  key={tk} className={(tk%2 === 0) ? 'even': 'odd'} style={{border:(tk === props.abcPlaylist.currentTune ? '2px solid blue' : 'none')}} >
                <Link to={"/tunes/"+tune.id} onClick={function() {var newPL = props.abcPlaylist
                    newPL.currentTune = tk
                   props.setAbcPlaylist(newPL); props.handleClose()}} ><b>{tune.name}</b></Link>
                <Button style={{float:'right'}} variant="success"  onClick={function() {
                    var newPL = props.abcPlaylist
                    newPL.currentTune = tk
                   props.setAbcPlaylist(newPL)
                   navigate("/tunes/"+tune.id+"/playMidi") 
                   setFilter('')
                   props.handleClose()
                   
                }} >{props.tunebook.icons.play}</Button>
                   
              </ListGroup.Item> : null
            }): null}
          </ListGroup>
        
    </div>}
    </>
  );
}
export default AbcPlaylistManager
