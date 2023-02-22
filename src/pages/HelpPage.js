import PrivacyContent from '../components/PrivacyContent'
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
          <li>Link Youtube videos to tunes and generate playlists.</li>
          <li>Use wizard tools to fix and apply transformations to music.</li>
          <li>Transpose a tune quickly by clicking on the key signature.</li>
          <li>Search for lyrics.</li>
          <li>Generate abc notation from chords. </li>
          <li>Organise tunes into books.</li>
          <li>Use the Tune Book without Internet access (with the songs you have already imported)</li>
          <li>Login using Google to keep a copy of your whole tune book a Google Document. Audio recordings are also saved to Google Drive.</li>
          <li>Synchronise changes between your devices so tunes you add on your phone turn up on your computer.</li>
          <li>Listen to the tunes and set the tempo (double click the play button to start from the beginning).</li>
          <li>Edit tunes using <a target="_new" href="http://www.lesession.co.uk/abc/abc_notation.htm">ABC Notation</a> with immediate visual feedback and audio support.</li>
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
      <li>Almost all the features work without Internet. The main exception being access to online tune resources. Once you have imported some tunes they will be available without Internet. Playback of YouTube also requires Internet access.</li>
      <li>Mobile devices will show an option to install the software as an App.</li>
      </ul>
      <div style={{fontSize:'1em'}}>
      You can optionally log in to the Tune Book using your Google Account using the green button <Button variant="success">{props.tunebook.icons.login}</Button> on the top menu. 
      <br/><br/>
      Once logged in, all changes to your Tune Book by adding, deleting or editing tunes are saved to your Google Drive. <br/><br/>
      The tune book is loaded from a document in Google Drive named <b>ABC Tune Book</b> (even if it's in the Trash). By renaming this document in Google Drive, you can force the software to create a new tune book. 
      <br/><br/>
      If you log in to the same account on a different device, the software will attempt to synchronise your local database with the version stored online. If your local database needs to be updated, a list of changes will be shown along with choices to merge the changes, discard local changes or logout and ignore the version saved to Google Drive.
      <br/><br/>
      The green merge button will try to preserve changes everywhere by saving any locally changed files and updating any files changed or added online.
      When tunes are deleted locally while you are logged out or offline, the merge will try to replace the tunes.
      <br/>
      <div style={{border:'1px solid orange', backgroundColor:'#ff400066',padding:'1em'}} >
      The merge will not delete tunes so if you have deleted tunes on another device it is best to logout, use the <a href='/settings#/settings'><Button variant="success">Settings</Button></a> page to clear all songs on a device, then login again to get a complete clean version of the song book from the other device.
      </div>
      <br/><br/>
      The software checks regularly for changes to the Google Document so if you are logged in to two devices at the same time, changes on one devices will appear within a few seconds as an import warning on your other device.
      <br/><br/>
      You need to be logged in to use the sharing features which require saving the Tune Book online.
      Due to restrictions in the way Google shares 'publicly' available documents, link recipients need to be logged in to their own Google account to access shared files from other users. 
      </div>
      
      
      </Tab>
      <Tab eventKey="books" title="Books">
      Book and tags are the main way of organising your tunes.
      <br/><br/>
      Each tune can be in many books and have many tags.
      <br/><br/>
      
      <br/><br/>
      The search page allows filtering by book and tag as well as title search.
      <br/><br/>
      The search list allows selecting multiple tunes and (using the grey dropdown at the top of the list) add or remove all selected tunes from a book or tag. The bulk editor also allows for changing a field value in many tunes.
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
      <b>Chords are not saved automatically. Be sure to use the "Generate Music" button to save your chords.</b>
      <br/><br/>
      The harmony structure for a song can be quickly scaffolded using a more compressed format in the chords tab of the editing page.
      <br/><br/>
      Chords entered as <i>eg C|F G|G F F C|C . G C</i> are used to generate abc notation.
      <br/><br/>
      <b>Chords are not saved automatically. Be sure to use the "Generate Music" button to save your chords.</b>
      <br/><br/>

      <hr/>
      Depending on your needs, it is not necessary to include bar lines in entering chords. I find that if I copy the text with embedded chords from <a target='_new' href='https://tabs.ultimate-guitar.com/' >https://tabs.ultimate-guitar.com/</a>, I can delete all the lyrics lines and use the remaining lines of chord symbols to scaffold the harmony.
      By using the same text but deleting all the chord symbols to paste in as lyrics, the chord blocks and lyrics line up.
      This approach creates one bar of music per line of chords which may not be rhythmically accurate but is perhaps sufficient for a harmony player to work with.<br/><br/>
        <hr/>
      Chords can be forced to display in blocks by editing the ABC notes and adding double bar lines to the end of sections where you want a blank line between chord blocks.
      <pre>
      eg<br/>
      C F G G<br/>
      C G G C<br/>
      ===> music notes (ABC)<br/>
      "C"zzz"F"zzz"G"zzz"G"zzz|<br/>
      "C"zzz"G"zzz"G"zzz"C"zzz|<br/>
      <br/>
      By editing the music to add double bar lines, the lyrics and chord view will show a blank line after double bar lines.<br/>
      eg<br/>
      "C"zzz"F"zzz"G"zzz"G"zzz||<br/>
      "C"zzz"G"zzz"G"zzz"C"zzz|<br/>
      ====> chord and lyrics view<br/>
      C F G G<br/>
      <br/>
      C G G C<br/>
      
      </pre>
      
      
      </Tab>
      
      
     
      <Tab eventKey="confidence" title="Confidence Tracking">
      Tunes can be assigned a confidence (and difficulty) score between 0 and 20  using the button with the brain icon.
      <br/><br/>
      The benefits to maintaining this information include
      <ul>
        <li>Grouping by confidence or difficulty in the list.</li>
        <li>Playlists are sorted by confidence so you hear your least confident tunes first.</li>
      </ul>
      </Tab>
      
       <Tab eventKey="youtube" title="YouTube">
                    
            <div class="c4 youtube-help-content">

            <p class="c1"><span class="c3"><h3>Selecting a YouTube link</h3></span></p><p class="c1 c2"><span class="c3"></span></p><p class="c1"><span class="c0">Click the blue button with the song title to view a tune.</span></p>
            <p class="c1"><span ><img alt="" src="helpimages/image3.png"  title="" /></span></p><p class="c1 c2"><span class="c0"></span></p><p class="c1"><span class="c0">Scroll up slightly to see the tune buttons and click the red media selection button.</span></p><p class="c1"><span ><img alt="" src="helpimages/image9.png"  title="" /></span></p><p class="c1 c2"><span class="c3"></span></p><p class="c1 c2"><span class="c0"></span></p><p class="c1"><span class="c0">Click &quot;Search YouTube&quot;</span></p><p class="c1"><span ><img alt="" src="helpimages/image10.png"  title="" /></span></p><p class="c1 c2"><span class="c0"></span></p><p class="c1 c2"><span class="c3"></span></p><p class="c1"><span class="c0">In the resulting dialog, click the green Select button to choose a YouTube video to associate with the tune record.</span></p><p class="c1"><span ><img alt="" src="helpimages/image7.png" title="" /></span></p><p class="c1 c2"><span class="c0"></span></p><p class="c1 c2"><span class="c0"></span></p><p class="c1 c2"><span class="c0"></span></p><p class="c1 c2"><span class="c0"></span></p>
            <p class="c1"><span>&#8203;</span><span class="c3"><h3>Logging In</h3></span></p><p class="c1 c2"><span class="c0"></span></p><p class="c1"><span class="c5">To import and export a playlist, you need to first login</span><span class="c0">&nbsp;(with Google) using the green button in the menu.</span></p><p class="c1 c2"><span class="c0"></span></p><p class="c1"><span ><img alt="" src="helpimages/image5.png"  title="" /></span></p><p class="c1 c2"><span class="c0"></span></p>
            <p class="c1"><span class="c3"><h3>Exporting a book to a YouTube playlist</h3></span></p><p class="c1 c2"><span class="c0"></span></p>
            <p class="c1"><span class="c0">The tunebook software can behave as a playlist manager in a web browser. This has limits as an audio player around device screen locking.</span></p><p class="c1"><span class="c0">By exporting a book of tunes with YouTube links that a user is interested in, it is possible to play them through the official youtube app or voice controlled devices like Google Nest.</span></p><p class="c1 c2"><span class="c0"></span></p><p class="c1 c2"><span class="c0"></span></p><p class="c1"><span class="c0">Go to the Books page by clicking the first menu item.&#8203;</span></p>
            <p class="c1"><span ><img alt="" src="helpimages/image1.png"  title="" /></span></p><p class="c1 c2"><span class="c0"></span></p><p class="c1"><span class="c0">Click the dropdown arrow next to one of your books to see a dialog with options for the book including &quot;Export YouTube Playlist&quot;</span></p>
            <p class="c1"><span ><img alt="" src="helpimages/image2.png"  title="" /></span></p><p class="c1 c2"><span class="c0"></span></p><p class="c1 c2"><span class="c0"></span></p>
            <p class="c1"><span class="c0">Clicking the &quot;Export YouTube Playlist&quot; button will create a YouTube playlist and playlist items for the logged in user for up to 50 items in the book.</span></p>
            <p class="c1"><span ><img alt="" src="helpimages/image4.png"  title="" /></span></p><p class="c1 c2"><span class="c0"></span></p><p class="c1 c2"><span class="c0"></span></p>
            <p class="c1"><span class="c3"><h3>Importing a playlist</h3></span></p>
            <p class="c1"><span class="c0">&#8203;Importing a playlist from YouTube can be a quick start to collecting a genre or artist in the Tune Book.</span></p><p class="c1 c2"><span class="c0"></span></p>
            <p class="c1"><span class="c0">The green &quot;Import&quot; button on the books and list pages brings up a dialog with import options.</span></p>
            <p class="c1"><span ><img alt="" src="helpimages/image11.png"  title="" /></span></p><p class="c1 c2"><span class="c0"></span></p><p class="c1 c2"><span class="c0"></span></p><hr /><p class="c1 c2"><span class="c0"></span></p><p class="c1 c2"><span class="c0"></span></p><p class="c1"><span class="c0">Click the button to import from YouTube</span></p><p class="c1 c2"><span class="c0"></span></p>
            <p class="c1"><span ><img alt="" src="helpimages/image12.png"  title="" /></span></p><p class="c1 c2"><span class="c0"></span></p><p class="c1 c2"><span class="c0"></span></p><p class="c1 c2"><span class="c0"></span></p>
            <p class="c1"><span class="c0">Paste the id of a YouTube playlist or select one of the logged in users playlists to import.</span></p>
            <p class="c1"><span class="c0">Importing playlist items creates tune records with a title and a YouTube link for every playlist item that is not already in the local tune database.</span></p><p class="c1 c2"><span class="c0"></span></p><p class="c1"><span ><img alt="" src="helpimages/image8.png"  title="" /></span></p><p class="c1 c2"><span class="c0"></span></p><p class="c1 c2"><span class="c0"></span></p><p class="c1 c2"><span class="c0"></span></p></div>
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
Associating Youtube tracks with tunes makes listening to a practice list much more pleasant.
<br/><br/>
<hr/>
MusicXML is the wide spread standard for distributing detailed musical scores. Tools like MuseScore offer the ability to deal with complicated music.
This tool offers to import MusicXML but the underlying library only works for simple single line melodies.
<br/><br/>
If you need to work with piano or orchestral scores, use another tool.
This tool is best suited to musicians wanting to organise simple tunes and songs or those with an interest in traditional music.
<br/><br/>
That said, ABC notation can be used to score multi part and multi instrument music.
<br/><br/>



      </Tab>
      <Tab eventKey="privacy" title="Privacy">
        <PrivacyContent/>
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


 //<Tab eventKey="profile" title="FAQ">
        //<ul>
        //<li><b>My phone went flat?</b></li>
        //<li>When music notation is displayed, the software keeps the screen awake on mobile devices. Handy but ... remember to turn off the app/your screen when you're done!!</li>
        //</ul>
        
        //<ul>
        //<li><b>When I upload a tune to the session, the rhythm gets messed up.</b></li>
        //<li>Edit the tune and use the wizard tools to double or halve the note durations.
        //<br/>When submitting or updating a setting of a tune to the session, the ABC headers for note length are ignored in favor of the note length that was set when the tune was created. If the note length of the tune on thesession.org is 1/4 and your abc uses 1/8, all the notes will be half their expected lengths :(  <br/></li>
        
        
        
    //</ul>
      //</Tab>
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

