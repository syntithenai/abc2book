import {Link, useLocation} from 'react-router-dom'
import {Button} from 'react-bootstrap'
export default function Footer(props) {
    var location = useLocation()
    if (location.pathname.startsWith('/print') || location.pathname.startsWith('/cheatsheet')) return null
   
     return <div id="footer" style={{position:'fixed', bottom: 0, left: 0, width:'100%',display:'block',clear:'both',backgroundColor:'#e8f8fe', height:'1.6em'}} >
            
                {props.accessToken ? <Button style={{float:'right',fontSize:'0.6em', position:'relative', top:'2px', marginRight:'0.4em'}} size="sm" variant="danger" onClick={function() { props.logout()}} >Logout</Button> : <Button style={{float:'right',fontSize:'0.6em', position:'relative', top:'2px', marginRight:'0.4em'}} size="sm" variant="success" onClick={function() { props.login()}} >Login</Button>}
              
                
             
             
          </div>
  }
  
   //var isOnline = useOnlineStatus()
   
//{isOnline && <></>}
            //{!isOnline && <Button style={{fontSize:'0.6em', float:'right', position:'relative', top:'2px'}} size="sm"  variant ="secondary" >Offline</Button>}
              
