import {Link , useParams, useNavigate } from 'react-router-dom'
import {Button, Tabs, Tab} from 'react-bootstrap'
import {useState, useEffect, useRef} from 'react'
import AbcEditor from './AbcEditor'
import SearchModal from './SearchModal'
import WizardOptionsModal from './WizardOptionsModal'
import LocalSearchSelectorModal from './LocalSearchSelectorModal'
import TheSessionSearchSelectorModal from './TheSessionSearchSelectorModal'
import MediaSeekSlider from './MediaSeekSlider'
export default function MusicEditor(props) {
    var [ready, setReady] = useState(false)
    let [seekTo, setSeekTo] = useState(false)
    let params = useParams();
    var navigate = useNavigate()
    let tune = props.tunes ? props.tunes[params.tuneId] : null
    let abc = props.tunebook.abcTools.json2abc(tune)
    
    
      
    // prevent playlist redirects while editing  
    useEffect(function() {
      //pushHistory(tune)  
      props.setAbcPlaylist(null)
      props.setMediaPlaylist(null)
    },[])
    
    //console.log('EDIT',tune,abc)
    return <div className="music-editor" style={{width:'100%'}}>
        <div className='music-editor-buttons' style={{backgroundColor: '#80808033', width: '100%',height: '3em', padding:'0.2em', textAlign:'left'}} >
            
            <Button className='btn-secondary' style={{ marginRight:'0.1em'}} onClick={function(e) {navigate("/tunes/"+tune.id)}} >{props.tunebook.icons.close}</Button>
            
            <span style={{marginLeft:'0.1em'}} >
                <LocalSearchSelectorModal  value={tune ? tune.name : ''} currentTune={tune} tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook} searchIndex={props.searchIndex} loadTuneTexts={props.loadTuneTexts} />
                
               
            </span>
            
            <span style={{marginLeft:'0.1em'}} ><WizardOptionsModal  abc={abc} tune={tune} tunebook={props.tunebook}  /></span>
            
            
            <span style={{marginLeft:'0.2em'}} ><   Button variant="warning" className='btn-secondary' onClick={function(e) {props.popHistory()}} >{props.tunebook.icons.arrowgoback}</Button></span>
            <span style={{marginLeft:'0.2em', float:'right'}} ><Button variant="danger" className='btn-secondary' onClick={function(e) {if (window.confirm('Do you really want to delete this tune ?')) {props.tunebook.deleteTune(tune.id)}; navigate('/tunes') }} >{props.tunebook.icons.bin}</Button></span>
            
           
        </div>
        <MediaSeekSlider  mediaController={props.mediaController} />
        <AbcEditor mediaController={props.mediaController} pushHistory={props.pushHistory} audioProps={props.audioProps} forceRefresh={props.forceRefresh} isMobile={props.isMobile} abc={abc} tunebook={props.tunebook} tune={tune}   />
        
    </div>
}
//  <TheSessionSearchSelectorModal value={tune ? tune.name : ''} currentTune={tune}  tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  />
