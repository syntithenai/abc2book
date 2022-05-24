import { Link , useParams } from 'react-router-dom'
import {Button} from 'react-bootstrap'
import {useState, useEffect, useRef} from 'react'
import {useNavigate} from 'react-router-dom'
import Abc from '../components/Abc'
import BookSelectorModal from '../components/BookSelectorModal'


export default function CheatSheetPage(props) {
    //console.log(props)
    var params = useParams()
    var navigate = useNavigate()
    //var [refs , setRefs] = useState([])
   
    return <div className="App-print">
    <div style={{ backgroundColor: '#3f81e3', borderRadius:'10px' , width: 'fit-content'}}   id="tunesearchextras" >
           <BookSelectorModal allowNew={false} forceRefresh={props.forceRefresh} title={'Select a Book'} currentTuneBook={params.tuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  tunebook={props.tunebook} onChange={function(val) {navigate('/cheatsheet/'+val)}} defaultOptions={props.tunebook.getTuneBookOptions} searchOptions={props.tunebook.getSearchTuneBookOptions} triggerElement={<Button style={{marginLeft:'0.1em', color:'black'}} >Book {(params.tuneBook ? <b>{params.tuneBook}</b> : '')} </Button>} />
        </div>
    <br/>
    
    {params.tuneBook ? <h3>Cheat Sheet - {params.tuneBook.replace(/(^\w|\s\w)/g, m => m.toUpperCase())}</h3> : <h3>Cheat Sheet</h3>}
        {props.tunebook.fromBook(params.tuneBook).map(function(tune,tk) {
            
            return <div key={tk} style={{width:'40%', height:'5em', float:'left'}} ><Abc link={true} scale="0.7" abc={props.tunebook.abcTools.json2abc_cheatsheet(tune)}  tunebook={props.tunebook} /></div>
        })}
    </div>
}
