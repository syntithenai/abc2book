import {useState, useEffect} from 'react'
import {Button, Modal, ListGroup} from 'react-bootstrap'
import axios from 'axios'
import Abc from './Abc'

function YouTubeSearchModal(props) {
  const [show, setShow] = useState(false);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [options, setOptions] = useState(defaultOptions());
  const handleClose = () => {
      setShow(false);
      if (props.handleClose) props.handleClose()
  }
  const handleShow = (e) => {
      setShow(true);
  }
  
  useEffect(function() {
      setFilter(props.value)
  },[props.value])
  
  var filterChangeTimeout = null
  function filterChange(e) {
    setFilter(e.target.value)
    if (e.target.value.trim() === '') {
      setOptions(defaultOptions())
    } else {
      if (filterChangeTimeout) clearTimeout(filterChangeTimeout) 
      filterChangeTimeout = setTimeout(function() {
        searchOptions(e.target.value).then(function(options) {setOptions(options)})
      },1000)
    }
  } 
  
  function defaultOptions() {
    return {}
  }
  
  //async function searchYouTube(query) {
      //axios.get('https://youtube.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=' + query + '&key='+process.env.REACT_APP_GOOGLE_API_KEY).then(function(res) {
         //console.log(res) 
          
      //})
      //var results = []
      //data['items'].forEach(function(item) {
          ////console.log(item)
          //if (item.id && item.id.kind === "youtube#video") {
            //results.push(
                //{
                    //id: item.id.videoId, 
                    //title: item.snippet.title, 
                    //description: item.snippet.description, 
                    //image: item.snippet.thumbnails['default']
                //}
            //)
          //}
      //})
      //console.log(results)
      //return results
    //}
  
  function searchOptions(filter) {
    return new Promise(function(resolve,reject) {
      
      //console.log('SEARCH',filter)
      axios.get('https://youtube.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=' + filter + '&key='+process.env.REACT_APP_GOOGLE_API_KEY).then(function(searchRes) {
        var results = []
        if (searchRes && searchRes.error) {
            setError(searchRes.error.message)
        }
        if (searchRes && searchRes.data) {
          setError('') 
          searchRes.data['items'].forEach(function(item) {
              //console.log(item)
              if (item.id && item.id.kind === "youtube#video") {
                results.push(
                    {
                        id: item.id.videoId, 
                        title: item.snippet.title, 
                        description: item.snippet.description, 
                        image: item.snippet.thumbnails['default'].url,
                        link: 'https://www.youtube.com/watch?v='+item.id.videoId
                    }
                )
              }
          })
        }
        //console.log(results)
        resolve( results)
      }).catch((err) => {
          console.log(err)
          setError(err.message) 
        });
    })
  }

  useEffect(function() {
    //setSettings(null)
    //console.log('ini searc',props.value)
    if (show) searchOptions(props.value).then(function(opts) {setOptions(opts)})
  },[show])
  
  //useEffect(function() {
    //setSettings(null)
  //},[show])
  
  
    
  function selectLink(link) {
      //console.log('select link ', link, props)
      props.onChange(link)
      handleClose()
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
      <Button style={{color:'black'}}  variant="danger" onClick={handleShow}>
        {props.triggerElement}
      </Button>

      <Modal show={show} onHide={handleClose}>
        
        <Modal.Header closeButton>
          <Modal.Title>Search YouTube </Modal.Title>
          
        </Modal.Header>
        <Modal.Body>
          <input type='text' value={filter} onChange={filterChange}  onBlur={function() {props.setBlockKeyboardShortcuts(false)}} onFocus={function() {props.setBlockKeyboardShortcuts(true)}}   />
        </Modal.Body>
        <Modal.Footer>
          {(error && error.length > 0) && <b>{error}</b>} 
          <ListGroup  style={{clear:'both', width: '100%'}}>
            {Object.keys(options).map(function(option,tk) {
              return <ListGroup.Item  key={tk} className={(tk%2 === 0) ? 'even': 'odd'}  >
              <Button style={{float:'right'}}  onClick={function(e) {selectLink(options[option])}} variant="success" >Select</Button>
              <div style={{fontWeight:'bold', fontSize:'1.1em'}} >{options[option].title}</div>
              <img src={options[option].image} style={{maxWidth:'200px',maxHeight:'200px', float:'right'}} />
              <div>{options[option].description}</div>
              
              </ListGroup.Item>
            })}
          </ListGroup>
        </Modal.Footer>
        
        
      </Modal>
    </>
  );
}
export default YouTubeSearchModal
