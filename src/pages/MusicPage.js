import {Link, Outlet  } from 'react-router-dom'
import {Button} from 'react-bootstrap'
import MusicLayout from '../components/MusicLayout'
import IndexLayout from '../components/IndexLayout'

export default function MusicPage(props) {
    return <div className="music-page">
       <Outlet/>
       <IndexLayout tunebook={props.tunebook} forceRefresh={props.forceRefresh} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  />
    </div>
}
