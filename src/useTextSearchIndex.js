import {useState} from 'react'
import axios from 'axios'

export default function useTextSearchIndex() {
  const [textSearchIndex, setTextSearchIndex] = useState({}) 
  
  function loadTextSearchIndex(index, callback) {
    return new Promise(function(resolve,reject) {
      if (index.tokens && Object.keys(index.tokens).length > 0) {
        setTextSearchIndex(index)
        resolve(index)
      } else {
        // load the index from online
          var a=process.env.NODE_ENV === "development" ? 'http://localhost:4000/textsearch_index.json' : '/textsearch_index.json'
          axios.get(a).then(function(index) {
            console.log('got index',index)
            setTextSearchIndex(index.data)
            resolve(index.data)
          }).catch(function(e) {
            console.log(["ERR",e])
          })
          
      }
    })
  }
  return {textSearchIndex, setTextSearchIndex, loadTextSearchIndex}
}
