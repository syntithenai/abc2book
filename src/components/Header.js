import { Link  , useLocation} from 'react-router-dom'
import {Button} from 'react-bootstrap'
import TempoControl from './TempoControl' 

export default function Header(props) {
    var location = useLocation()
    return <header className="App-header" style={{zIndex:11}}>
        {props.currentTune ? <Link to={"/tunes/"+props.currentTune} ><Button size="lg" variant="info" style={{marginLeft:'0.4em', color: 'black'}} onClick={function(e) {props.tunebook.utils.scrollTo('topofpage',10)}} >{props.tunebook.icons.music}</Button></Link> : null}
        <Link to="/tunes" ><Button size="lg" variant="info" style={{marginLeft:'0.4em', color: 'black'}} onClick={function(e) {props.tunebook.utils.scrollTo('topofpage',70)}} >{props.tunebook.icons.search}</Button></Link>
        <Link to="/review" ><Button size="lg" variant="info" style={{marginLeft:'0.4em', color: 'black'}}>{props.tunebook.icons.review}</Button></Link>
        {location.pathname.startsWith('/tunes/') && <span style={{float:'right'}} ><TempoControl tunebook={props.tunebook} value={props.tunebook.tempo} onChange={function(e) {props.tunebook.setTempo(e.target.value)}}  /></span>}
    </header>
}
//<Link to="/menu" ><Button variant="info" style={{marginLeft:'0.4em', color: 'black'}} >...</Button></Link>
        
