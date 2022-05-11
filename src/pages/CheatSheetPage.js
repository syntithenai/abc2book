import { Link , useParams } from 'react-router-dom'
import {Button} from 'react-bootstrap'
import {useState, useEffect, useRef} from 'react'
import Abc from '../components/Abc'
export default function CheatSheetPage(props) {
    
    var params = useParams()
    //var [refs , setRefs] = useState([])
   
    return <div className="App-print">
    <br/>
    {params.tuneBook ? <h3>Cheat Sheet - {params.tuneBook.replace(/(^\w|\s\w)/g, m => m.toUpperCase())}</h3> : <h3>Cheat Sheet</h3>}
        {props.tunebook.fromBook(params.tuneBook).map(function(tune) {
            
            return <div style={{width:'40%', height:'5em', float:'left'}} ><Abc abc={props.tunebook.abcTools.json2abc_cheatsheet(tune)}  tunebook={props.tunebook} /></div>
        })}
    </div>
}
