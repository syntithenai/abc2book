import {useState, useEffect, useRef} from 'react'
import {Link , useParams , useNavigate} from 'react-router-dom'
import {Button} from 'react-bootstrap'
import Abc from './Abc'
import BoostSettingsModal from './BoostSettingsModal'
//import ReactTags from 'react-tag-autocomplete'
import BookMultiSelectorModal from  './BookMultiSelectorModal'

  
  //return (
    //<ReactTags
      //ref={reactTags}
      //tags={tags}
      //suggestions={suggestions}
      //onDelete={onDelete}
      //onAddition={onAddition}
    ///>
  //)

export default function MusicSingle(props) {
    let params = useParams();
    let navigate = useNavigate();
    //console.log('single',props)
    
    
    let tune = props.tunes ? props.tunes[params.tuneId] : null
    let abc = '' //props.tunebook.abcTools.settingFromTune(tune).abc

    function getTempo() {
        // use page tempo or fallback to tune tempo
        return (props.tempo > 0 ? props.tempo : (props.tunebook.abcTools.getTempo(tune) > 0 ? props.tunebook.abcTools.getTempo(tune) : 100))
    }
 
    function onEnded(progress, start, stop,seek) {
        console.log("ON ENDfED", progress, start, stop, seek)
        ////stop()
        //seek(0)
        //start()
    }
    
    if (tune) {
       return <div className="music-single">
            <div className='music-buttons' style={{backgroundColor: '#80808033', width: '100%',height: '3em', padding:'0.5em', textAlign:'center'}}  >
                <Link to={'/editor/'+params.tuneId}><Button className='btn-secondary' style={{float:'left'}} >{props.tunebook.icons.pencil}</Button></Link>
                <span style={{float:'left', marginLeft:'0.3em'}} ><BookMultiSelectorModal forceRefresh={props.forceRefresh} tunebook={props.tunebook} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions} value={tune.books} onChange={function(val) {console.log("save book selection",val); tune.books = val; props.tunebook.saveTune(tune);} } /></span>

                <BoostSettingsModal tunebook={props.tunebook} value={tune.boost} onChange={function(val) {tune.boost = val; props.tunebook.saveTune(tune); props.forceRefresh()}} />
                
                <Abc repeat={-1} tunebook={props.tunebook}  abc={props.tunebook.abcTools.json2abc(tune)} tempo={getTempo()} meter={tune.meter}  onEnded={onEnded} />
                
            </div>
            
        </div>
    }
}
