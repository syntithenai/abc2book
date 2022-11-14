import { Link  } from 'react-router-dom'
import {Button} from 'react-bootstrap'
import {useState} from 'react'
export default function SettingsPage(props) {
  const tunebook = props.tunebook
  const token = props.token
  var linkBase = window.location.origin 
  linkBase = 'https://tunebook.syntithenai.com'
  const googleDocumentId = props.googleDocumentId
  const [link,setLink] = useState(null)
  const [preRenderAudioCheckbox,setPreRenderAudioCheckbox] = useState(localStorage.getItem('bookstorage_autoprime') === "true"  ? true : false)
  const [mergeWarningsCheckbox,setMergeWarningsCheckbox] = useState(localStorage.getItem('bookstorage_mergewarnings') === "true"  ? true : false)
   const [inlineAudioCheckbox,setInlineAudioCheckbox] = useState(localStorage.getItem('bookstorage_inlineaudio') === "true"  ? true : false)
  
  function clickPreRenderAudio() {
      var current = localStorage.getItem('bookstorage_autoprime')
      if (current === "true") {
        localStorage.setItem('bookstorage_autoprime',"false")
        setPreRenderAudioCheckbox('')
      } else {
        localStorage.setItem('bookstorage_autoprime',"true")
        setPreRenderAudioCheckbox(true)
      } 
      
   }
   
   function clickEnableMergeWarnings() {
      var current = localStorage.getItem('bookstorage_mergewarnings')
      if (current === "true") {
        localStorage.setItem('bookstorage_mergewarnings',"false")
        setMergeWarningsCheckbox('')
      } else {
        localStorage.setItem('bookstorage_mergewarnings',"true")
        setMergeWarningsCheckbox(true)
      } 
      
   }
   
   function clickEnableInlineAudio() {
      var current = localStorage.getItem('bookstorage_inlineaudio')
      if (current === "true") {
        localStorage.setItem('bookstorage_inlineaudio',"false")
        setInlineAudioCheckbox('')
      } else {
        localStorage.setItem('bookstorage_inlineaudio',"true")
        setInlineAudioCheckbox(true)
      } 
      
   }
  
  
    return <div className="App-settings">
    <h1>Settings</h1>
   
       <Button style={{marginRight:'0.5em',marginBottom:'1em',  position:'relative', top:'2px'}}  variant="warning" onClick={tunebook.utils.resetAudioCache} >Clear Audio Cache</Button><br/>
       
       <Button style={{marginRight:'0.5em',marginBottom:'1em',  position:'relative', top:'2px'}}  variant="danger" onClick={function(e) {
           if (props.token) {
               if (window.confirm('Are you REALLY sure you want to delete all of your tunes from this device and all other devices? Logout if you only want to reset this device')) {
                    if (window.confirm('Are you REALLY sure you want to delete all of your tunes on all your devices?')) {
                        tunebook.deleteAll()
                    }
               }
           } else if (window.confirm('Are you sure you want to delete all of your tunes on this device? Login to delete tunes from all your devices.')) {
                if (window.confirm('Are you REALLY sure you want to delete all of your tunes from this device?')) {
                   tunebook.deleteAll()
                }
            }
        }} >Delete All Tunes</Button><br/>
       
       
       <div>
         <label>Pre Render Audio ?<input type="checkbox" onChange={clickPreRenderAudio} checked={preRenderAudioCheckbox} /></label>
         <br/><b>This may cause the user interface to freeze temporarily without warning!</b>
       </div>
       <hr style={{margin:'1em'}}  />
       <div>
         <label>Enable Merge Warnings ?<input type="checkbox" onChange={clickEnableMergeWarnings} checked={mergeWarningsCheckbox} /></label>
         <br/><b></b>
       </div>
       <hr style={{margin:'1em'}}  />
       <div>
         <label>Enable Inline Audio ?<input type="checkbox" onChange={clickEnableInlineAudio} checked={inlineAudioCheckbox} /></label>
         <br/><b>This will make your song book much bigger so online synchronisation will be slower.</b>
         <br/><b></b>
       </div>
    </div>
}
//<Button style={{marginRight:'0.5em',marginBottom:'1em',  position:'relative', top:'2px'}}  variant="warning" onClick={function() {if (window.confirm("Do you really want to clear your review list?")) {tunebook.clearBoost()} }} >Clear Review Progress</Button><br/>
