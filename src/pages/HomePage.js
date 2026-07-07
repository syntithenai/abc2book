import {Link , Outlet } from 'react-router-dom'
import {Button} from 'react-bootstrap'
import MusicLayout from '../components/MusicLayout'
import ImportCollectionModal from '../components/ImportCollectionModal'
import FeaturedTune from '../components/FeaturedTune'

export default function HomePage(props) {
    
    function onClick() {
        setTimeout(function() {
            document.getElementById('loadtunebookbutton').click()
        } ,500)
    }
    
    return <div className="App-home">
      <div id="welcometext" >
      <h3  >Learn session tunes here !</h3> 
      <div>Try a curated tunebook. <Link to="/import/begged borrowed and stolen" ><Button size="sm" >Begged Borrowed and Stolen</Button></Link>  
      <Link to="/import/christmas songs" ><Button size="sm" >Xmas Songs</Button></Link>  
      <Link to="/import/kids songs" ><Button size="sm" >Kids Songs</Button></Link>  
      <ImportCollectionModal label="..." forceRefresh={props.forceRefresh}  tunebook={props.tunebook}   currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook} closeParent={function() {}}/>
      </div>
      <br/>
      <div>If you know what you want you can <Link to="/add/bulk"><Button size="sm">Load an ABC Tunebook</Button></Link>, <Link to="/add/bulk"><Button size="sm">Import a list of names</Button></Link> or <Link to="/add"><Button size="sm">Add a Tune</Button></Link> and use the edit, link or search tools to find the music.</div>
      <br/>
      <div  ><Button size="sm" onClick={function(e) {props.tunebook.utils.download('tunebook.abc',props.tunebook.toAbc())}} >Download</Button> or <Link to="/print" ><Button size="sm" >Print</Button></Link> your tunebook to share with other people and devices.</div>
      <br/>
      <div  >Print a <Link to="/cheatsheet" ><Button size="sm" >Cheat Sheet</Button></Link> for a compact summary to get your memory started.</div>
      <br/>
      <div  >Be sure to check out the <Link to="/help" ><Button size="sm">Help</Button></Link> section for tips and tricks to make things easier.</div>
      </div>
      <FeaturedTune tunebook={props.tunebook}  />
      
    </div>
}
