import {Link , useParams, useNavigate } from 'react-router-dom'
import {Button, Tabs, Tab} from 'react-bootstrap'
import {useState, useEffect} from 'react'
import AbcEditor from './AbcEditor'
import SearchModal from './SearchModal'
import WizardOptionsModal from './WizardOptionsModal'
import LocalSearchSelectorModal from './LocalSearchSelectorModal'
import TheSessionSearchSelectorModal from './TheSessionSearchSelectorModal'

export default function MusicEditor(props) {
    var [ready, setReady] = useState(false)
    let [seekTo, setSeekTo] = useState(false)
    let params = useParams();
    var navigate = useNavigate()
    let tune = props.tunebook.tunes[params.tuneId]
    let abc = props.tunebook.abcTools.json2abc(tune)
    return <div className="music-editor" style={{width:'100%'}}>
        <div className='music-editor-buttons' style={{backgroundColor: '#80808033', width: '100%',height: '3em', padding:'0.2em', textAlign:'left'}} >
            <Link to={'/tunes/'+params.tuneId} ><Button className='btn-secondary' style={{ marginRight:'0.1em'}} >{props.tunebook.icons.close}</Button></Link>
               
            
            <span style={{marginLeft:'0.1em'}} >
                <LocalSearchSelectorModal  value={tune.name} currentTune={tune} tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  />
                
                <TheSessionSearchSelectorModal value={tune.name} currentTune={tune}  tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  />
            </span>
            
            <span style={{marginLeft:'0.1em'}} ><WizardOptionsModal  abc={abc} tune={tune} tunebook={props.tunebook}  /></span>
            
            <span style={{marginLeft:'0.2em'}} ><Button variant="danger" className='btn-secondary' onClick={function(e) {if (window.confirm('Do you really want to delete this tune ?')) {props.tunebook.deleteTune(tune.id)}; navigate('/tunes') }} >{props.tunebook.icons.bin}</Button></span>
            
            <Button className='btn-secondary' style={{float:'right'}}   >{props.tunebook.icons.play}</Button>
            
        </div>
        <AbcEditor seekTo={seekTo} setSeekTo={setSeekTo}   audioContext={props.audioContext} setAudioContext={props.setAudioContext} midiBuffer={props.midiBuffer} setMidiBuffer={props.setMidiBuffer} timingCallbacks={props.timingCallbacks} setTimingCallbacks={props.setTimingCallbacks}  ready={ready} setReady={setReady} forceRefresh={props.forceRefresh} isMobile={props.isMobile} abc={abc} tunebook={props.tunebook} tune={tune}  />
        
    </div>
}
