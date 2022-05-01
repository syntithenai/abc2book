import { Link  } from 'react-router-dom'
import {Button} from 'react-bootstrap'

export default function PrintPage(props) {
    return <div className="App-print">
    print
        {props.children}
    </div>
}
