import {Link , useParams } from 'react-router-dom'
import {Button} from 'react-bootstrap'
import AbcEditor from './AbcEditor'
import SearchModal from './SearchModal'
import WizardOptionsModal from './WizardOptionsModal'
import LocalSearchSelectorModal from './LocalSearchSelectorModal'
import TheSessionSearchSelectorModal from './TheSessionSearchSelectorModal'

export default function MusicEditor(props) {
    let params = useParams();
    let tune = props.tunebook.tunes[params.tuneId]
    let abc = props.tunebook.abcTools.json2abc(tune)
    return <div className="music-editor">
        <div className='music-editor-buttons' style={{backgroundColor: '#80808033', width: '100%',height: '3em', padding:'0.5em', textAlign:'left'}} >
            <Link to={'/tunes/'+params.tuneId} ><Button className='btn-secondary' style={{ marginRight:'0.5em'}} >{props.tunebook.icons.close}</Button></Link>
            
            
            <span style={{marginLeft:'1em'}} >
                <LocalSearchSelectorModal  forceRefresh={props.forceRefresh} currentTune={tune} tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  />
                
                <TheSessionSearchSelectorModal forceRefresh={props.forceRefresh} currentTune={tune}  tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  />
            </span>
            
            <span style={{marginLeft:'1em'}} ><WizardOptionsModal tunebook={props.tunebook} /></span>
            
            <span style={{marginLeft:'2em'}} ><Button className='btn-secondary'  >{props.tunebook.icons.bin}</Button></span>
            
            <Button className='btn-secondary' style={{float:'right'}}   >{props.tunebook.icons.play}</Button>
            
        </div>
        <AbcEditor abc={abc} tunebook={props.tunebook}  />
        
    </div>
}
