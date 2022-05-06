import { Link  } from 'react-router-dom'
import {Button} from 'react-bootstrap'

export default function HelpPage(props) {
    return <div className="App-print">
   <a style={{float: 'right', marginTop: '1.5em', marginRight: "1.5em"}} target="_new" href="https://github.com/syntithenai/abc2book/issues"><button>Problems or suggestions ?</button></a>
    <br/>
    <div style={{paddingTop:'2em',clear: "both"}} >This tool helps you to find, collect, print and memorise tunes. It includes features to
    <ul>
      <li>Import ABC format music notation.</li>
      <li>Search and import tunes from thesession.org.</li>
      <li>Search and import tunes from the included database of abc format tunes scraped from the web.</li>
      <li>Listen to the tunes and set the tempo.</li>
      <li>Add tunes to a review list with a confidence score for review mode.</li>
      <li>Edit tunes using <a target="_new" href="http://www.lesession.co.uk/abc/abc_notation.htm">ABC Notation</a> with immediate visual feedback and audio support.</li>
      <li>Review tunes by listening and playing
        <ul>
          <li>Starting with the least confident, by playing them three times each and then increasing the confidence score.</li>
          <li>Once a tune has been played three times, it is excluded from review for 24 hours.</li>
          <li>In review, the tempo of playback is faster for tunes with high confidence.</li>
        </ul>
       </li>
       <li>Generate a clickable index of all the tunes in a book</li>
      <li>Generate a cheatsheet showing the first 4 bars of all the tunes in the book.</li>
      <li>Print a paginated book including the index, cheatsheet and music.</li>
      
      </ul>
    </div>
      <h3>FAQ</h3>
    <ul>
        <li><b>My review list items disappeared. Help.</b></li>
        <li>
          <i>Be sure to save/download your tunebook information as a file</i> that can be imported again later.<br/>
          This website does not offer any online storage, instead tools to import/export a tunebook as a file for moving user data between devices.
        </li>
        <li><b>When I upload a tune to the session, the rhythm gets messed up.</b></li>
        <li>Edit the tune and use the wizard tools to double or halve the note durations.
        <br/>When submitting or updating a setting of a tune to the session, the ABC headers for note length are ignored in favor of the note length that was set when the tune was created. If the note length of the tune on thesession.org is 1/4 and your abc uses 1/8, all the notes will be half their expected lengths :(  <br/>
        
        </li>
    </ul>
    <br/><br/><br/>
    
    <div>Songs are sourced from <a target='sessionwin'  href="http://thesession.org" >thesession.org</a></div>
    <div>Music is rendered from ABC format using <a target='sessionwin'  href="https://www.abcjs.net/" >abcjs</a></div>
    
    </div>
}
