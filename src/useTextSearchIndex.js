import {useState} from 'react'
import axios from 'axios'
import useUtils from './useUtils'
import useAbcTools from './useAbcTools'
import {
  compareSearchResults,
  LOCAL_SEARCH_DISPLAY_LIMIT,
  LOCAL_SEARCH_INTERNAL_LIMIT,
  scoreSearchResult,
  tokenizeSearchQuery,
} from './textSearchIndexUtils'

/** 
 * An static index of resource files (abc) is built with the software
 * These functions assist to load and search the index as well as load
 * resource files using index keys
 */
export default function useTextSearchIndex() {
  const [textSearchIndex, setTextSearchIndex] = useState({}) 
  var utils = useUtils()  
  var abcTools = useAbcTools()
  
  /** 
   * Load the text search index into memory
   */
  function loadTextSearchIndex(index, callback) {
    return new Promise(function(resolve,reject) {
      if (index.tokens && Object.keys(index.tokens).length > 0) {
        setTextSearchIndex(index)
        resolve(index)
      } else {
          // load the index from online
          var a=process.env.NODE_ENV === "development" ? 'http://localhost:4000/textsearch_index.json' : '/textsearch_index.json'
          axios.get(a).then(function(index) {
            setTextSearchIndex(index.data)
            resolve(index.data)
          }).catch(function(e) {
            console.log(["ERR",e])
          })
      }
    })
  }
  
  /** 
   * Search the resource index for text
   * Stopwords are removed from text
   * Results are returned sorted in order of relevance
   * Results reference resources by three part resourceId key
   * [<collectionId>-<fileId>-<tuneNumberInBook>]
   * @return [{ids:[resourceId,..],score:integer,matchedTokenCount,queryTokenCount,name:''}]
   */
  function searchIndex(text, callback) {
      if (text && text.trim()) {
          var parts = tokenizeSearchQuery(text, utils.stripCommonWords)
          if (parts.length === 0) {
            callback([])
            return
          }

          var matches = {}
          parts.forEach(function(part) {
            if (textSearchIndex && textSearchIndex.tokens && textSearchIndex.tokens.hasOwnProperty(part) && Array.isArray(textSearchIndex.tokens[part])) {
              textSearchIndex.tokens[part].forEach(function(matchItem) {
                if (!matches[matchItem]) {
                  matches[matchItem] = 0
                }
                matches[matchItem] = matches[matchItem] + 1
              })
            }
          })

          var allMatchIds = Object.keys(matches)
          var andMatchIds = allMatchIds.filter(function(matchId) {
            return matches[matchId] >= parts.length
          })
          var candidateIds = andMatchIds.length > 0 ? andMatchIds : allMatchIds

          var seen = {}
          candidateIds.forEach(function(matchId) {
            var name = utils.stripText(textSearchIndex.lookups[matchId])
            if (!name) return
            var lowerName = name.toLowerCase()
            if (!seen[lowerName]) {
              seen[lowerName] = {
                ids: [],
                indexTokenScore: 0,
              }
            }
            seen[lowerName].ids.push(matchId)
            seen[lowerName].indexTokenScore = Math.max(
              seen[lowerName].indexTokenScore,
              matches[matchId] || 0
            )
          })

          var final = Object.keys(seen).map(function(seenName) {
            var entry = seen[seenName]
            var scored = scoreSearchResult(text, seenName, entry.indexTokenScore, parts)
            return {
              ids: entry.ids,
              name: seenName,
              score: scored.score,
              matchedTokenCount: scored.matchedTokenCount,
              queryTokenCount: scored.queryTokenCount,
              tokenCoverage: scored.tokenCoverage,
            }
          })

          final.sort(compareSearchResults)

          if (parts.length > 1) {
            final = final.filter(function(result) {
              return result.matchedTokenCount > 0
                && (result.matchedTokenCount === parts.length || result.tokenCoverage >= 0.5)
            })
          }

          final = final.slice(0, LOCAL_SEARCH_INTERNAL_LIMIT)
          callback(final.slice(0, LOCAL_SEARCH_DISPLAY_LIMIT))
      } else {
          callback([])
      }
  }
  
  /** 
   * Load abc resource files given a list of text search index ids
   * Index ids are in three parts <collectionId>-<fileId>-<tuneNumberInBook>
   * The collectionId identifies the folder where the abc files are stored
   * The fileId is used to generate the file name to load
   * The tuneNumberInBook is the index of the tune within the loaded file
   * @return {} containing json representation of abc tune
   */
  function loadTuneTexts(tuneIds) {
    return new Promise(function(resolve,reject) {
      if (Array.isArray(tuneIds)) {
        var promises = []
        tuneIds.forEach(function(tuneId) {
          var tuneIdParts = tuneId.split("-")
          var collectionNumber = tuneIdParts[0]
          var fileNumber = tuneIdParts[1]
          // id in three parts [<collectionId>-<fileId>-<tuneNumberInBook>]
          var filePaths =  ['abcresources/folktunefinder/abc_tune_folktunefinder_','abcresources/thesession/abc_tune_thesession_','abcresources/jimsroots/abc_tune_jimsroots_','abcresources/misc/abc_tune_misc_','abcresources/norbeck/abc_tune_norbeck_','abcresources/folkinfo/abc_tune_folkinfo_']
          var fileExtensions = [".txt" , ".abc", ".abc", ".abc", ".abc", ".abc"] // corresponds to file paths above
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
        // for each of the loaded resources, extract the tunes and convert to json
        Promise.all(promises).then(function(extractData) {
            if (extractData.length > 0) {
                var s = extractData.map(function(bookTextAndKey) {
                    var bookText = bookTextAndKey[1].data
                    var tuneKey = bookTextAndKey[0]
                    var tunes = abcTools.abc2Tunebook(bookText)
                    if (Array.isArray(tunes) && tunes.length > tuneKey && tunes[tuneKey]) {
                      return abcTools.json2abc(tunes[tuneKey])
                    } 
                })
                resolve(s)
            }
        }).catch(function(e) {console.log(e); resolve()})
      }
    })  
  }
  
  return {textSearchIndex, setTextSearchIndex, loadTextSearchIndex, searchIndex, loadTuneTexts}
}
