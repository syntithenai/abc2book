import { Link  } from 'react-router-dom'
import {Button} from 'react-bootstrap'
import {useState} from 'react'
import useGoogleDocument from '../useGoogleDocument'

export default function SettingsPage(props) {
  const tunebook = props.tunebook
  const token = props.token
  var linkBase = window.location.origin 
  linkBase = 'https://tunebook.syntithenai.com'
  const googleDocumentId = props.googleDocumentId
  const [link,setLink] = useState(null)
  const docs = useGoogleDocument({token})
    return <div className="App-settings">
    <h1>Settings</h1>
   
   <Button style={{float:'right', marginRight:'0.5em',  position:'relative', top:'2px'}}  variant="warning" onClick={tunebook.utils.resetAudioCache} >Clear Audio Cache</Button>

   {(googleDocumentId && token) && <Button style={{ float:'left',marginRight:'0.2em', position:'relative', top:'2px'}}  variant="success" onClick={function() {
      if (window.confirm('The google document that stores your tune book will be made available for anybody to read. Is that OK?')) {
         docs.addPermission(googleDocumentId, {type:'anyone', role:'reader'})
         setLink(linkBase+ "/#/importdoc/"+googleDocumentId)
      }  
    }} >Share My Tune Book</Button>}
    <div style={{clear:'both', paddingTop:'1em'}}>{link && <a href={link}>{link}</a>}</div>
    
    {link && <>
      <a target="_new" href={"https://www.facebook.com/sharer/sharer.php?u="+encodeURIComponent(link)+"&quote=My%20Tune%20Book"} ><Button>Share on Facebook</Button></a>
      <a target="_new" href={"mailto://fred@here.com"+"?subject=My%20Tune%20Book&body="+encodeURIComponent(link)} ><Button>Share by Email</Button></a>
      <Button onClick={function() {tunebook.utils.copyText(link)}} >Copy Link</Button>
    </>}
   
    </div>
}
