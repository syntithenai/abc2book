import { Link  } from 'react-router-dom'
import {Button, Tabs, Tab, Container} from 'react-bootstrap'
//<li>Record your practice so you can hear what you sound like.</li>
           
export default function HelpPage(props) {
    return <div className="App-print">
  
   
    
    <br/>
    <Tabs defaultActiveKey="home" id="uncontrolled-tab-example" className="mb-3">
      <Tab eventKey="home" title="Features">
        <div style={{paddingTop:'2em',clear: "both"}} >This tool helps you to find, collect, print and memorise tunes. It includes features to
        <ul>
          <li>Import ABC and Music XML format music notation (unzipped single track music XML).</li>
          <li>Search and import tunes from thesession.org.</li>
          <li>Search and import tunes from the included database of abc format tunes scraped from the web.</li>
          <li>Use wizard tools to fix and apply transformations to music.</li>
          <li>Transpose a tune quickly by clicking on the key signature.</li>
          <li>Search for lyrics.</li>
          <li>Generate abc notation from chords. </li>
          <li>Organise tunes into books.</li>
          <li>Use the Tune Book without Internet access (with the songs you have already imported)</li>
          <li>Login using Google to keep a copy of your whole tune book a Google Document. Audio recordings are also saved to Google Drive.</li>
          <li>Synchronise changes between your devices so tunes you add on your phone turn up on your computer.</li>
          <li>Listen to the tunes and set the tempo (double click the play button to start from the beginning).</li>
          <li>Add tunes to a review list with a confidence score for review mode.</li>
          <li>Edit tunes using <a target="_new" href="http://www.lesession.co.uk/abc/abc_notation.htm">ABC Notation</a> with immediate visual feedback and audio support.</li>
          <li>Review tunes by listening and playing with tempo adjusted to confidence score.
           </li>
           <li>Share individual tunes, whole books and recordings by email or direct to Facebook.</li>
           <li>Show tablature notation for any tune.</li>
          <li>Generate a cheatsheet showing the first 4 bars of all the tunes in the book.</li>
          <li>Print a paginated book including the index, cheatsheet and music.</li>
          <li>Use a guitar tuner and a metronome.</li>
          <li>Lookup chord symbols.</li>
          </ul>
        </div>

      </Tab>
      <Tab eventKey="login" title="Login">
      The software is delivered as a progressive web app. <br/><br/>
      This means that 
      <ul>
      <li>Once you visit the web page once, you will be able to open it again even if the Internet is disconnected. </li>
      <li>All the information managed by the software is stored on your device. </li>
      <li>Almost all the features work without Internet. The main exception being access to online tune resources. Once you have imported some tunes they will be available without Internet.</li>
      <li>Mobile devices will show an option to install the software as an App.</li>
      </ul>
      <div style={{fontSize:'1em'}}>
      You can optionally log in to the Tune Book using your Google Account using the green button <Button variant="success">{props.tunebook.icons.login}</Button> on the top menu. 
      <br/><br/>
      Once logged in, all changes to your Tune Book by adding, deleting or editing tunes are saved to your Google Drive. Additionally any audio recordings are saved to your Google Drive.
      <br/><br/>
      The tune book is loaded from a document in Google Drive named <b>ABC Tune Book</b> (even if it's in the Trash). By renaming this document in Google Drive, you can force the software to create a new tune book. 
      <br/><br/>
      If you log in to the same account on a different device, the software will attempt to synchronise your local database with the version stored online. If your local database needs to be updated, a list of changes will be shown along with choices to merge the changes, discard local changes or logout and ignore the version saved to Google Drive.
      <br/><br/>
      The green merge button will try to preserve changes everywhere by saving any locally changed files and updating any files changed or added online.
      When tunes are deleted locally while you are logged out or offline, the merge will try to replace the tunes.
      <br/><br/>
      The software checks regularly for changes to the Google Document so if you are logged in to two devices at the same time, changes on one devices will appear within a few seconds as an import warning on your other device.
      <br/><br/>
      You need to be logged in to use the sharing features which require saving the Tune Book online.
      Due to restrictions in the way Google shares 'publicly' available documents, link recipients need to be logged in to their own Google account to access shared files from other users. 
      </div>
      
      
      </Tab>
      <Tab eventKey="books" title="Books">
      Books is the main way of organising your tunes.
      <br/><br/>
      Each tune can be in many books.
      <br/><br/>
      The search page allows filtering by book as well as title search.
      <br/><br/>
      The search list allows selecting multiple tunes and (using the grey dropdown at the top of the list) add or remove all selected tunes from a book.
      </Tab>
      <Tab eventKey="editing" title="Editing">
      The tempo of a tune can be changed by clicking on the tempo mark in the music.
      Similarly the key signature can be changed by clicking on the clef or key signature.
      <br/><br/>
      The pencil icon on the music view page opens a more comprehensive editor which is divided into tabs.
      </Tab>
      <Tab eventKey="chords" title="Chords">
      The software library that turns an ABC string into printable music is also able to play the music. Where chords are annotated with the music, it will generate and play an piano accompaniment.
      <br/><br/>
      Chords can be entered into the ABC notes by placing quotes around the chord name <i>eg aaaa"C"abcd| "F#m"dcba "Gbdim" ddd||</i>
      <br/><br/>
      The harmony structure for a song can be quickly scaffolded using a more compressed format in the chords tab of the editing page.
      Chords entered as <i>eg C|F G|G F F C|C . G C</i> are used to generate abc notation.
      </Tab>
      
      
      <Tab eventKey="profile" title="FAQ">
        <ul>
        <li><b>My phone went flat?</b></li>
        <li>When music notation is displayed, the software keeps the screen awake on mobile devices. Handy but ... remember to turn off the app/your screen when you're done!!</li>
        </ul>
        
        <ul>
        <li><b>When I upload a tune to the session, the rhythm gets messed up.</b></li>
        <li>Edit the tune and use the wizard tools to double or halve the note durations.
        <br/>When submitting or updating a setting of a tune to the session, the ABC headers for note length are ignored in favor of the note length that was set when the tune was created. If the note length of the tune on thesession.org is 1/4 and your abc uses 1/8, all the notes will be half their expected lengths :(  <br/></li>
        
        
        
    </ul>
      </Tab>
      <Tab eventKey="story" title="Story">
      
      <h3>Evolution</h3>
      This project started as a programmatic way of printing the first few bars of a bunch of tunes as a cheatsheet.
It's evolved into a tool to organise, edit and play tunes in ABC music notation format. 
<br/><br/>
There are many websites offering folk and bluegrass tunes in ABC format so wanting tools to help me importing and selecting and fixing tunes into arrangements as I know them with chords has directed the development. Editing ABC notation is a bit technical but in developing tools to make things faster for me I hope it is a bit more accessable. 
<br/><br/>
Lyric search and the chord wizard have made it quick to import a harmony framework enough to play audio for a bunch of songs I've learnt over the years.
<br/><br/>
It is is possible to write to create decent sounding music with ABC to midi and good soundfonts however most of what I have curated has been minimal. A clunky auto generated piano harmony and optionally the melody. It is a practice/organisation tool.
<br/><br/>
MusicXML is the wide spread standard for distributing detailed musical scores. Tools like MuseScore offer the ability to deal with complicated music.
This tool offers to import MusicXML but the underlying library only works for simple single line melodies.
<br/><br/>
If you need to work with piano or orchestral scores, use another tool.
This tool is best suited to musicians wanting to organise simple tunes and songs or those with an interest in traditional music.
<br/><br/>
    <h3>Curation</h3>
I have a huge pile of paper with word and chords and scraps of music that runs back 35 years. It's grotty.<br/>
I have many tunes in my head that I can track along with in a session but can only pull back a few by name.<br/>
I know the words to parts of songs but few well enough to be able to lead a song.
<br/><br/>
I started with <a href='https://www.vfmc.org.au/FiresideFiddlers/indexBBS.html' target='_new'>Begged Borrowed and Stolen</a>, a collection of trad tunes well known here in the South East Australia. Many of our musical crews' shared tunes are sourced in that book. Then all the scraps of tunes and songs that I'd printed or been given along the way. As I worked through my goal was to ensure every tune could play if only a piano fill from chords. 





      </Tab>
      
    </Tabs>
    
    
      
    <br/><br/><br/>
    <hr style={{width:'100%'}} />
    <Container style={{ clear:'both', width:'50%', textAlign:'center'}}>
              
        <div style={{marginBottom:'1em'}} >
          <span>(CopyLeft 2022)    Steve Ryan <a href='mailto:syntithenai@gmail.com'>
          syntithenai@gmail.com</a>&nbsp;&nbsp;&nbsp;&nbsp;</span>
        </div>
        
        <div>
        <span style={{marginLeft:'1em', float:'right', marginRight:'5em'}} >
            <form action="https://www.paypal.com/donate" method="post" target="_new">
              <input type="hidden" name="hosted_button_id" value="RPP5VCZCWSZL4" />
              <input type="image" style={{transform: 'rotate(20deg)', height:'60px', width:'50px'}} src="https://pics.paypal.com/00/s/OGVmNmM4NTQtMGQ0MS00NGVhLWI0NDgtNzMxYWRkMDY5NzIy/file.PNG" border="0" name="submit" title="Buy me a beer!" alt="Buy me a beer!" />
              <img alt="" border="0" src="https://www.paypal.com/en_AU/i/scr/pixel.gif" width="1" height="1" />
            </form>
         </span>
         <span>Source code on <a href='https://github.com/syntithenai/abc2book'>Github</a></span>
        
        </div>
        
          
         
          <a style={{float: 'right', clear:'both', marginTop: '1.5em', marginRight: "1.5em"}} target="_new" href="https://github.com/syntithenai/abc2book/issues"><button>Problems or suggestions ?</button></a>
         
       </Container>
    </div>
}
  //<Tab eventKey="tutorial" title="Tutorial">
      //<h4>Creating a new tune using thesession.org</h4>
      //<ul>
      //<li>First click on the magnifying glass button at the top left of the page to navigate to the search screen.</li>
      //<li>Click the green plus sign on the right hand side to create a new tune.</li>
      //<li>Enter a name and optionally other info the click Add.</li>
      //<li>Click on the name of the tune in the list to see the (empty) music.</li>
      //<li>Click on the pencil button to open the editor.</li>
      //<li>Click on the blue S button to open the session search.</li>
      //<li>Select a tune and then a setting and agree to import the whole tune.</li>
      //<li>Done</li>
      //</ul>
      //<h4>Creating a new tune using the chord wizard</h4>
      
      //<h4>Grouping tunes into books</h4>
      
      //<h4>Review Mode</h4>
      
      
      //</Tab>
//<Tab eventKey="recording" title="Recording">
      //The microphone button in the top menu, starts the song playing and records through the microphone at the same time so you can hear what your practice sessions sound like. Press stop to finish and save the recording.
      //<br/><br/>
      //Use headphones to exclude the generated audio from your recording.
      //<br/><br/>
      //Saved recordings for the current tune are listed under the recording button dropdown.
      //<br/><br/>
      //All recordings are available on the recordings page and clicking on one of the listed recordings will open the recording in multitrack audio editor.
      //The editor includes features to record more tracks, import more tracks from files or other recordings, trim and time shift and finally mix all the tracks back down to a single audio file and save it.
      //<br/><br/>
      //If you are logged in, audio recordings are saved to Google Drive and deleted from Google Drive when you delete the recording. If you are not logged in, the recording is only saved and deleted in the local database.
      //<br/><br/>
      //Recordings can be shared using a button in the recording manager list. You need to agree to share the recorded audio file (for anyone to read) to be able to generate a sharable link. The button color changes from grey (not saved), light blue (saved but not shared) to green (saved and shared). Link recipients must login with their own google account to access the shared document and import it into their own tune book recording manager.
      //</Tab>
      
      //<Tab eventKey="review" title="Review">
      //<div style={{fontSize:'1em'}}>The brain buttons can be used to set a confidence score for a song. 
      //<br/><br/>
      //The brain button in the top menu shows the review page where tunes that have any confidence score are shown, least confident tunes first and the tempo adjusted for the confidence level.
      
      //</div>
      //<br/>
      //</Tab>
