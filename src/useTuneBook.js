import React from 'react'
import {useState, useEffect} from 'react'
import axios from 'axios'
import useUtils from './useUtils'
import useAbcTools from './useAbcTools'
import useIndexes from './useIndexes'
import {icons} from './Icons'


var useTuneBook = ({currentTune, setCurrentTune}) => {
  const utils = useUtils()
  const abcTools = useAbcTools()
  const indexes = useIndexes()
  // from old data
  var dbTunes = {}
  //indexes.resetBookIndex()
  //var tunesFrom = Object.values(utils.loadLocalObject('abc2book_tunes')).map(function(tune) {
    //tune.id = utils.generateObjectId()
    //indexes.indexTune(tune)
    //dbTunes[tune.id] = tune
  //})
  
  const [textSearchIndex, setTextSearchIndex] = useState({}) 
  function getTextSearchIndex(index, callback) {
    if (index.tokens && Object.keys(index.tokens).length > 0) {
      callback(index)
    } else {
      // load the index from online
        axios.get('/textsearch_index.json').then(function(index) {
          if (callback) callback(index.data)
        }).catch(function(e) {
          console.log(["ERR",e])
        })
        
    }
  }
  useEffect(function() {
    getTextSearchIndex(textSearchIndex, function(loadedIndex) { setTextSearchIndex(loadedIndex)})
  },[])
   
  var tunesFrom = {}
  try {
    tunesFrom = JSON.parse(localStorage.getItem('bookstorage_tunes'))
  } catch (e) {}
  
  const [tunes, setTunesInner] = React.useState(tunesFrom ? tunesFrom : dbTunes);
  function setTunes(val) {
    setTunesInner(val)
    localStorage.setItem('bookstorage_tunes', JSON.stringify(val))
  }
  //setTunes(tunes)
  //const [currentTune, setCurrentTuneInner] = React.useState(localStorage.getItem('book_current_tune') ? localStorage.getItem('book_current_tune') : 0);
  //function setCurrentTune(val) {
    //setCurrentTuneBookInner(val)
    //localStorage.setItem('book_current_tune', val)
  //}
  

  
  const [tempo, setTempoInner] = React.useState(localStorage.getItem('bookstorage_tempo') ? localStorage.getItem('bookstorage_tempo') : '')
  function setTempo(val) {
    setTempoInner(val)
    localStorage.setItem('bookstorage_tempo', val)
  }
  
  function saveTune(tune) {
    if (tune) {
      if (!tune.id) tune.id = utils.generateObjectId()
      tunes[tune.id] = tune
      indexes.indexTune(tune)
      setTunes(tunes)
      console.log('saved and indexed tune', tune.id, tune)
    }
    return tune
  }
  

  
  /** 
   * import songs to a tunebook from an abc file 
   */
  function importAbc(abc) {
      
  }
  

  return { tunes, setTunes, tempo, setTempo, currentTune, setCurrentTune,   saveTune, utils, abcTools, icons, indexes, textSearchIndex};
}
export default useTuneBook
