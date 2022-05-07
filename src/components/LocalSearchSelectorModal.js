import {useState, useEffect} from 'react'
import {Button, Modal, ListGroup} from 'react-bootstrap'
import Abc from './Abc'
import axios from 'axios'        
   
function LocalSearchSelectorModal(props) {
  const [show, setShow] = useState(false);
  const [filter, setFilter] = useState(props.value);
  const [options, setOptions] = useState(defaultOptions());
  const handleClose = () => setShow(false);
  const handleShow = (e) => setShow(true);
  const [settings, setSettings] = useState(null)
   
  function defaultOptions() {return {}}
  
  function searchOptions(text, callback) {
    searchIndex(text,function(searchRes) {
      var final = {}
      if (Array.isArray(searchRes)) {
        searchRes.forEach(function(result)  {
          final[result.ids.join(",")] = result.name
        })
      }
      //console.log('sesarch index',text,final)
      callback(final)
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
    console.log('select setting ', setting)
    var tune = props.tunebook.abcTools.abc2json(setting)
    tune.id = props.currentTune.id
    props.tunebook.saveTune(tune)
    //props.forceRefresh()
  }
  
  function selectTune(key,value) {
    console.log('select tune ',key,value)
    return new Promise(function(resolve,reject) {
      var tuneIds = key.split(",")
      var promises = []
      console.log('select tune ',tuneIds)
      if (Array.isArray(tuneIds)) {
        tuneIds.forEach(function(tuneId) {
          var a=process.env.NODE_ENV === "development" ? 'http://localhost:4000/' : ''
          var p = a + 'scrape/folktunefinder/abc_tune_folktunefinder_'+tuneId+'.txt'
          promises.push(axios.get(p))
        })
        var tune = null
        Promise.all(promises).then(function(abcTexts) {
          if (abcTexts.length > 0) {
            var s = abcTexts.map(function(text) {
              //var tune = props.tunebook.abcTools.abc2json(text.data)
              //return {key: props.tunebook.abcTools.settingFromTune(tune).key, abc: props.tunebook.abcTools.settingFromTune(tune).abc}
              return text && text.data ? text.data : ''
            })
            //console.log('UPABC loaded all',abcTexts,s)
            
            setSettings(s)
          }
          //if (abcTexts.length  > 0 && window.confirm('Do you really want to replace this tune with information from the collection ?'))  {
            //var settings = abcTexts.map(function(text) {
              //var fullSetting = props.tunebook.abcTools.abc2json(text)
              
              //return {key:'', abc:''}
            //})
            //var tune = {name: value, settings: settings, useSetting: 0}
            //resolve()
            
          //}
        }).catch(function(e) {console.log(e); resolve()})
      }
      
      
      
      //axios.get('https://thesession.org/tunes/'+tuneId+'?format=json&perpage=50').then(function(searchRes) {
        //console.log('res',searchRes)
        //var final = {}
        //if (searchRes && searchRes.data) {
          //if (window.confirm('Do you really want to replace this tune with information from thesession.org ?')) {
            //var newTune = searchRes.data
            //newTune.id = props.currentTune.id
            //newTune = props.tunebook.saveTune(newTune)
            //props.forceRefresh()
            //handleClose()
            ////navigate('/edit/'+newTune.id)
          //}
        //}
        //resolve(final)
      //})
    })
  }
  
  

  function stripText(text) {
      var result = ''
      if (text && text.trim) {
          result = text.trim().replace(/[^a-zA-Z0-9 ]/g, ' ').toLowerCase().trim()
      }
     return result
  }

  function searchIndex(text, callback) {
    //console.log('sesarch index',text, props.tunebook)
    
      //console.log('sesarch index loaded',index)
      var matches = {}
      var cleanText = stripText(text)
      var parts = cleanText.split(" ")
      //console.log('sesarch tokens',parts)
      parts.forEach(function(part) {
        //console.log('sesarch tokens P',part, index.tokens)
        if (props.tunebook.textSearchIndex && props.tunebook.textSearchIndex.tokens && props.tunebook.textSearchIndex.tokens.hasOwnProperty(part) && Array.isArray(props.tunebook.textSearchIndex.tokens[part])) {
          props.tunebook.textSearchIndex.tokens[part].forEach(function(matchItem) {
            //console.log('handlepart',part,matchItem,matches,matches[matchItem])
            if (matches[matchItem] > 0) {
              matches[matchItem] = matches[matchItem] + 1
            } else {
              matches[matchItem] = 1
            }
          })
        }
      })
      var fullMatches = Object.keys(matches).map(function(match) {
        return {id: match, score: matches[match], name: props.tunebook.textSearchIndex.lookups[match]}
      }).sort(function(a,b) {
        if (a.score < b.score) {
          return 1
        } else {
          return -1
        }
      })
      var seen = {}
      var final = []
      fullMatches.forEach(function(a) {
        var lowerName = a.name.toLowerCase()
        if (!seen[lowerName]) seen[lowerName] = {ids:[]}
        seen[lowerName].ids.push(a.id)
      })
      Object.keys(seen).forEach(function(seenName) {
        final.push({ids: seen[seenName].ids, name: seenName})
      })
      //final.push()
          
      //console.log('full matches', matches, final)
      callback(final.slice(0,30))
    
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
          {settings.map(function(setting) {
            return <div>
              <Button  style={{float:'right'}} onClick={function(e) {
                if (window.confirm('Do you really want to replace this tune with information from the collection?')) {
                  selectSetting(setting); 
                }
                setShow(false)
              }} > Select</Button>
              <Abc abc={setting} />
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
          <input type='text' value={filter} onChange={filterChange}   style={{width:'50%'}} />
         </Modal.Body>
        <Modal.Footer>
          <ListGroup  style={{clear:'both', width: '100%'}}>
            {Object.keys(options).map(function(option,tk) {
              return <ListGroup.Item  key={tk} className={(tk%2 === 0) ? 'even': 'odd'} onClick={function(e) {selectTune(option,options[option])}} >{options[option]}</ListGroup.Item>
            })}
          </ListGroup>
           
        </Modal.Footer>
        </>}
      </Modal>
    </>
  );
}
export default LocalSearchSelectorModal
