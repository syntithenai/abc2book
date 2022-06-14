import { Link  , useLocation} from 'react-router-dom'
import {Button, Dropdown} from 'react-bootstrap'
import TempoControl from './TempoControl' 
import GoogleAd from './GoogleAd'
import ShareTunebookModal from './ShareTunebookModal'
import {isMobile} from 'react-device-detect';

export default function Header(props) {
    var location = useLocation()
    if (location.pathname.startsWith('/print')) return null
    //console.log(location)
    return <header className="App-header" style={{zIndex:11}}>
        <span style={{marginRight:'2em'}} >
           <Link to="/tunes" ><Button size="lg" variant="info" style={{marginLeft:'0.1em', color: 'black', border: (location.pathname === '/tunes' ? '1px solid black' : '')}} onClick={function(e) {props.tunebook.utils.scrollTo('topofpage',70)}} >{props.tunebook.icons.search}</Button></Link>
            
             {(props.currentTune && props.tunes && props.tunes[props.currentTune]) ? <Link to={"/tunes/"+props.currentTune} ><Button size="lg" variant="info" style={{marginLeft:'0.1em', color: 'black',  border: (location.pathname.startsWith('/tunes/') ? '1px solid black' : '')}} onClick={function(e) {props.tunebook.utils.scrollTo('topofpage',10)}} >{props.tunebook.icons.music}</Button></Link> : null}
            {!isMobile && <>
                  <Link to="/review" ><Button size="lg" variant="info" style={{marginLeft:'0.1em', color: 'black', border: (location.pathname.startsWith('/review') ? '1px solid black' : '')}}>{props.tunebook.icons.review}</Button></Link>
                   <Link to="/recordings" ><Button  variant="info" size="lg"  style={{marginLeft:'0.1em', color: 'black',  border: (location.pathname.startsWith('/recordings') ? '1px solid black' : '')}} >{props.tunebook.icons.recordcircle}</Button></Link>
                   
                
                   <Link to="/settings" ><Button variant="info"  size="lg"  style={{marginLeft:'0.1em', color: 'black',  border: (location.pathname.startsWith('/settings') ? '1px solid black' : '')}} >{props.tunebook.icons.settings}</Button></Link>
                  
                  <Link  to='/help' onClick={function() {setTimeout(function() {props.tunebook.utils.scrollTo('topofpage')},300)}} ><Button style={{marginLeft:'0.1em', color: 'black',  border: (location.pathname.startsWith('/help') ? '1px solid black' : '')}} variant="info" size="lg" >{props.tunebook.icons.question}</Button></Link>
                  
                  {props.token ? <Button  style={{marginLeft:'0.6em', color: 'black'}} size="lg" variant="danger" onClick={function() { props.logout()}} >{props.tunebook.icons.logout}</Button> : <Button style={{marginLeft:'0.6em', color: 'black'}} size="lg" variant="success" onClick={function() { props.login()}} >{props.tunebook.icons.login}</Button>}
              
                </>
            }
            
            {isMobile &&  <Dropdown style={{display:'inline', marginLeft:'0.1em'}}>
              <Dropdown.Toggle variant="info" id="dropdown-basic" style={{height:'3em'}}>
              </Dropdown.Toggle>

              <Dropdown.Menu>
                {isMobile && <Dropdown.Item ><Link to="/review" ><Button size="lg" variant="info" style={{marginLeft:'0.1em', color: 'black', border: (location.pathname.startsWith('/review') ? '1px solid black' : '')}}>{props.tunebook.icons.review} Review</Button></Link>
                </Dropdown.Item>}
                  
                   <Dropdown.Item ><Link to="/recordings" ><Button  size="lg"   >{props.tunebook.icons.recordcircle} Recordings</Button></Link> </Dropdown.Item>
                   
                   <Dropdown.Item ><Link to="/settings" ><Button  size="lg" variant="warning"  >{props.tunebook.icons.settings} Settings</Button></Link> </Dropdown.Item>
                   
                   <Dropdown.Item ><Link  to='/help' onClick={function() {setTimeout(function() {props.tunebook.utils.scrollTo('topofpage')},300)}} ><Button size="lg" >{props.tunebook.icons.question} Help &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</Button></Link> </Dropdown.Item>
                  
                   {props.token ? <Dropdown.Item ><Button  style={{ color: 'black'}} size="lg" variant="danger" onClick={function() { props.logout()}} >{props.tunebook.icons.logout} Logout</Button></Dropdown.Item > : <Dropdown.Item ><Button style={{color: 'black'}} size="lg" variant="success" onClick={function() { props.login()}} >{props.tunebook.icons.login} Login</Button></Dropdown.Item >}
              
                
              </Dropdown.Menu>
            </Dropdown>}
            
            
       </span>
        
    </header>
}
 //{location.pathname.startsWith('/tunes/') && <span  ><TempoControl showTempo={props.showTempo} setShowTempo={props.setShowTempo} tunebook={props.tunebook} value={props.tempo} beatsPerBar={props.beatsPerBar} setBeatsPerBar={props.setBeatsPerBar} onChange={function(val) {props.setTempo(val)}}  /></span>}
//<Link to="/menu" ><Button variant="info" style={{marginLeft:'0.4em', color: 'black'}} >...</Button></Link>
                    //{!isMobile && <span ><ShareTunebookModal tunebook ={props.tunebook} token={props.token} googleDocumentId={props.googleDocumentId} tiny={true} /></span>}
                    
                    
// <GoogleAd style={{ display: 'block', textAlign: "center" , height:'2em', zIndex: 0}} slot={process.env.REACT_APP_GOOGLE_AD_SLOT} googleAdId={process.env.REACT_APP_GOOGLE_AD_ID} />
