import {Link , useParams, useNavigate } from 'react-router-dom'
import {Button, Tabs, Tab} from 'react-bootstrap'
import {useState, useEffect, useRef, useCallback} from 'react'
import AbcEditor from './AbcEditor'
import SearchModal from './SearchModal'
import WizardOptionsModal from './WizardOptionsModal'
import LocalSearchSelectorModal from './LocalSearchSelectorModal'
import MediaSeekSlider from './MediaSeekSlider'
import { trackEditorOpen } from '../analytics'
import { canRedoTuneEdit, canUndoTuneEdit, getRedoTuneEditLabel, getUndoTuneEditLabel } from '../tuneEditHistory'

export default function MusicEditor(props) {
    const { tunebook, forceRefresh } = props
    var [ready, setReady] = useState(false)
    let [seekTo, setSeekTo] = useState(false)
    let params = useParams();
    var navigate = useNavigate()
    let tune = props.tunes ? props.tunes[params.tuneId] : null
    let abc = tunebook.abcTools.json2abc(tune)
    const editHistory = props.editHistory
    const historyState = editHistory ? editHistory.historyState : null
    const tuneId = tune && tune.id
    const canUndo = tuneId && historyState ? canUndoTuneEdit(historyState, tuneId) : false
    const canRedo = tuneId && historyState ? canRedoTuneEdit(historyState, tuneId) : false
    const undoLabel = tuneId && historyState ? getUndoTuneEditLabel(historyState, tuneId) : ''
    const redoLabel = tuneId && historyState ? getRedoTuneEditLabel(historyState, tuneId) : ''

    const handleUndo = useCallback(function() {
        if (!tuneId) return
        if (tunebook.undoTuneEdits(tuneId)) {
            forceRefresh()
        }
    }, [tuneId, tunebook, forceRefresh])

    const handleRedo = useCallback(function() {
        if (!tuneId) return
        if (tunebook.redoTuneEdits(tuneId)) {
            forceRefresh()
        }
    }, [tuneId, tunebook, forceRefresh])

    // prevent playlist redirects while editing  
    const setAbcPlaylist = props.setAbcPlaylist
    const setMediaPlaylist = props.setMediaPlaylist
    useEffect(function() {
      setAbcPlaylist(null)
      setMediaPlaylist(null)
      trackEditorOpen()
    },[setAbcPlaylist, setMediaPlaylist])

    useEffect(function() {
        function handleHistoryShortcut(event) {
            if (!tuneId || props.blockKeyboardShortcuts) return
            const target = event.target
            const tagName = target && target.tagName ? String(target.tagName).toLowerCase() : ''
            const isEditable = target && (target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select')
            if (isEditable) return
            const modifierPressed = event.metaKey || event.ctrlKey
            if (!modifierPressed) return
            const key = String(event.key || '').toLowerCase()
            if (key === 'z' && event.shiftKey) {
                if (canRedo) {
                    event.preventDefault()
                    handleRedo()
                }
                return
            }
            if (key === 'y') {
                if (canRedo) {
                    event.preventDefault()
                    handleRedo()
                }
                return
            }
            if (key === 'z') {
                if (canUndo) {
                    event.preventDefault()
                    handleUndo()
                }
            }
        }

        window.addEventListener('keydown', handleHistoryShortcut)
        return function() {
            window.removeEventListener('keydown', handleHistoryShortcut)
        }
    }, [props.blockKeyboardShortcuts, canRedo, canUndo, tuneId, handleRedo, handleUndo])
    
    //console.log('EDIT',tune,abc)
    return <div className="music-editor" style={{width:'100%'}}>
        <div className='music-editor-buttons' style={{backgroundColor: '#80808033', width: '100%',height: '3em', padding:'0.2em', textAlign:'left'}} >
            
            <Button className='btn-secondary' style={{ marginRight:'0.1em'}} onClick={function(e) {navigate("/tunes/"+tune.id)}} >{props.tunebook.icons.close}</Button>
            
            <span style={{marginLeft:'0.1em'}} >
                <LocalSearchSelectorModal  value={tune ? tune.name : ''} currentTune={tune} tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook} searchIndex={props.searchIndex} loadTuneTexts={props.loadTuneTexts} token={props.token} />
                
               
            </span>
            
            <span style={{marginLeft:'0.1em'}} ><WizardOptionsModal abc={abc} tune={tune} tunebook={props.tunebook} forceRefresh={props.forceRefresh} token={props.token} searchIndex={props.searchIndex} loadTuneTexts={props.loadTuneTexts} /></span>
            
            
            <span style={{marginLeft:'0.2em'}} ><Button title={canUndo && undoLabel ? 'Undo ' + undoLabel : 'Undo'} disabled={!canUndo} variant="secondary" className='btn-secondary' onClick={handleUndo} >{props.tunebook.icons.arrowgoback}</Button></span>
            <span style={{marginLeft:'0.2em'}} ><Button title={canRedo && redoLabel ? 'Redo ' + redoLabel : 'Redo'} disabled={!canRedo} variant="secondary" className='btn-secondary' onClick={handleRedo} >{props.tunebook.icons.arrowgoforward}</Button></span>
            <span style={{marginLeft:'0.2em', float:'right'}} ><Button variant="danger" className='btn-secondary' onClick={function(e) {if (window.confirm('Do you really want to delete this tune ?')) {props.tunebook.deleteTune(tune.id)}; navigate('/tunes') }} >{props.tunebook.icons.bin}</Button></span>
            
           
        </div>
        <MediaSeekSlider  mediaController={props.mediaController} />
        <AbcEditor  logout={props.logout} login={props.login}  token={props.token} mediaController={props.mediaController} audioProps={props.audioProps} forceRefresh={props.forceRefresh} isMobile={props.isMobile} abc={abc} tunebook={props.tunebook} tune={tune}   />
        
    </div>
}
//  <TheSessionSearchSelectorModal value={tune ? tune.name : ''} currentTune={tune}  tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  />
