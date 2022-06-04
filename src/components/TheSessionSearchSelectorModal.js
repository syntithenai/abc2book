import {useState, useEffect} from 'react'
import {Button, Modal, ListGroup} from 'react-bootstrap'
import axios from 'axios'
import Abc from './Abc'

//import {useNavigate} from 'react-router-dom'

function TheSessionSearchSelectorModal(props) {
  //var navigate = useNavigate()
  const [show, setShow] = useState(false);
  const [filter, setFilter] = useState(props.value ? props.value : '');
  const [options, setOptions] = useState(defaultOptions());
  const handleClose = () => setShow(false);
  const handleShow = (e) => setShow(true);
  const [settings, setSettings] = useState(null)
  const [foundTune, setFoundTune] = useState(null)
  
  var filterChangeTimeout = null
  function filterChange(e) {
    setFilter(e.target.value)
    if (e.target.value.trim() === '') {
      setOptions(defaultOptions())
    } else {
      if (filterChangeTimeout) clearTimeout(filterChangeTimeout) 
      filterChangeTimeout = setTimeout(function() {
        searchOptions(e.target.value).then(function(options) {setOptions(options)})
      },500)
    }
  } 
  
  function defaultOptions() {
    return {}
  }
  
  async function searchOptions(filter) {
    return new Promise(function(resolve,reject) {
      //console.log('SEARCH',filter)
      axios.get('https://thesession.org/tunes/search?format=json&perpage=50&q='+filter).then(function(searchRes) {
        var final = {}
        if (searchRes && searchRes.data && searchRes.data.tunes) {
          searchRes.data.tunes.forEach(function(tune) {
            //var id = props.tunebook.utils.generateObjectId(tune.id + "-thesessionorg")
            final[tune.id] = tune.name + (tune.type ? "   ("+tune.type+")" : '')
          })
        }
        resolve(final)
      })
    })
  }

  useEffect(function() {
    setSettings(null)
    //console.log('ini searc',props.value)
    if (show) searchOptions(props.value).then(function(opts) {setOptions(opts)})
  },[show])
  
  useEffect(function() {
    setSettings(null)
  },[show])
  
  function selectSetting(setting) {
    //console.log('select setting ', setting, foundTune)
    var tune = foundTune
    if (tune) {
      tune.voices = {'1': {meta:'',notes:setting.abc.split("\n")}}
      tune.key = setting.key
      tune.id = props.currentTune.id
      tune.books = props.currentTune.books
      props.tunebook.saveTune(tune)
      //props.forceRefresh()
    }
  }
    
  function selectTune(tuneId) {
    return new Promise(function(resolve,reject) {
      axios.get('https://thesession.org/tunes/'+tuneId+'?format=json&perpage=50').then(function(searchRes) {
        //console.log('res',searchRes)
        var final = {}
        if (searchRes && searchRes.data && searchRes.data.settings ) {
          var tune = searchRes.data
          
          var abc = props.tunebook.abcTools.json2abc(tune)
          setSettings(searchRes.data.settings)
          setFoundTune(tune)
          //if (window.confirm('Do you really want to replace this tune with information from thesession.org ?')) {
            //var newTune = searchRes.data
            //newTune.id = props.currentTune.id
            //newTune = props.tunebook.saveTune(newTune)
            //props.forceRefresh()
            //handleClose()
            ////navigate('/edit/'+newTune.id)
          //}
        } else {
          setShow(false)
        }
        resolve(final)
      })
    })
  }
  
   //$.get('https://thesession.org/tunes/'+forceTuneId+'?format=json&perpage=50').then(function(tune) {
          //handleFoundTune(tune, tunesList, searchText, forceSetting, songNumber, settingCallback)
        //}).catch(function(e) {
          //console.log(["ERR1",e])
          //handleFoundTune(null, tunesList, searchText, null, songNumber, settingCallback)
        //})
      //} else {
        //$.get('https://thesession.org/tunes/search?format=json&perpage=50&q='+searchText).then(function(searchRes) {
          //// cache search results
          //var searchCache = loadLocalObject('abc2book_search')
          //searchCache[safeString(searchText)] = searchRes.tunes
          //saveLocalObject('abc2book_search',searchCache)
          //if (searchRes && searchRes.tunes && searchRes.tunes.length > 0 && searchRes.tunes[0].id) {
            //$.get('https://thesession.org/tunes/' + searchRes.tunes[0].id+'?format=json&perpage=50').then(function(tune) {
              //handleFoundTune(tune, tunesList, searchText, forceSetting, songNumber, settingCallback)
             
  
  
  return (
    <>
      <Button style={{color:'black', fontFamily:'Times New Roman, Times, serif'}}  variant="primary" onClick={handleShow}>
        S
      </Button>

      <Modal show={show} onHide={handleClose}>
        
         {settings !== null && 
          <>
          <Modal.Header closeButton>
          <Modal.Title>Pick a setting</Modal.Title>
          
          </Modal.Header>
         <Modal.Body>
          <ListGroup  style={{clear:'both', width: '100%'}}>
          {settings.map(function(setting, sk) {
            return <div key={sk} >
              <Button  style={{float:'right'}} onClick={function(e) {
                if (window.confirm('Do you really want to replace this tune with information from the collection?')) {
                  selectSetting(setting); 
                }
                setShow(false)
              }} > Select</Button>
              <Abc abc={setting.abc} tunebook={props.tunebook} />
              <hr style={{width:'100%'}} />
            </div>
          })}</ListGroup>
          </Modal.Body>   
         
          </>
        }
        {settings === null && 
          <>
        <Modal.Header closeButton>
          <Modal.Title>Search TheSession.org </Modal.Title>
          
        </Modal.Header>
        <Modal.Body>
          <input type='text' value={filter} onChange={filterChange}   />
        </Modal.Body>
        <Modal.Footer>
          <ListGroup  style={{clear:'both', width: '100%'}}>
            {Object.keys(options).map(function(option,tk) {
              return <ListGroup.Item  key={tk} className={(tk%2 === 0) ? 'even': 'odd'} onClick={function(e) {selectTune(option)}} >{options[option]}</ListGroup.Item>
            })}
          </ListGroup>
        </Modal.Footer>
        </>}
        
        
      </Modal>
    </>
  );
}
export default TheSessionSearchSelectorModal
