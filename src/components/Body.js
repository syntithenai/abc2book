import {HashRouter as  Link  } from 'react-router-dom'
import {Button} from 'react-bootstrap'

export default function Body(props) {
    return <div className="App-body">
        {props.children}
    </div>
}
