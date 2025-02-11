import abcjs from "abcjs";
import * as localForage from "localforage";
import localforage from "localforage";
import { chordParserFactory, chordRendererFactory } from 'chord-symbol';
import {unzip} from 'unzipit';


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
        //console.log('scrollto ',id,offset, element)
        if (element) {
          var headerOffset = offset ? offset : 10;
          var elementPosition = element.offsetTop;
          var offsetPosition = elementPosition - headerOffset;
          //console.log('DO scrollto ',offsetPosition)
          setTimeout(function() {
			document.documentElement.scrollTop = offsetPosition;
			document.body.scrollTop = offsetPosition; // For Safari
		  }, 300)
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
    
    
    function loadFileFromUrl(url) {
        return new Promise(function(resolve,reject) {
            const xhr = new XMLHttpRequest();
            xhr.onreadystatechange = function() {
              if (this.readyState === 4 && this.status === 200) {
                resolve(xhr.response)
              }
            };
            xhr.open('GET', url, true);
            xhr.responseType = 'arraybuffer';
            xhr.send();
        })
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
    
      function onFileSelectedToBase64 (event, callback) {
		function readFile(file){
          var reader = new FileReader();
          reader.onloadend = function(){
            // skip empty files
            if (reader.result.trim().length > 0) {
              callback(reader.result)
            }
          }
          if(file){
              reader.readAsDataURL(file);
          }
      }
      readFile(event.target.files[0])
  }
    
    function dataURItoBlob(dataURI, mime = 'image/jpeg') {
		var binary = null
		try {
			binary = atob(dataURI.split(',')[1]);
			var array = [];
			for(var i = 0; i < binary.length; i++) {
				array.push(binary.charCodeAt(i));
			}
			return new Blob([new Uint8Array(array)], {type: mime});
		} catch (e) {
			console.log(e)
			return new Blob([], {type: mime});
		}
		
	}

	function blobToBase64(blob) {
		return new Promise(function(resolve,reject) {
			var reader = new FileReader();
			reader.onload = function() {
				var dataUrl = reader.result;
				//var base64 = dataUrl.split(',')[1];
				resolve(dataUrl);
			};
			if (blob instanceof Blob) {
				reader.readAsDataURL(blob);
			} else {
				resolve()
			}
		})
	};
     
    function blobToText(blob) {
	  return new Promise((resolve, reject) => {
		var reader = new FileReader();

		reader.onload = function() {
		  resolve(reader.result);
		};

		reader.onerror = function() {
		  reject(new Error('Error reading the Blob as text.'));
		};

		// Read the Blob as text
		if (blob instanceof Blob) {
			reader.readAsText(blob);
		} else {
			resolve()
		}
	  });
	}
    
    
	function readFileAsBase64(f) {
		return new Promise(function(resolve,reject) {
			function readFile(file){
				var reader = new FileReader();
				reader.onloadend = function(){
					// skip empty files
					if (reader.result) {
					  resolve(reader.result) //[file,reader.result])
					}
				  }
				  if(file){
					  reader.readAsDataURL(file);
				  }
			  }
			readFile(f)
		})
	}
	
	function readFileAsArrayBuffer(f) {
		//console.log('readfile2blb s',f)
		return new Promise(function(resolve,reject) {
			function readFile(file){
				//console.log('readfile2blb',file)
				var reader = new FileReader();
				reader.onloadend = function(){
					//console.log('readfile2blb loaded',reader.result)
					// skip empty files
					if (reader.result) {
					  resolve(reader.result)
					}
				  }
				  if(file){
					  reader.readAsArrayBuffer(file);
				  }
			  }
			readFile(f)
		})
	}
    
	function readFileAsText(f) {
		//console.log('readfile2blb s',f)
		return new Promise(function(resolve,reject) {
			function readFile(file){
				//console.log('readfile2blb',file)
				var reader = new FileReader();
				reader.onloadend = function(){
					//console.log('readfile2blb loaded',reader.result)
					// skip empty files
					if (reader.result) {
					  resolve(reader.result)
					}
				  }
				  if(file){
					  reader.readAsText(file);
				  }
			  }
			readFile(f)
		})
	}
	async function unzipBlob(url) {
		const {entries} = await unzip(url);
		return entries
	  //// print all entries and their sizes
	  //for (const [name, entry] of Object.entries(entries)) {
		//console.log(name, entry.size);
	  //}

	  //// read an entry as an ArrayBuffer
	  //const arrayBuffer = await entries['path/to/file'].arrayBuffer();

	  //// read an entry as a blob and tag it with mime type 'image/png'
	  //const blob = await entries['path/to/otherFile'].blob('image/png');
	}
          
    return {onFileSelectedToBase64, unzipBlob, blobToText, blobToBase64, dataURItoBlob, loadLocalObject, saveLocalObject,loadLocalforageObject, saveLocalforageObject, toSearchText, scrollTo, generateObjectId, hash, nextNumber, previousNumber, download, copyText, uniquifyArray, stripText, stripCommonWords, resetAudioCache, isYoutubeLink, YouTubeGetID, removeQuotedSections, removeSquareBracketedSections, canonicalChordForKey, loadFileFromUrl, readFileAsBase64, readFileAsArrayBuffer, readFileAsText}
    
}
