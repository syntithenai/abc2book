import {Link, useLocation} from 'react-router-dom'
import {Button} from 'react-bootstrap'
export default function Footer(props) {
    var location = useLocation()
    if (location.pathname.startsWith('/print') || location.pathname.startsWith('/cheatsheet')) return null
   
     return <div id="footer" style={{position:'fixed', bottom: 0, left: 0, width:'100%',display:'block',clear:'both',backgroundColor:'#e8f8fe', height:'1.2em'}} >
              <Link style={{float:'right'}} to='/' onClick={function() {setTimeout(function() {props.tunebook.utils.scrollTo('topofpage')},300)}} ><Button style={{fontSize:'0.6em'}} size="sm" >Home</Button></Link>
             
              <Link style={{float:'right', marginRight:'0.2em'}} to='/help' onClick={function() {setTimeout(function() {props.tunebook.utils.scrollTo('topofpage')},300)}} ><Button style={{fontSize:'0.6em'}} size="sm" >Help</Button></Link>
              
                {props.accessToken ? <Button style={{float:'right',fontSize:'0.6em', position:'relative', top:'2px', marginRight:'0.2em'}} size="sm" variant="danger" onClick={props.revokeToken} >Logout</Button> : <Button style={{float:'right',fontSize:'0.6em', position:'relative', top:'2px', marginRight:'0.2em'}} size="sm" variant="success" onClick={function() { props.getToken()}} >Login</Button>}
              
              <Button style={{ marginRight:'0.2em', float:'right',fontSize:'0.6em', position:'relative', top:'2px'}} size="sm" variant="warning" onClick={props.tunebook.utils.resetAudioCache} >CC</Button>
              
                
              <div style={{textAlign:'center', fontSize:'0.4em'}}><div>(CopyLeft 2022)    Steve Ryan <a href='mailto:syntithenai@gmail.com'>syntithenai@gmail.com</a>&nbsp;&nbsp;&nbsp;&nbsp;</div>
               <div>Source code on <a href='https://github.com/syntithenai/abc2book'>Github</a></div>
             </div>
          </div>
  }
  
   //var isOnline = useOnlineStatus()
   
//{isOnline && <></>}
            //{!isOnline && <Button style={{fontSize:'0.6em', float:'right', position:'relative', top:'2px'}} size="sm"  variant ="secondary" >Offline</Button>}
              
