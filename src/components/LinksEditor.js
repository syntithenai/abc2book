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
    
    
  function fileSelected (event, callback) {
      function readFile(file){
          var reader = new FileReader();
          reader.onloadend = function(){
            //console.log("loaded",reader.result)
            if (reader.result.trim().length > 0) {
              callback(reader.result)
            }
          }
          if(file){
              reader.readAsDataURL(file);
          }
      }
      readFile(event.target.files[0])
  }

  const [warning, setWarning] = useState('')
  
    
  return (
    <div  >
        <div style={{textAlign:'right'}} >
          
          {(warning && warning.length  > 0) && <b>{warning}</b>}
                    
            {localStorage.getItem('bookstorage_inlineaudio') === "true" && <Button variant="success" style={{marginBottom:'0.6em', marginRight:'0.6em'}} ><Form.Control style={{backgroundColor:'#c7eedb'}} type='file'  accept="audio/*" onChange={function(e) {
                fileSelected(e,function(data) {
                    //console.log((data ? data.slice(0,50) : 'nodata'),e)
                    var type = e.target.files[0].type
                    var filename = e.target.files[0].name
                    console.log(type)
                    if (type.startsWith('audio/')) {
                        //console.log('have audioset link')
                        var links = Array.isArray(props.tune.links) ? props.tune.links : []
                        //.split(".").slice(0,-1).join(".")
                        var newLink = {link: data, title:filename, startAt:'', endAt: ''}
                        links.unshift(newLink)
                        var tune = props.tune
                        tune.links = links; 
                        setWarning(null)
                        props.tunebook.saveTune(tune); 
                    } else {
                        //console.log("setwarning",lk)
                        setWarning('You can only attach audio files, not '+type)
                    }
                     e.target.value=''
                })
            }  } /></Button>}
            
          
          <span  >
            <YouTubeSearchModal onClick={props.handleClose} tunebook={props.tunebook}  onChange={function(link) {
                    var tune = props.tune
                    var links = Array.isArray(props.tune.links) ? props.tune.links : []
                    links.unshift({title:link.title, link: link.link, startAt:'', endAt: ''})
                    tune.links = links
                    if (props.autoPlay && props.setStartPlaying) props.setStartPlaying()
                    props.tunebook.saveTune(tune); 
                    
                }}
                setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts} 
                triggerElement={<>Search YouTube</>}
                value={(props.tune.name ? props.tune.name : '') + (props.tune.composer ? ' ' + props.tune.composer : '')}
            />
          </span>
          <Button style={{marginLeft:'0.3em',color:'black'}} variant="success" onClick={function(e) {
                var links = Array.isArray(props.tune.links) ? props.tune.links : []
                links.unshift({title:'', link:'', startAt:'', endAt: ''})
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
                            if (window.confirm("Are you sure you want to delete this audio?")) {
                                var links = props.tune.links
                                links.splice(lk,1)
                                var tune = props.tune
                                tune.links = links; 
                                props.tunebook.saveTune(tune); 
                            }
                        }} >{props.tunebook.icons.deletebin}</Button>
                        {(props.tune && Array.isArray(props.tune.links) && props.tune.links.length > lk && props.tune.links[lk] && props.tune.links[lk].link && props.tune.links[lk].link.startsWith("data:audio/")) && <Button  style={{float:'right', marginRight:'0.3em'}} variant="primary" onClick={function() {
                            //setIsPlayingLink(lk)
                            //navigate("/tunes/"+props.tune.id+'/playMedia/'+lk)
                            var a = document.createElement("a"); //Create <a>
                            a.href = link.link
                            a.download = link.title; //File name Here
                            a.click(); //Downloaded file
                            
                            
                            //var url = window.URL.createObjectURL(window.location.href);
                            //var a = document.createElement("a");
                            //document.body.appendChild(a);
                            //a.style = "display: none";
                            //a.href = url;
                            ////a.download = (tune.name ? tune.name : 'download') + ".midi";
                            //a.click();
                            //window.URL.revokeObjectURL(url);
                        }} >{props.tunebook.icons.save}</Button>}
                        
                        {<Button  style={{float:'right', marginRight:'0.3em'}} variant="success" onClick={function() {
                            //setIsPlayingLink(lk)
                            navigate("/tunes/"+props.tune.id+'/playMedia/'+lk)
                        }} >{props.tunebook.icons.play}</Button>}
                        
                        {(props.tune && Array.isArray(props.tune.links) && props.tune.links.length > lk && props.tune.links[lk] && props.tune.links[lk].link && props.tune.links[lk].link.indexOf("youtube") !== -1) && <a target="_new" href={props.tune.links[lk].link} ><Button  style={{float:'right', marginRight:'0.3em'}} variant="primary" onClick={function() {
                            
                        }} >{props.tunebook.icons.externallink}</Button></a>}
                        
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
                        
                      
                        {!(props.tune && Array.isArray(props.tune.links) && props.tune.links.length > lk && props.tune.links[lk] && props.tune.links[lk].link && props.tune.links[lk].link.startsWith("data:audio/")) && <> <Form.Label>Link</Form.Label> 
                       <Form.Control  onBlur={function() {props.setBlockKeyboardShortcuts(false)}} onFocus={function() {props.setBlockKeyboardShortcuts(true)}}  type='text' value={link.link} onChange={function(e) {
                            var links = props.tune.links
                            links[lk].link = e.target.value
                            var tune = props.tune
                            tune.links = links; 
                            props.tunebook.saveTune(tune); 
                        }  } /></>}
                        
                        
                    </Form.Group>
                    <Form.Group style={{borderBottom:'2px solid black', marginBottom:'0.3em' ,width:'100%'}} >
                      <Form.Label>Start At (seconds)</Form.Label> 
                       <Form.Control  onBlur={function() {props.setBlockKeyboardShortcuts(false)}} onFocus={function() {props.setBlockKeyboardShortcuts(true)}}  type='text' value={link.startAt} onChange={function(e) {
                            var links = props.tune.links
                            links[lk].startAt = e.target.value
                            var tune = props.tune
                            tune.links = links; 
                            props.tunebook.saveTune(tune); 
                        }  } />
                    </Form.Group>
                    
                    <Form.Group style={{borderBottom:'2px solid black', marginBottom:'0.3em' ,width:'100%'}} >
                      <Form.Label>End At (seconds)</Form.Label> 
                       <Form.Control  onBlur={function() {props.setBlockKeyboardShortcuts(false)}} onFocus={function() {props.setBlockKeyboardShortcuts(true)}}  type='text' value={link.endAt} onChange={function(e) {
                            var links = props.tune.links
                            links[lk].endAt = e.target.value
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
