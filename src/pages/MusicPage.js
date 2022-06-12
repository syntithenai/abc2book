import {Link, Outlet  } from 'react-router-dom'
import {Button} from 'react-bootstrap'
import MusicLayout from '../components/MusicLayout'
import IndexLayout from '../components/IndexLayout'

export default function MusicPage(props) {
    return <div className="music-page">
       <Outlet/>
       <IndexLayout googleDocumentId={props.googleDocumentId} token={props.token} tunes={props.tunes}  setCurrentTune={props.setCurrentTune} tunesHash={props.tunesHash}  tunebook={props.tunebook} forceRefresh={props.forceRefresh} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  />
    </div>
}
