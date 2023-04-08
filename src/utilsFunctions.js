import abcjs from "abcjs";
import * as localForage from "localforage";
import localforage from "localforage";
import { chordParserFactory, chordRendererFactory } from 'chord-symbol';


/**
 * Miscellaneous utility functions
 */    
export default function utilsFunctions(props) {

    /**
     * Convert a chord symbol to use sharps or flats appropriate to the 
     * key signature
     */
    function canonicalChordForKey(key,chord) {
        var letters=['A','B','C','D','E','F','G']
        var keyLetter = (chord && chord.length > 0 && chord[0].toUpperCase)  ? chord[0].toUpperCase() : ''
        if (!keyLetter) return ''
        var modifierLetter =(chord.length > 1 && (chord[1] === 'b' || chord[1] === '#')) ? chord[1] : ''
        //console.log('km',keyLetter,modifierLetter, key, showFlats(key))
        if (showFlats(key)) {
            //console.log('showfloat')
            if (modifierLetter == '#') {
                var letterIndex = letters.indexOf(keyLetter)
                if (letterIndex !== -1) { 
                    var useLetterIndex = letterIndex + 1
                    if (useLetterIndex >= letters.length) useLetterIndex = useLetterIndex - letters.length
                    //console.log('km2',letters.length, letterIndex, (letterIndex + 1)%letters.length, useLetterIndex)
                    keyLetter = letters[useLetterIndex]
                    //console.log('km2t',keyLetter, letters.length, letterIndex, (letterIndex + 1)%letters.length)
                    modifierLetter = "b"
                }
            }
        } else {
            //console.log('showsharp')
            if (modifierLetter == 'b') {
                var letterIndex = letters.indexOf(keyLetter)
                if (letterIndex !== -1) { 
                    var useLetterIndex = letterIndex - 1
                    if (useLetterIndex < 0) useLetterIndex = useLetterIndex + letters.length
                    //console.log('km3',letters.length, letterIndex, (letterIndex + 1)%letters.length, useLetterIndex)
                    keyLetter = letters[useLetterIndex]
                    //console.log('km3t',keyLetter, letters.length, letterIndex, (letterIndex + 1)%letters.length)
                    modifierLetter = "#"
                }
            }
        }
        if (modifierLetter.length > 0) {
            return keyLetter + modifierLetter + chord.slice(2)
        } else {
            return keyLetter + chord.slice(1)
        }
    }

    /**
     * Given a key signature, return a boolean indicating whether the key
     * uses sharps(false) or flats(true)
     */
    function showFlats(key) {
        var keyMap = {
            "A": false, "A#": true, "Ab": true, 
            "B": false, "B#": false, "Bb": true, 
            "C": false, "C#": true, "Cb": false, 
            "D": false, "D#": true, "Db": true, 
            "E": false, "E#": true, "Eb": true, 
            "F": true, "F#": false, "Fb": false, 
            "G": false, "G#": true, "Gb": true
        }
        var keyLetter =''
        var modifierLetter =''
        if (key && key.length > 1) {
            if (key[1] == 'b' || key[1] == '#') {
                keyLetter = key[0].toUpperCase() 
                modifierLetter = key[1]
            } else {
                keyLetter = key[0].toUpperCase() 
            }
        } else if (key && key.length > 0) {
            keyLetter = key[0].toUpperCase() 
        } else {
            return false
        }
        return keyMap[keyLetter + modifierLetter]
    }

    /**
     * Strip stop words from text
     */
    function stripCommonWords(text) {
        text = text.trim().replace(/[^a-zA-Z0-9 ]/g, ' ').trim()
        var commonWords={"a":true,"also":true,"am":true,"an":true,"and":true,"any":true,"are":true,"as":true,"at":true,"be":true,"became":true,"become":true,"but":true,"by":true,"can":true,"could":true,"did":true,"do":true,"does":true,"each":true,"either":true,"else":true,"for":true,"had":true,"has":true,"have":true,"how":true,"i":true,"if":true,"in":true,"is":true,"it":true,"its":true,"me":true,"must":true,"my":true,"nor":true,"not":true,"of":true,"oh":true,"ok":true,"the":true,"who":true,"whom":true,"will":true,"with":true,"within":true,"without":true,"would":true,"yes":true,"yet":true,"you":true,"your":true}
        var final = text.split(' ').filter(function(word) {return  (!commonWords.hasOwnProperty(word)) }).join(' ')
        return final
    }

/**
     *  Load a local storage key and parse it as JSON 
     *  @return {}
     */
    function loadLocalObject(localStorageKey) {
      var dataText = localStorage.getItem(localStorageKey)
      var data = {}
      try {
        data = JSON.parse(dataText)
      } catch (e) {
        
      }
      if (!data) {
        data = {}
      }
      return data
    }

    /**
     * JSONify and save data to local storage
     */
    function saveLocalObject(localStorageKey, data) {
        localStorage.setItem(localStorageKey,JSON.stringify(data))
    }

    /**
     *  Load a local storage key and parse it as JSON 
     *  @return {}
     */
    function loadLocalforageObject(localStorageKey) {
        return new Promise(function(resolve,reject) {
            localforage.getItem(localStorageKey).then(function(item) {
                if (item) {
                    resolve(item)
                } else {
                    resolve({})
                }
            })
        })
    }


    /**
     * JSONify and save data to local storage
     */
    function saveLocalforageObject(localStorageKey, data) {
        return localforage.setItem(localStorageKey,data)
    }
    
    function toSearchText(text) {
      return text ? text.toLowerCase().trim() : ''
    }
    
    /**
     * Strip everything but letters and number from a string
     */
    function stripText(text) {
      var result = ''
      if (text && text.trim) {
          result = text.trim().replace(/[^a-zA-Z0-9 ]/g, ' ').trim()
      }
     return result
    }
    
    /** 
     * Scroll to an element identified by DOM id
     */    
    function scrollTo(id, offset) {
        var element = document.getElementById(id);
        if (element) {
          var headerOffset = offset ? offset : 10;
          var elementPosition = element.offsetTop;
          var offsetPosition = elementPosition - headerOffset;
          document.documentElement.scrollTop = offsetPosition;
          document.body.scrollTop = offsetPosition; // For Safari
        }
    }

    /**
     * Generate a new random object id
     */
    function generateObjectId(otherId) {
        var timestamp = otherId ? otherId.toString(16) : (new Date().getTime() / 1000 | 0).toString(16);
        
        return timestamp + 'xxxxxxxxxxxxxxxx'.replace(/[x]/g, function() {
            return (Math.random() * 16 | 0).toString(16);
        }).toLowerCase();
    }
    
    /**
     * Generate a hash for a string
     */
    const hash = function(str, seed = 0) {
      //cyrb53 
        let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
        for (let i = 0, ch; i < str.length; i++) {
            ch = str.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1>>>16), 2246822507) ^ Math.imul(h2 ^ (h2>>>13), 3266489909);
        h2 = Math.imul(h2 ^ (h2>>>16), 2246822507) ^ Math.imul(h1 ^ (h1>>>13), 3266489909);
        return 4294967296 * (2097151 & h2) + (h1>>>0);
    };

  
    /**
    * Get the next integer
    * If the integer is larger than max, return the result % max
    */  
    function nextNumber(current, max) {
        var val = current > 0 ? parseInt(current) + 1 : 1
        if (max > 0) val = val % max
        return val
    }

    /**
    * Get the previous integer
    * If the integer is less than 0, return the result % max
    */ 
    function previousNumber(current, max) {
        if (current == 0) return (max - 1)
        else return (current > 0 ? parseInt(current) - 1 : 0)
    }

    /**
    * Trigger a browser to download text as filename
    */
    function download(filename, text) {
      var element = document.createElement('a');
      element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
      element.setAttribute('download', filename);
      element.style.display = 'none';
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    }

    /**
    * Copy text from the clipboard
    */  
    function copyText(text) {
        const cb = navigator.clipboard;
        cb.writeText(text).then(function() {
            alert('Copied!')
        }).catch(function(e) {
            console.log(e)
        });
    }  

    /**
     * Remove all duplicates from an array
     */ 
    function uniquifyArray(a) {
        if (Array.isArray(a)) {
            var index = {}
            a.map(function(value) {
                index[value] = true 
                return null
            })
            return Object.keys(index)
        } else {
            return []
        }
    } 
    
    /**
     * Clear everything in the audio cache (of files generated from abc notation)
     */
    function resetAudioCache() {
      
      var store = localForage.createInstance({
          name: "abcaudiocache"
      });     
      store.clear().then(function() {
      }).catch(function(err) {
          console.log(err);
      }); 
    }
    
    /**
     * Get the id of a youtube video resource from a URL
     */
    function YouTubeGetID(url){
            url = url.split(/(vi\/|v%3D|v=|\/v\/|youtu\.be\/|\/embed\/)/);
            return undefined !== url[2]?url[2].split(/[^0-9a-z_\-]/i)[0]:url[0];
    }
    function isYoutubeLink(urlToParse){
        if (urlToParse) {
            var regExp = /^(?:https?:\/\/)?(?:m\.|www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})(?:\S+)?$/;
            if (urlToParse.match(regExp)) {
                return true;
            }
        }
        return false;
    }
    
    /** 
     * Remove quoted("") sections from a string
     */  
    function removeQuotedSections(str) {
        var flag = false
        var newStr = ""
        for (let i = 0; i < str.length; i++){
          if(str[i] == '"') flag = !flag
          if(!flag && str[i]!='"') newStr += str[i]
        }
        return newStr
    }
    
    /** 
     * Remove square bracked sections from a string
     */
    function removeSquareBracketedSections(str) {
        var flag = false
        var newStr = ""
        for (let i = 0; i < str.length; i++){
          if(str[i] == '[') flag = true
          if(str[i] == ']') flag = false
          if(!flag && str[i]!='[' && str[i]!=']') newStr += str[i]
        }
        return newStr
    }
     
          
    return {loadLocalObject, saveLocalObject,loadLocalforageObject, saveLocalforageObject, toSearchText, scrollTo, generateObjectId, hash, nextNumber, previousNumber, download, copyText, uniquifyArray, stripText, stripCommonWords, resetAudioCache, isYoutubeLink, YouTubeGetID, removeQuotedSections, removeSquareBracketedSections, canonicalChordForKey}
    
}
