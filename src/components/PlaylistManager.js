import {useState} from 'react'
import {Button, Modal, ListGroup} from 'react-bootstrap'
import {useNavigate, Link} from 'react-router-dom'

function PlaylistManager(props) {
  const [filter, setFilter] = useState(props.value);
  const [options, setOptions] = useState({});
  const navigate = useNavigate()
  return (
    <>
    {(props.mediaPlaylist && props.mediaPlaylist.tunes && props.mediaPlaylist.tunes.length > 0) && 
        <div style={{clear:'both',marginTop:'1em', borderTop: '1px solid black', backgroundColor:'white'}} >
          <h5 style={{marginTop:'1em'}} >Media Playlist</h5>
          
          <input type='text' value={filter} onChange={function(e) {setFilter(e.target.value)}}   />   
          <ListGroup  style={{clear:'both', width: '100%' ,backgroundColor:'white'}}>
            {props.mediaPlaylist.tunes.map(function(tune,tk) {
              return (!filter || filter.trim().length === 0 || tune && filter && tune.name && tune.name.toLowerCase().indexOf(filter.toLowerCase()) !== -1) ?  <ListGroup.Item   key={tk} className={(tk%2 === 0) ? 'even': 'odd'} style={{border:(tk === props.mediaPlaylist.currentTune ? '2px solid blue' : 'none')}} >
                <b style={{marginRight:'1em'}}>{tune.name}</b>
                <div style={{float:'right'}}>
                    <span>{tune.links.reverse().map(function(link,lk) {
                        return <Button key={lk} style={{marginRight:'0.1em'}}  variant="danger"  onClick={function() {
                                var newPL = props.mediaPlaylist
                                newPL.currentTune = tk
                               props.setMediaPlaylist(newPL)
                               navigate("/tunes/"+tune.id+"/playMedia/"+lk) 
                               setFilter('')
                               props.handleClose()
                            }} >{props.tunebook.icons.link} {props.tunebook.icons.play}  {lk}</Button>
                        
                    })}</span>
                    <Button variant="success"  onClick={function() {
                                var newPL = props.mediaPlaylist
                                newPL.currentTune = tk
                                props.setMediaPlaylist(newPL)
                                navigate("/tunes/"+tune.id+"/playMidi") 
                               setFilter('')
                               props.handleClose()
                            }} >{props.tunebook.icons.music} {props.tunebook.icons.play} </Button>
                </div>
              </ListGroup.Item> : null
            })}
          </ListGroup>

    </div>}
    </>
  );
}
export default PlaylistManager
