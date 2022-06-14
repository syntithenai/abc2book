import featuredTunes from '../FeaturedTunes'
import {useState, useEffect} from 'react'
import Abc from './Abc'

export default function FeaturedTune(props) {
    const [tune,setTune] = useState(null)
    const [title,setTitle] = useState(null)
    
    useEffect(function() {
        
        var l = Object.keys(featuredTunes).length
        var r = Math.floor(Math.random() * l)
        var tk = Object.keys(featuredTunes)[r]
        var t = tk ? featuredTunes[tk] : null
        console.log("FT",r,tk,t,featuredTunes)
        setTune(t)
        setTitle(tk)
    },[])
    
    return <div style={{marginTop:'1em'}} >
        {tune && <>
            <h3>Featured Tune {title}</h3>
            <Abc scale={0.2} repeat={tune.repeats > 0 ? tune.repeats : 1 } tempo={121} meter={tune.meter} tunebook={props.tunebook}  abc={tune}  />
        </>}
    </div>
}
