import {useState} from 'react'
import axios from 'axios'
import useUtils from './useUtils'
import useAbcTools from './useAbcTools'

export default function useTextSearchIndex() {
  const [textSearchIndex, setTextSearchIndex] = useState({}) 
  var utils = useUtils()  
  var abcTools = useAbcTools()
  
  function loadTextSearchIndex(index, callback) {
    return new Promise(function(resolve,reject) {
      if (index.tokens && Object.keys(index.tokens).length > 0) {
        setTextSearchIndex(index)
        resolve(index)
      } else {
        // load the index from online
          var a=process.env.NODE_ENV === "development" ? 'http://localhost:4000/textsearch_index.json' : '/textsearch_index.json'
          axios.get(a).then(function(index) {
            //console.log('got index',index)
            setTextSearchIndex(index.data)
            resolve(index.data)
          }).catch(function(e) {
            console.log(["ERR",e])
          })
          
      }
    })
  }
  
  function searchIndex(text, callback) {
      //console.log('sesarch index',text,textSearchIndex)
    
      var matches = {}
      var cleanText = utils.stripText(text).toLowerCase()
      var parts = cleanText.split(" ")
      //console.log('sesarch tokens',parts)
      parts.forEach(function(part) {
        //console.log('sesarch tokens P',part, index.tokens)
        if (textSearchIndex && textSearchIndex.tokens && textSearchIndex.tokens.hasOwnProperty(part) && Array.isArray(textSearchIndex.tokens[part])) {
          textSearchIndex.tokens[part].forEach(function(matchItem) {
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
        return {id: match, score: matches[match], name: utils.stripText(textSearchIndex.lookups[match])}
      })
      var seen = {}
      var final = []
      fullMatches.forEach(function(a) {
        var lowerName = a.name.toLowerCase()
        if (!seen[lowerName]) seen[lowerName] = {ids:[]}
        seen[lowerName].ids.push(a.id)
        var score = 0
        parts.forEach(function(part) {
              if (lowerName.indexOf(part.toLowerCase()) !== -1) {  
                score = score + 1
              }
          })
         seen[lowerName].score = score
        
      })
      Object.keys(seen).forEach(function(seenName) {
        final.push({ids: seen[seenName].ids, score: seen[seenName].score, name: seenName})
      })
      final.sort(function(a,b) {
          //console.log('SC check',a,b) 
          //var scoreA = 0
          //var scoreB = 0
          //parts.forEach(function(part) {
              //console.log('SC check', part, "AA",a.name, "BB",b.name, a.name.indexOf(part)) 
              //if (a.name.indexOf(part) !== -1) {  
                //scoreA = scoreA + 1
                //console.log('Sc bosot a')
              //}
              //if (b.name.indexOf(part) !== -1) {  
                  //scoreB = scoreB + 1
                  //console.log('Sc bosot b')
              //}
          //})
            //console.log('SC', parts, a.name, b.name, scoreA , scoreB)  
            if (a.score < b.score) {
              return -1
            } else {
              return 1
            }
      })
      final = final.slice(0,200)
      final.sort(function(a,b) {
          if (a && b && a.score === b.score) {
              if (a && b && a.name < b.name) {
                  return -1
              } else {
                  return 1
              }
          } else if (a && b && a.score && b.score && a.score < b.score) {
              return 1
          } else {
              return -1
              //return (a && b && a.ids && b.ids && a.name < b.name) ? -1 : 1
          }
      })  
       //console.log('TEXTSEARCH full matches', matches, final)
      callback(final)
    
  }
  
  function loadTuneTexts(tuneIds) {
    return new Promise(function(resolve,reject) {
      if (Array.isArray(tuneIds)) {
        var promises = []
        tuneIds.forEach(function(tuneId) {
          var tuneIdParts = tuneId.split("-")
          var collectionNumber = tuneIdParts[0]
          var fileNumber = tuneIdParts[1]
          // id in three parts [<collectionId>-<fileId>-<tuneNumberInBook>]
          var filePaths =  ['abcresources/folktunefinder/abc_tune_folktunefinder_','abcresources/thesession/abc_tune_thesession_','abcresources/jimsroots/abc_tune_jimsroots_','abcresources/misc/abc_tune_misc_','abcresources/norbeck/abc_tune_norbeck_']
          var fileExtensions = [".txt" , ".abc", ".abc", ".abc", ".abc"]
          console.log(tuneIdParts, "C",filePaths.length ,collectionNumber,filePaths[collectionNumber])
          if (filePaths.length >= parseInt(collectionNumber) && filePaths[collectionNumber]) {
              var filePath = filePaths[collectionNumber]
              var tuneNumber = tuneIdParts[2]
              var a=process.env.NODE_ENV === "development" ? 'http://localhost:4000/' : ''
              var p = a + filePath+fileNumber+fileExtensions[collectionNumber]
              promises.push(new Promise(function(resolve,reject) {
                  console.log(p)
                  axios.get(p).then(function(results) {
                      resolve([tuneNumber,results])
                  })
              }))
          }
        })
        var tune = null
        Promise.all(promises).then(function(extractData) {
            console.log(extractData)
            if (extractData.length > 0) {
                var s = extractData.map(function(bookTextAndKey) {
                    var bookText = bookTextAndKey[1].data
                    var tuneKey = bookTextAndKey[0]
                    var tunes = abcTools.abc2Tunebook(bookText)
                    if (Array.isArray(tunes) && tunes.length > tuneKey && tunes[tuneKey]) {
                      return abcTools.json2abc(tunes[tuneKey])
                    } 
                    
                })
                console.log(s)
                resolve(s)
            }
         
        }).catch(function(e) {console.log(e); resolve()})
      }
    })  
  }
  
  return {textSearchIndex, setTextSearchIndex, loadTextSearchIndex, searchIndex, loadTuneTexts}
}
