import {ListGroup, Button} from 'react-bootstrap'
import {useNavigate} from 'react-router-dom'
import YouTube from 'react-youtube';  

export default function DownloadPlaylistPage(props) {
    
    const navigate = useNavigate()
    
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
    
    return <div><ListGroup  style={{clear:'both', width: '100%'}}>
            {props.mediaPlaylist && props.mediaPlaylist.tunes && props.mediaPlaylist.tunes.map(function(tune,tk) {
              
              return <ListGroup.Item  key={tk} className={(tk%2 === 0) ? 'even': 'odd'}  >
                <b>{tune.name}</b>
                <div>{tune.links.map(function(link,lk) {
                    return <div style={{borderBottom:'1px solid black',borderTop:'1px solid black', minHeight:'3em'}} >
                        
                        <span>{link.title}</span>
                        {!isYoutubeLink(link.link) ? <div style={{clear:'both'}} ><video   
                            style={{maxWidth:'150px',maxHeight:'150px'}}  autoPlay={false}  controls={true}
                            >
                                <source src={link.link} type="video/ogg" />
                                Your browser does not support the video tag.
                                </video></div> : <div style={{clear:'both'}} >
                                
                                <YouTube videoId={getYouTubeId(link.link)} opts={{
                                  height: '150px',
                                  width: '150px',
                                  playerVars: {
                                    loop : 0,
                                    autoplay: 1,
                                    controls: 1,
                                  },
                                }} 
                                
                                onStateChange={
                                    function(e) {
                                        if (e.data === 1) {
                                             e.target.stopVideo()
                                        }
                                    }
                                } 
                                 /> 
                                 </div> 
                            }
                        </div>
                })}</div>
              </ListGroup.Item>
              
            })}
          </ListGroup></div>
}
