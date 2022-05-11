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
            
            return <div  ><Abc abc={props.tunebook.abcTools.json2abc_print(tune)} tunebook={props.tunebook} tune={tune} /></div>
        })}
    </div>
}
