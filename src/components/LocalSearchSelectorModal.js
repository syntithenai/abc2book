import {useState, useEffect} from 'react'
import {Button, Modal, ListGroup} from 'react-bootstrap'
import Abc from './Abc'
import axios from 'axios'
//import useTextSearchIndex from '../useTextSearchIndex'
        
   
function LocalSearchSelectorModal(props) {
  const [show, setShow] = useState(false);
  const [filter, setFilter] = useState(props.value);
  const [options, setOptions] = useState(defaultOptions());
  const handleClose = () => setShow(false);
  const handleShow = (e) => setShow(true);
  const [settings, setSettings] = useState(null)
  const [scores, setScores] = useState({}) 
  
  useEffect(function() {
      setFilter(props.value)
  },[])
  
  useEffect(function() {
      setFilter(props.value)
  },[props.value])
   
  function defaultOptions() {return {}}
  
  function searchOptions(text, callback) {
    props.searchIndex(text,function(searchRes) {
      var final = {}
      var sc = {}
      if (Array.isArray(searchRes)) {
        var lastScore = 0
        searchRes.forEach(function(result,rk)  {
            //console.log(result)
            final[result.ids.join(",")] = result.name
            if (lastScore != result.score) sc[rk] = true
            lastScore = result.score
        })
      }
      //console.log('sesarch index',text,final)
      callback(final)
      setScores(sc)
    }) 
  }  
  
  useEffect(function() {
    setSettings(null)
    searchOptions(props.value, function(opts) {setOptions(opts)})
  },[])
  
  useEffect(function() {
    setSettings(null)
  },[show])
  
  function selectSetting(setting) {
    //console.log('select setting ', setting, props.currentTune)
    if (props.currentTune && setting) {
        var tune = props.tunebook.abcTools.abc2json(setting)
        tune.id  = props.currentTune.id
        tune.books = props.currentTune.books
        tune.tags = props.currentTune.tags
        tune.links = props.currentTune.links
        //console.log('final tuine ',tune) 
        props.tunebook.saveTune(tune)
    }
  }
  
  //function selectSettingAsVoice(settingAbc, tune) {
    //var setting = props.tunebook.abcTools.abc2json(settingAbc)
    //var settingNotes = props.tunebook.abcTools.justNotes(settingAbc)
    ////var tune = props.tunebook.abcTools.abc2json(setting)
    ////tune.id = props.currentTune.id
    ////tune.books = props.currentTune.books
    //var tune = props.currentTune
    //tune.voices[('s-'+setting.id).slice(0,4)] = {meta:'key='+setting.key, notes:settingNotes.split("\n")}
    //props.tunebook.saveTune(tune)
    ////console.log('select setting ', props.tunebook, setting, tune, tune.voices)
    
    ////props.forceRefresh()
  //}
  
  
  
  function selectTune(key,value) {
    //console.log('select tune ',key,value)
      var tuneIds = key.split(",")
      //console.log('select tune ',tuneIds)
      props.loadTuneTexts(tuneIds).then(function(s) {
          //console.log('got sets',s)
          setSettings(s)
      })
      

  }
  
  

  

  

  
  var filterChangeTimeout = null
  function filterChange(e) {
    setFilter(e.target.value)
    if (e.target.value.trim() === '') {
      setOptions(defaultOptions())
    } else {
      if (filterChangeTimeout) clearTimeout(filterChangeTimeout) 
      filterChangeTimeout = setTimeout(function() {
        searchOptions(e.target.value, function(opts) {setOptions(opts)})
      },500)
    }
    e.preventDefault()
    return false  
  } 
  return (
    <>
      <Button onClick={handleShow} variant="primary" >{props.tunebook.icons.search}</Button>

      <Modal show={show} onHide={handleClose}>
        
        {settings !== null && 
          <>
          <Modal.Header closeButton>
          <Modal.Title>Pick a setting</Modal.Title>
          
          </Modal.Header>
         <Modal.Body>
          <ListGroup  style={{clear:'both', width: '100%'}}>
          {settings.map(function(setting, sk) {
            var tune = props.tunebook.abcTools.abc2json(setting)
            var useSetting = props.tunebook.abcTools.json2abc_cheatsheet(tune)
            return <div key={sk} >
              <Button  style={{float:'right'}} onClick={function(e) {
                if (window.confirm('Do you really want to replace this tune with information from the collection?')) {
                  selectSetting(setting); 
                }
                setShow(false)
              }} > Select</Button>
              
             
              
              <Abc abc={useSetting}  tunebook={props.tunebook} />
              <hr style={{width:'100%'}} />
            </div>
          })}</ListGroup>
          </Modal.Body>   
         
          </>
        }
        {settings === null && 
          <>
        <Modal.Header closeButton>
          <Modal.Title>Search the collection</Modal.Title>
        </Modal.Header>
          <Modal.Body>
          {(filter && filter.trim() ) && <>
          <a target="_new" href={"https://www.google.com/search?q=abc notation "+(filter ? filter.trim() : '')} ><Button>{props.tunebook.icons.externallink} Google</Button></a>
          <a target="_new" href={"https://thesession.org/tunes/search?q="+(filter ? filter.trim() : '')} ><Button>{props.tunebook.icons.externallink} TheSession.org</Button></a>
          <hr/>
          </>}
          <input type='text' value={filter} onChange={filterChange}   style={{width:'50%'}} />
          
          

         </Modal.Body>
        <Modal.Footer>
          <ListGroup  style={{clear:'both', width: '100%'}}>
            {Object.keys(options).map(function(option,tk) {
              return <ListGroup.Item  key={tk} style={scores[tk] === true ? {borderTop:'3px solid black'} : {}}  className={(tk%2 === 0) ? 'even': 'odd'} onClick={function(e) {selectTune(option,options[option])}} >{options[option]}</ListGroup.Item>
            })}
          </ListGroup>
           
        </Modal.Footer>
        </>}
      </Modal>
    </>
  );
}
export default LocalSearchSelectorModal
 //<Button  style={{float:'right'}} onClick={function(e) {
                //selectSettingAsVoice(setting, tune); 
                //setShow(false)
              //}} > Import Voices</Button>
