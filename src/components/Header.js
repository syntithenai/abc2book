import { Link  , useLocation} from 'react-router-dom'
import {Button} from 'react-bootstrap'
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
            
            <Link to="/review" ><Button size="lg" variant="info" style={{marginLeft:'0.1em', color: 'black', border: (location.pathname.startsWith('/review') ? '1px solid black' : '')}}>{props.tunebook.icons.review}</Button></Link>
            
            {location.pathname.startsWith('/tunes/') && <span  ><TempoControl showTempo={props.showTempo} setShowTempo={props.setShowTempo} tunebook={props.tunebook} value={props.tempo} beatsPerBar={props.beatsPerBar} setBeatsPerBar={props.setBeatsPerBar} onChange={function(val) {props.setTempo(val)}}  /></span>}
            
            {!isMobile && <span style={{marginRight:'1em'}} ><ShareTunebookModal tunebook ={props.tunebook} token={props.token} googleDocumentId={props.googleDocumentId} tiny={true} /></span>}
        
       </span>
        
    </header>
}
//<Link to="/menu" ><Button variant="info" style={{marginLeft:'0.4em', color: 'black'}} >...</Button></Link>
        
// <GoogleAd style={{ display: 'block', textAlign: "center" , height:'2em', zIndex: 0}} slot={process.env.REACT_APP_GOOGLE_AD_SLOT} googleAdId={process.env.REACT_APP_GOOGLE_AD_ID} />
