import { Link , useParams } from 'react-router-dom'
import {Button} from 'react-bootstrap'
import {useState, useEffect, useRef} from 'react'
import Abc from '../components/Abc'
export default function PrintPage(props) {
    var params = useParams()
    //var [refs , setRefs] = useState([])
    useEffect(function() {
        window.print()
    },[params.tuneBook])
    return <div className="App-print">
        {props.tunebook.fromBook(params.tuneBook).map(function(tune) {
            var words = {}
            var current = 0
            if (Array.isArray(tune.words)) {
                tune.words.forEach(function(line) {
                  if (line && line.trim().length > 0) {
                      if (!Array.isArray(words[current])) words[current] = []
                      words[current].push(line)
                  } else {
                      current++
                  }
                })
            } 
            
            return <div  ><Abc abc={props.tunebook.abcTools.json2abc_print(tune)} tunebook={props.tunebook} tune={tune} />
            
            <div className="lyrics" style={{marginLeft:'2em'}} >
                {Object.keys(words).map(function(key) {
                    return <div key={key} className="lyrics-block" style={{paddingTop:'1em',paddingBottom:'1em', pageBreakInside:'avoid'}} >{words[key].map(function(line, lk) {
                            return <div key={lk} className="lyrics-line" >{line}</div>
                        })}</div>
                })}
             </div>
            </div>
        })}
    </div>
}
