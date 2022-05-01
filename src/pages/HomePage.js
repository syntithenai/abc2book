import {Link , Outlet } from 'react-router-dom'
import {Button} from 'react-bootstrap'
import MusicLayout from '../components/MusicLayout'
import IndexLayout from '../components/IndexLayout'


export default function HomePage(props) {
    return <div className="App-home">
      <div id="welcometext" >
      <h3  >Learn session tunes here !</h3> 
      <div>Try a curated tunebook. <button onClick={function() {window.speak('begged borrowed and stolen loading now')}} >Begged Borrowed and Stolen</button>  </div>
      <br/>
      <div>If you know what you want you can <button >Load an ABC Tunebook</button>, <button  >Import a list of names</button> or <button  >Add a Tune</button> and use the edit, link or search tools to find the music.</div>
      <br/>
      <div  >Boost some tunes and use the review tool to play along. Boost affects review order and tempo.</div>
      <br/>
      <div  ><button >Download</button> or <button  >Print</button> your tunebook to share with other people and devices.</div>
      </div>
    </div>
}
