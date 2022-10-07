import { Link  , useLocation} from 'react-router-dom'
import {Button, Dropdown} from 'react-bootstrap'
import TempoControl from './TempoControl' 
import GoogleAd from './GoogleAd'
import ShareTunebookModal from './ShareTunebookModal'
import {isMobile} from 'react-device-detect';
import {useNavigate, useParams} from 'react-router-dom'

import useKeyPress from '../useKeyPress';

export default function Header(props) {
    var location = useLocation()
    var navigate = useNavigate()
    //var params = useParams() // empty  ???
    var parts = location.pathname.split("/")
    var params = {tuneId: parts.length === 3 ? parts[2] : null}
    const onKeyPress = (event) => {
        if (event.key === 'ArrowRight' && location.pathname.startsWith('/tunes/') && params.tuneId) {
            props.tunebook.navigateToNextSong(params.tuneId,navigate)
        } else if (event.key === 'ArrowLeft' && location.pathname.startsWith('/tunes/') && params.tuneId) {
            props.tunebook.navigateToPreviousSong(params.tuneId,navigate)
        } 
        //console.log(`key pressed: ${event.key}`);
    };
    useKeyPress(['ArrowRight', 'ArrowLeft'], onKeyPress);

    var dropdownStyle = {fontSize:'0.7em', display:'inline', width:'22px', height:'22px', marginBottom:'0.3em'}
    if (location.pathname.startsWith('/print')) return null
    //console.log("param  ",params,location)
    return <header className="App-header" style={{zIndex:11, fontSize:'1.2em'}} >
        <span style={{marginRight:'2em'}} >
           <Link to="/books" ><Button size="lg" variant="info" style={{marginLeft:'0.1em', color: 'black', border: (location.pathname === '/' ? '1px solid black' : '')}} onClick={function(e) {props.tunebook.utils.scrollTo('topofpage',70)}} >{props.tunebook.icons.bookheader}</Button></Link>
           <Link to="/tunes" ><Button size="lg" variant="info" style={{marginLeft:'0.1em', color: 'black', border: (location.pathname === '/tunes' ? '1px solid black' : '')}} onClick={function(e) {props.tunebook.utils.scrollTo('topofpage',70)}} >{props.tunebook.icons.searchheader}</Button></Link>
            
             {(props.currentTune && props.tunes && props.tunes[props.currentTune]) ? <Link to={"/tunes/"+props.currentTune} ><Button size="lg" variant="info" style={{marginLeft:'0.1em', color: 'black',  border: (location.pathname.startsWith('/tunes/') ? '1px solid black' : '')}} onClick={function(e) {props.tunebook.utils.scrollTo('topofpage',10)}} >{props.tunebook.icons.musicheader}</Button></Link> : null}
            {!isMobile && <>
                 
                   
                  <Dropdown style={{display:'inline', marginLeft:'0.1em'}}>
                  <Dropdown.Toggle variant="info" id="dropdown-header" style={{height:'3em'}}>
                  </Dropdown.Toggle>
                    <Dropdown.Menu>
                        <Dropdown.Item ><Link  to='/help' onClick={function() {setTimeout(function() {props.tunebook.utils.scrollTo('topofpage')},300)}} ><Button size="lg" variant="info" >{props.tunebook.icons.question} Help &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</Button></Link> </Dropdown.Item>
                       
                       <Dropdown.Item ><Link to="/metronome" ><Button  size="lg" variant="info"  >{props.tunebook.icons.metronome} Metronome</Button></Link> </Dropdown.Item>
                        
                        <Dropdown.Item ><Link to="/tuner" ><Button  size="lg" variant="info"  >{props.tunebook.icons.tuner} Tuner</Button></Link> </Dropdown.Item>
                        
                        <Dropdown.Item ><Link to="/chords" ><Button  size="lg" variant="info"  >{props.tunebook.icons.guitar} Chords</Button></Link> </Dropdown.Item>

                        
                        <Dropdown.Item ><Link to="/piano" ><Button  size="lg" variant="info"  >{props.tunebook.icons.piano} &nbsp;Keyboard</Button></Link> </Dropdown.Item>
                                            
                       <Dropdown.Item ><Link to="/settings" ><Button  size="lg" variant="warning"  >{props.tunebook.icons.settings} Settings</Button></Link> </Dropdown.Item>
                       
                    </Dropdown.Menu>
                  </Dropdown> 
                  {props.token ? <Button  style={{marginLeft:'0.6em', color: 'black'}} size="lg" variant="danger" onClick={function() { props.logout()}} >{props.tunebook.icons.logout}</Button> : <Button style={{marginLeft:'0.6em', color: 'black'}} size="lg" variant="success" onClick={function() { props.login()}} >{props.tunebook.icons.login}</Button>}
                  
                    
                  {(!isMobile && location.pathname.startsWith('/tunes/') && params.tuneId) ? <span style={{float:'right', marginRight:'10em'}}><Button onClick={function() {props.tunebook.navigateToPreviousSong(params.tuneId,navigate)}} >{props.tunebook.icons.skipback}</Button><Button onClick={function() {props.tunebook.navigateToNextSong(params.tuneId,navigate)}} >{props.tunebook.icons.skipforward}</Button></span>  : null}
                
                    
                
                </>
            }
            
            {isMobile &&  <Dropdown style={{display:'inline', marginLeft:'0.1em'}}>
              <Dropdown.Toggle variant="info" id="dropdown-basic" style={{height:'3em'}}>
              </Dropdown.Toggle>

              <Dropdown.Menu style={{position:'absolute',top:'10em',left:'0px'}} >
                    <Dropdown.Item style={dropdownStyle}  ><Link  to='/help' onClick={function() {setTimeout(function() {props.tunebook.utils.scrollTo('topofpage')},300)}} ><Button  >{props.tunebook.icons.question}</Button></Link></Dropdown.Item>
                     <Dropdown.Item style={dropdownStyle}  >
                        {props.token ? <Button  style={{marginLeft:'0.6em', color: 'black'}}  variant="danger" onClick={function() { props.logout()}} >{props.tunebook.icons.logout}</Button> : <Button style={{marginLeft:'0.6em', color: 'black'}}  variant="success" onClick={function() { props.login()}} >{props.tunebook.icons.login}</Button>}
                   </Dropdown.Item>
                   <Dropdown.Item style={dropdownStyle}  ><Link to="/metronome" ><Button   variant="info"  >{props.tunebook.icons.metronome} </Button></Link> </Dropdown.Item>
                        
                    <Dropdown.Item style={dropdownStyle}  ><Link to="/tuner" ><Button   variant="info"  >{props.tunebook.icons.tuner} </Button></Link> </Dropdown.Item>
                    
                    <Dropdown.Item style={dropdownStyle}  ><Link to="/chords" ><Button   variant="info"  >{props.tunebook.icons.guitar} </Button></Link> </Dropdown.Item>

                    
                    <Dropdown.Item style={dropdownStyle}  ><Link to="/piano" ><Button   variant="info"  >{props.tunebook.icons.piano} </Button></Link> </Dropdown.Item>
                                        
                   
                   
                  
                   {props.token ? <Dropdown.Item style={dropdownStyle}  ><Button  style={{ color: 'black'}}  variant="danger" onClick={function() { props.logout()}} >{props.tunebook.icons.logout} Logout</Button></Dropdown.Item > : <Dropdown.Item style={dropdownStyle}  ><Button style={{color: 'black'}}  variant="success" onClick={function() { props.login()}} >{props.tunebook.icons.login} Login</Button></Dropdown.Item >}
              
                   <Dropdown.Item style={dropdownStyle}  ><Link to="/settings" ><Button   variant="warning"  >{props.tunebook.icons.settings} </Button></Link> </Dropdown.Item>
                   
                
              </Dropdown.Menu>
            </Dropdown>}
            
            
       </span>
        
    </header>
}
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
