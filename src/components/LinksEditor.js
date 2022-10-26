import {useState, useEffect, useRef} from 'react'
import {Button, ListGroup, Form} from 'react-bootstrap'
import YouTubeSearchModal from './YouTubeSearchModal'
import YouTube from 'react-youtube';  
import {Link , useParams , useNavigate} from 'react-router-dom'

export default function LinksEditor(props) {
    const navigate = useNavigate()
    const [isPlayingLink, setIsPlayingLink] = useState(null)
    const audioPlayer = useRef(); 
    const [showMedia, setShowMedia] = useState(false)
    const [mediaLoading, setMediaLoading] = useState(false)
    const [ytMediaPlayer, setYTMediaPlayer] = useState(null)
    const [mediaProgress, setMediaProgress] = useState(0)
    function getYouTubeId(url) {
        const arr = url.split(/(vi\/|v%3D|v=|\/v\/|youtu\.be\/|\/embed\/)/);
        return undefined !== arr[2] ? arr[2].split(/[^\w-]/i)[0] : arr[0];
    }
    
    function isYoutubeLink(urlToParse){
        if (urlToParse) {
            var regExp = /^(?:https?:\/\/)?(?:m\.|www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})(?:\S+)?$/;
            if (urlToParse.match(regExp)) {
                return true;
            }
        }
        return false;
    }
    
    
  return (
    <div  >
        <div style={{textAlign:'right'}} >
          <span  >
            <YouTubeSearchModal onClick={props.handleClose} tunebook={props.tunebook} links={props.tune.links}  onChange={function(links) {
                    var tune = props.tune
                    tune.links = links; 
                    props.tunebook.saveTune(tune); 
                }}
                setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts} 
                triggerElement={<>{props.tunebook.icons.youtube} Search YouTube</>}
                value={(props.tune.name ? props.tune.name : '') + (props.tune.composer ? ' ' + props.tune.composer : '')}
            />
          </span>
          <Button style={{marginLeft:'0.3em',color:'black'}} variant="success" onClick={function() {
                var links = props.tune.links
                links.unshift({title:'', link:''})
                var tune = props.tune
                tune.links = links; 
                props.tunebook.saveTune(tune); 
            }} >{props.tunebook.icons.add} New Link</Button>
        </div>
        <Form >
            <div style={{clear:'both'}}>
                {(isPlayingLink !== null && Array.isArray(props.tune.links) && props.tune.links[isPlayingLink]) ? <>
                    <>{!isYoutubeLink(props.tune.links[isPlayingLink].link) ? <audio  ref={audioPlayer} onCanPlay={function(event) {  }} width="1px" height="1px" autoPlay={true} >
                    <source src={props.tune.links[isPlayingLink].link} type="video/ogg" />
                    Your browser does not support the video tag.
                    </audio> : <div style={{clear:'both'}} >
                    
                    <YouTube videoId={getYouTubeId(props.tune.links[isPlayingLink].link)} opts={{
                      height: '1px',
                      width: '1px',
                      playerVars: {
                        loop : 1,
                        controls: 0,
                      },
                    }} onReady={function(event) {setYTMediaPlayer(event.target);  event.target.playVideo()}} /> 
                    </div>}</>
                </>:''}
            
            {Array.isArray(props.tune.links) && props.tune.links.map(function(link,lk) {
                return <div key={lk} style={{marginTop:'0.3em', backgroundColor:'lightgrey', border:'1px solid black', padding:'0.3em'}} >
                    
                    <Form.Group  >
                        <Button variant="danger" style={{float:'right'}} onClick={function() {
                            //if (window.confirm("Are you sure you want to delete this link?")) {
                                var links = props.tune.links
                                links.splice(lk,1)
                                var tune = props.tune
                                tune.links = links; 
                                props.tunebook.saveTune(tune); 
                            //}
                        }} >{props.tunebook.icons.deletebin}</Button>
                        {<Button  style={{float:'right', marginRight:'0.3em'}} variant="success" onClick={function() {
                            //setIsPlayingLink(lk)
                            navigate("/tunes/"+props.tune.id+'/playMedia/'+lk)
                        }} >{props.tunebook.icons.play}</Button>}
                        
                        
                        <Form.Label  >Title</Form.Label>
                        <Form.Control  onBlur={function() {props.setBlockKeyboardShortcuts(false)}} onFocus={function() {props.setBlockKeyboardShortcuts(true)}}  type='text' value={link.title} onChange={function(e) {
                            var links = props.tune.links
                            links[lk].title = e.target.value
                            var tune = props.tune
                            tune.links = links; 
                            props.tunebook.saveTune(tune); 
                        }  } />
                        
                    </Form.Group>
                    <Form.Group style={{borderBottom:'2px solid black', marginBottom:'0.3em' ,width:'100%'}} >
                        <Form.Label>Link</Form.Label> 
                        <Form.Control  onBlur={function() {props.setBlockKeyboardShortcuts(false)}} onFocus={function() {props.setBlockKeyboardShortcuts(true)}}  type='text' value={link.link} onChange={function(e) {
                            var links = props.tune.links
                            links[lk].link = e.target.value
                            var tune = props.tune
                            tune.links = links; 
                            props.tunebook.saveTune(tune); 
                        }  } />
                    </Form.Group>
                    
                </div>
            }) }
            </div>
        </Form>
    </div>
  );
}
//  
