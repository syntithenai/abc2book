import {useState, useEffect} from 'react'
import {Link , useParams , useNavigate} from 'react-router-dom'
import {Button} from 'react-bootstrap'
import Abc from './Abc'
import BoostSettingsModal from './BoostSettingsModal'
//import ReactTags from 'react-tag-autocomplete'

  
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
    let [isPlaying, setIsPlaying] = useState(false)
    let [isWaiting, setIsWaiting] = useState(false)
    //console.log('single',props.tunebook.tunes)
    let navigate = useNavigate();
    function audioCallback(event) {
        if (event ==='ended' || event ==='error' || event === 'stop') {
            setIsPlaying(false)
            setIsWaiting(false)
        } else if (event === 'started') {
            setIsWaiting(false)
        } 
    }
    
    let tune = props.tunebook.tunes[params.tuneId]
    let abc = props.tunebook.abcTools.settingFromTune(tune).abc
    useEffect(function() {
         tune = props.tunebook.tunes[params.tuneId]
         if (!tune) navigate("/tunes")
    },[params.tuneId])
    //props.tunebook.setForceRefresh()
    //const [tags, setTags] = useState([])

    //const [suggestions, setSuggestions] = useState([
        //{ id: 1, name: "Apples" },
        //{ id: 2, name: "Pears" },
        //{ id: 3, name: "Bananas" },
        //{ id: 4, name: "Mangos" },
        //{ id: 5, name: "Lemons" },
        //{ id: 6, name: "Apricots" }
    //])

    //const reactTags = useRef()

    //const onDelete = useCallback((tagIndex) => {
        //setTags(tags.filter((_, i) => i !== tagIndex))
    //}, [tags])

    //const onAddition = useCallback((newTag) => {
        //setTags([...tags, newTag])
    //}, [tags])

    if (tune) {
       return <div className="music-single">
            <div className='music-buttons' style={{backgroundColor: '#80808033', width: '100%',height: '3em', padding:'0.5em', textAlign:'center'}}  >
                <Link to={'/editor/'+params.tuneId}><Button className='btn-secondary' style={{float:'left'}} >{props.tunebook.icons.pencil}</Button></Link>
                
                <BoostSettingsModal tunebook={props.tunebook} value={tune.boost} onChange={function(val) {tune.boost = val; props.tunebook.saveTune(tune); props.forceRefresh()}} />
                
                {!isPlaying && <Button className='btn-secondary' style={{float:'right'}} onClick={function(e) {setIsWaiting(true); setIsPlaying(true)}} >{props.tunebook.icons.start}</Button>}
                {isPlaying && <Button className='btn-secondary' style={{float:'right'}} onClick={function(e) {setIsPlaying(false)}} >{isWaiting && <span  >{props.tunebook.icons.timer}</span>} {props.tunebook.icons.stop}</Button>}
            </div>
            <Abc abc={props.tunebook.abcTools.json2abc(tune)} isPlaying={isPlaying} audioCallback={audioCallback} tempo={props.tunebook.tempo} milliSecondsPerMeasure={(props.tunebook.abcTools.getMilliSecondsPerMeasure(tune, props.tunebook.tempo))} />
        </div>
    }
}
