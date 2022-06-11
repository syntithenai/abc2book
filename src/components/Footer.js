import {Link, useLocation} from 'react-router-dom'
import {Button} from 'react-bootstrap'
export default function Footer(props) {
    var location = useLocation()
    if (location.pathname.startsWith('/print') || location.pathname.startsWith('/cheatsheet')) return null
   
     return <div id="footer" style={{position:'fixed', bottom: 0, left: 0, width:'100%',display:'block',clear:'both',backgroundColor:'#e8f8fe', height:'1.6em'}} >
              <Link style={{float:'right'}} to='/' onClick={function() {setTimeout(function() {props.tunebook.utils.scrollTo('topofpage')},300)}} ><Button style={{fontSize:'0.6em'}} size="sm" >Home</Button></Link>
             
              <Link style={{float:'right', marginRight:'0.4em'}} to='/help' onClick={function() {setTimeout(function() {props.tunebook.utils.scrollTo('topofpage')},300)}} ><Button style={{fontSize:'0.6em'}} size="sm" >Help</Button></Link>
              
                {props.accessToken ? <Button style={{float:'right',fontSize:'0.6em', position:'relative', top:'2px', marginRight:'0.4em'}} size="sm" variant="danger" onClick={function() { props.logout()}} >Logout</Button> : <Button style={{float:'right',fontSize:'0.6em', position:'relative', top:'2px', marginRight:'0.4em'}} size="sm" variant="success" onClick={function() { props.login()}} >Login</Button>}
              
              <Link to="/settings" ><Button style={{padding:'0.4em', marginRight:'0.7em', float:'right',fontSize:'0.6em', position:'relative', top:'2px'}} size="sm" variant="warning"  >{props.tunebook.icons.settings}</Button></Link>
              
                
              <div style={{textAlign:'center', fontSize:'0.4em'}}>
              
                <div>
                  <span>(CopyLeft 2022)    Steve Ryan <a href='mailto:syntithenai@gmail.com'>
                  syntithenai@gmail.com</a>&nbsp;&nbsp;&nbsp;&nbsp;</span>
                </div>
                
                <div>Source code on <a href='https://github.com/syntithenai/abc2book'>Github</a></div>
                
              </div>
             <span style={{position:'fixed', bottom:'5px', right:'45%', height:'30px', width:'25px'}} >
                <form action="https://www.paypal.com/donate" method="post" target="_new">
                  <input type="hidden" name="hosted_button_id" value="RPP5VCZCWSZL4" />
                  <input type="image" style={{transform: 'rotate(20deg)', height:'30px', width:'25px'}} src="https://pics.paypal.com/00/s/OGVmNmM4NTQtMGQ0MS00NGVhLWI0NDgtNzMxYWRkMDY5NzIy/file.PNG" border="0" name="submit" title="PayPal - The safer, easier way to pay online!" alt="Donate with PayPal button" />
                  <img alt="" border="0" src="https://www.paypal.com/en_AU/i/scr/pixel.gif" width="1" height="1" />
                </form>
             </span>
             
          </div>
  }
  
   //var isOnline = useOnlineStatus()
   
//{isOnline && <></>}
            //{!isOnline && <Button style={{fontSize:'0.6em', float:'right', position:'relative', top:'2px'}} size="sm"  variant ="secondary" >Offline</Button>}
              
