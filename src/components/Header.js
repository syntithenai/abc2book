import { Link  , useLocation} from 'react-router-dom'
import {Badge, Button, Dropdown, ButtonGroup} from 'react-bootstrap'
import TempoControl from './TempoControl' 
import GoogleAd from './GoogleAd'
import ShareTunebookModal from './ShareTunebookModal'
import MediaPlayerOptionsModal from './MediaPlayerOptionsModal'
//import AbcPlaylistManagerModal from './AbcPlaylistManagerModal'

//import PlaylistManagerModal from './PlaylistManagerModal'
 ////<AbcPlaylistManagerModal tunebook={props.tunebook} abcPlaylist={props.abcPlaylist} setAbcPlaylist={props.setAbcPlaylist} />
                  ////<PlaylistManagerModal tunebook={props.tunebook} mediaPlaylist={props.mediaPlaylist} setMediaPlaylist={props.setMediaPlaylist} />

import {useEffect, useState} from 'react'
import {isMobile} from 'react-device-detect';
import {useNavigate, useParams} from 'react-router-dom'
import MediaPlayerButtons from './MediaPlayerButtons'
import useKeyPress from '../useKeyPress';


export default function Header(props) {
    var location = useLocation()
    var navigate = useNavigate()
    //console.log(props.token)
    //var params = useParams() // empty  ???
    var parts = location.pathname.split("/")
    var params = {tuneId: parts.length >= 3 ? parts[2] : null}
    const [userImageError, setUserImageError] = useState(false)
    useEffect(function() {
        //console.log(props.user, props.token)
        setUserImageError(false)
        if (props.token && props.user) props.loadUserImage(props.token, props.user)
    },[props.user])
    
    useEffect(function() {
        //console.log("FORCE NAV", props.forceNav)
        if (props.forceNav) {
            //console.log("REALLY FORCE NAV", props.forceNav)
            props.setForceNav(null)
            navigate(props.forceNav)
        }
    },[props.forceNav])
    
    const [width, setWidth] = useState(window.innerWidth);
    const breakpoint = 620;

    useEffect(() => {
    /* Inside of a "useEffect" hook add an event listener that updates
       the "width" state variable when the window size changes */
    window.addEventListener("resize", () => {setWidth(window.innerWidth)});

    /* passing an empty array as the dependencies of the effect will cause this
       effect to only run when the component mounts, and not each time it updates.
       We only want the listener to be added once */
    }, []);

    const onKeyPress = (event) => {
        if (!props.blockKeyboardShortcuts) {
            if (event.key === 'ArrowRight' && location.pathname.startsWith('/tunes/') && params.tuneId) {
                props.tunebook.navigateToNextSong(params.tuneId,navigate)
                //props.setCurrentTune(params.tuneId)
            } else if (event.key === 'ArrowLeft' && location.pathname.startsWith('/tunes/') && params.tuneId) {
                props.tunebook.navigateToPreviousSong(params.tuneId,navigate)
                //props.setCurrentTune(params.tuneId)
            }
            //console.log(`key pressed: ${event.key}`);
        }
    };
    useKeyPress(['ArrowRight', 'ArrowLeft'], onKeyPress);

    var dropdownStyle = {fontSize:'0.7em', display:'inline', width:'22px', height:'22px', marginBottom:'0.3em'}
    if (location.pathname.startsWith('/print')) return null
    var selected = props.selected ? Object.keys(props.selected).map(function(v) {
        if (props.selected[v]) {
             return v
        } else {
            return ''
        }
    }).join(",") : ''
    //console.log("param  ",params,location)
    return <header className="App-header" style={{zIndex:11, fontSize:'1.2em'}} >
        <span>
            <ButtonGroup>
               {(width > breakpoint) &&<Link to="/books" ><Button size="lg" variant="info" style={{marginLeft:'0em', color: 'black', border: (location.pathname === '/' ? '1px solid black' : '')}} onClick={function(e) {props.setAbcPlaylist(null);props.setMediaPlaylist(null); props.tunebook.utils.scrollTo('topofpage',70); props.mediaController.setTune(null)}} >{props.tunebook.icons.bookheader}</Button></Link>}
               
               <Link to="/tunes" ><Button size="lg" variant="info" style={{marginLeft:'0.1em', color: 'black', border: (location.pathname === '/tunes' ? '1px solid black' : '')}} onClick={function(e) {props.tunebook.utils.scrollTo('topofpage',70); props.setAbcPlaylist(null); props.setMediaPlaylist(null); }} >{props.tunebook.icons.searchheader}</Button></Link>
                
                 {(!isMobile && props.mediaPlaylist === null && props.currentTune && props.tunes && props.tunes[props.currentTune]) ? <Link to={"/tunes/"+props.currentTune} ><Button size="lg" variant="info" style={{marginLeft:'0.1em', color: 'black',  border: (location.pathname.startsWith('/tunes/') ? '1px solid black' : '')}} onClick={function(e) {props.tunebook.utils.scrollTo('topofpage',10)}} >{props.tunebook.icons.musicheader}</Button></Link> : null}
                
                {!isMobile && <>
                      <Dropdown style={{display:'inline', marginLeft:'0.1em'}}>
                          <Dropdown.Toggle variant="info" id="dropdown-header" style={{height:'3.4em', width:'3em'}}>
                          </Dropdown.Toggle>
                        <Dropdown.Menu>
                            <Dropdown.Item ><Link to="/settings" ><Button  size="lg" variant="warning"  >{props.tunebook.icons.settings} Settings</Button></Link> </Dropdown.Item>
                            
                            <Dropdown.Item ><Link  to='/help' onClick={function() {setTimeout(function() {props.tunebook.utils.scrollTo('topofpage')},300)}} ><Button size="lg" variant="info" >{props.tunebook.icons.question} Help &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</Button></Link> </Dropdown.Item>
                           
                           <Dropdown.Item ><Link to="/metronome" ><Button  size="lg" variant="info"  >{props.tunebook.icons.metronome} Metronome</Button></Link> </Dropdown.Item>
                            
                            <Dropdown.Item ><Link to="/tuner" ><Button  size="lg" variant="info"  >{props.tunebook.icons.tuner} Tuner</Button></Link> </Dropdown.Item>
                            
                            <Dropdown.Item ><Link to="/chords" ><Button  size="lg" variant="info"  >{props.tunebook.icons.guitar} Chords</Button></Link> </Dropdown.Item>

                            
                            <Dropdown.Item ><Link to="/piano" ><Button  size="lg" variant="info"  >{props.tunebook.icons.piano} &nbsp;Keyboard</Button></Link> </Dropdown.Item>
                            <Dropdown.Item> <hr/></Dropdown.Item> 
                            
                                                
                            
                           
                        </Dropdown.Menu>
                      </Dropdown> 
                  
                  <span style={{position:'relative'}}>
					  {props.isSyncing && <b style={{position:'absolute',top:0, left:0, backgroundColor:'lightgrey', zIndex:999}}  >SYNC</b>}
					  {props.token ? <Button  style={{position:'absolute',top:0, left:0,padding:(props.user && props.user.picture) ? '2px' : null,  marginLeft:'0.6em', color: 'black'}} size="lg" variant="danger" onClick={function() { props.logout()}} >{(props.user && props.user.picture && !userImageError) ? <><img src={props.user.picture + '?access_token='+props.token.access_token + '&not-from-cache-please'} onError={function() {setUserImageError(true)}} style={{height:'50px'}}  /></> : props.tunebook.icons.logout}</Button> : <Button style={{position:'absolute',top:0, left:0, marginLeft:'0.6em', color: 'black'}} size="lg" variant="success" onClick={function() { props.login()}} >{props.tunebook.icons.login}</Button>}
					</span>
                </>
            }
           
            {isMobile &&  <Dropdown style={{display:'inline', marginLeft:'0.1em'}}>
              <Dropdown.Toggle variant="info" id="dropdown-basic" style={{height:'3em'}}>
              </Dropdown.Toggle>

              <Dropdown.Menu style={{position:'absolute',top:'10em',left:'0px'}} >
                    <Dropdown.Item style={dropdownStyle}  ><Link to="/settings" ><Button   variant="warning"  >{props.tunebook.icons.settings} </Button></Link> </Dropdown.Item>
                   
                   <Dropdown.Item style={dropdownStyle}  ><Link  to='/help' onClick={function() {setTimeout(function() {props.tunebook.utils.scrollTo('topofpage')},300)}} ><Button  >{props.tunebook.icons.question}</Button></Link></Dropdown.Item>
                     <Dropdown.Item style={dropdownStyle}  >
                        {props.token ? <Button  style={{padding:(props.user && props.user.picture) ? '2px' : null,   color: 'black'}} size="md" variant="danger" onClick={function() { props.logout()}} >{(props.user && props.user.picture && !userImageError) ? <img src={props.user.picture + '?access_token='+props.token.access_token + '&not-from-cache-please'} style={{height:'50px'}} onError={function() {setUserImageError(true)}} /> : props.tunebook.icons.logout}</Button> : <Button style={{color: 'black'}} size="md" variant="success" onClick={function() { props.login()}} >{props.tunebook.icons.login}</Button>}
                   </Dropdown.Item>
                   <hr/>
                   <Dropdown.Item style={dropdownStyle}  ><Link to="/metronome" ><Button   variant="info"  >{props.tunebook.icons.metronome} </Button></Link> </Dropdown.Item>
                        
                    <Dropdown.Item style={dropdownStyle}  ><Link to="/tuner" ><Button   variant="info"  >{props.tunebook.icons.tuner} </Button></Link> </Dropdown.Item>
                    
                    <Dropdown.Item style={dropdownStyle}  ><Link to="/chords" ><Button   variant="info"  >{props.tunebook.icons.guitar} </Button></Link> </Dropdown.Item>

                    
                    <Dropdown.Item style={dropdownStyle}  ><Link to="/piano" ><Button   variant="info"  >{props.tunebook.icons.piano} </Button></Link> </Dropdown.Item>
                    <hr/>
					
                   
                
              </Dropdown.Menu>
            </Dropdown>}
             </ButtonGroup>
            
             
       </span>
       
        {(location.pathname.startsWith('/tunes') || location.pathname.startsWith('/editor/')) && <span style={{float:'right', padding:'0.1em', paddingLeft:'0.1em', backgroundColor:'#5400ff'}}>
        <MediaPlayerButtons mediaController={props.mediaController} tunebook={props.tunebook} abcPlaylist={props.abcPlaylist} setAbcPlaylist={props.setAbcPlaylist}   mediaPlaylist={props.mediaPlaylist} setMediaPlaylist={props.setMediaPlaylist} currentTuneBook={props.currentTuneBook} tagFilter={props.tagFilter} selected={selected}/>
        <>{(params.tuneId && (location.pathname.indexOf('/tunes') !== -1 || location.pathname.indexOf('/editor') !== -1)) && <ButtonGroup>
               <Button size="lg" onClick={function() {props.tunebook.navigateToPreviousSong(params.tuneId,navigate)}} >{props.tunebook.icons.skipback}</Button>
                <Button size="lg" onClick={function() {props.tunebook.navigateToNextSong(params.tuneId,navigate)}} >{props.tunebook.icons.skipforward}</Button> 
            </ButtonGroup>
            }</>
        
        </span>}
    </header>
}


//<Dropdown.Item ><Link to="/files" ><Button  size="lg" variant="info"  >{props.tunebook.icons.camera} &nbsp;Images</Button></Link> </Dropdown.Item>
                            //<Dropdown.Item ><Link to="/recordings" ><Button  size="lg" variant="info"  >{props.tunebook.icons.recordcircle} &nbsp;Recordings</Button></Link> </Dropdown.Item>

//<Dropdown.Item style={dropdownStyle}><Link to="/files" ><Button  variant="info"  >{props.tunebook.icons.camera} </Button></Link> </Dropdown.Item>
                   //<Dropdown.Item style={dropdownStyle}><Link to="/recordings" ><Button variant="info"  >{props.tunebook.icons.recordcircle}</Button></Link> </Dropdown.Item>
              
//{(!params.tuneId && location.pathname.indexOf('/tunes') !== -1) && <ButtonGroup style={{float:'right'}}>
            //<Button onClick={function() {props.tunebook.fillMediaPlaylist(props.currentTuneBook,selected,props.tagFilter )}} variant={"success"} size="lg" >{props.tunebook.icons.play}</Button>
            //<MediaPlayerOptionsModal mediaController={props.mediaController} tunebook={props.tunebook} buttonSize={'lg'} abcPlaylist={props.abcPlaylist} setAbcPlaylist={props.setAbcPlaylist}  mediaPlaylist={props.mediaPlaylist} setMediaPlaylist={props.setMediaPlaylist} variant={"success"} currentTuneBook={props.currentTuneBook} tagFilter={props.tagFilter} selected={selected} />
        //</ButtonGroup>}
        

//{(location.pathname.startsWith('/tunes/') && params.tuneId) ? <span style={{marginLeft:'0.5em'}}>
                  //<AbcPlaylistManagerModal tunebook={props.tunebook} abcPlaylist={props.abcPlaylist} setAbcPlaylist={props.setAbcPlaylist} />
                  //<PlaylistManagerModal tunebook={props.tunebook} mediaPlaylist={props.mediaPlaylist} setMediaPlaylist={props.setMediaPlaylist} />
                  
              //</span>  : null}
            
            //{(isMobile && location.pathname.startsWith('/tunes/') && params.tuneId) ? <span style={{ marginLeft:'0.8em'}}>
                      //<AbcPlaylistManagerModal tunebook={props.tunebook} abcPlaylist={props.abcPlaylist} setAbcPlaylist={props.setAbcPlaylist} />
                     //<PlaylistManagerModal tunebook={props.tunebook} mediaPlaylist={props.mediaPlaylist} setMediaPlaylist={props.setMediaPlaylist} />
                  //</span>  : null}
                  

       //{isMobile && <Dropdown.Item style={dropdownStyle}  ><Link to="/review" ><Button  variant="info" style={{marginLeft:'0.1em', color: 'black', border: (location.pathname.startsWith('/review') ? '1px solid black' : '')}}>{props.tunebook.icons.review} </Button></Link>
                //</Dropdown.Item>}
                   //<Dropdown.Item style={dropdownStyle}  ><Link to="/recordings" ><Button   variant="info"   >{props.tunebook.icons.recordcircle} </Button></Link> </Dropdown.Item>

  //<Dropdown.Item ><Link to="/chords" ><Button  size="lg" variant="info"  >{props.tunebook.icons.guitar} Chords</Button></Link> </Dropdown.Item>
                        
                      

 //{location.pathname.startsWith('/tunes/') && <span  ><TempoControl showTempo={props.showTempo} setShowTempo={props.setShowTempo} tunebook={props.tunebook} value={props.tempo} beatsPerBar={props.beatsPerBar} setBeatsPerBar={props.setBeatsPerBar} onChange={function(val) {props.setTempo(val)}}  /></span>}
//<Link to="/menu" ><Button variant="info" style={{marginLeft:'0.4em', color: 'black'}} >...</Button></Link>
                    //{!isMobile && <span ><ShareTunebookModal tunebook ={props.tunebook} token={props.token} googleDocumentId={props.googleDocumentId} tiny={true} /></span>}
                    
                    
// <GoogleAd style={{ display: 'block', textAlign: "center" , height:'2em', zIndex: 0}} slot={process.env.REACT_APP_GOOGLE_AD_SLOT} googleAdId={process.env.REACT_APP_GOOGLE_AD_ID} />
 //<Link to="/review" ><Button size="lg" variant="info" style={{marginLeft:'0.1em', color: 'black', border: (location.pathname.startsWith('/review') ? '1px solid black' : '')}}>{props.tunebook.icons.review}</Button></Link>
                   //<Link to="/recordings" ><Button  variant="info" size="lg"  style={{marginLeft:'0.1em', color: 'black',  border: (location.pathname.startsWith('/recordings') ? '1px solid black' : '')}} >{props.tunebook.icons.recordcircle}</Button></Link>
