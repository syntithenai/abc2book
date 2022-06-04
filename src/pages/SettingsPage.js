import { Link  } from 'react-router-dom'
import {Button} from 'react-bootstrap'

export default function SettingsPage(props) {
    return <div className="App-settings">
    <h1>Settings</h1>
   <Button style={{ marginRight:'0.2em', fontSize:'0.6em', position:'relative', top:'2px'}}  variant="warning" onClick={props.tunebook.utils.resetAudioCache} >Clear Audio Cache</Button>
    </div>
}
