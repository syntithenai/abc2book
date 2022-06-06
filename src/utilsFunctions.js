import abcjs from "abcjs";
import * as localForage from "localforage";
 
export default function utilsFunctions(props) {

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
    
    function toSearchText(text) {
      return text ? text.toLowerCase().trim() : ''
    }
    
        
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

        
    function generateObjectId(otherId) {
        var timestamp = otherId ? otherId.toString(16) : (new Date().getTime() / 1000 | 0).toString(16);
        
        return timestamp + 'xxxxxxxxxxxxxxxx'.replace(/[x]/g, function() {
            return (Math.random() * 16 | 0).toString(16);
        }).toLowerCase();
    }
    
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


    function saveLastPlayed(tuneId) {
      var lastPlayeds =  {}
      try {
          lastPlayeds = JSON.parse(localStorage.getItem('bookstorage_lastplayed'))
      } catch (e) {}
      if (!lastPlayeds) lastPlayeds = {}
      lastPlayeds[tuneId] = new Date().getTime()
      localStorage.setItem('bookstorage_lastplayed',JSON.stringify(lastPlayeds))
    }
    
    function hasPlayedInLast24Hours(tuneId) {
      var lastPlayeds =  {}
      try {
          lastPlayeds = JSON.parse(localStorage.getItem('bookstorage_lastplayed'))
      } catch (e) {}
      
      var now = new Date().getTime()
      if (lastPlayeds && lastPlayeds[tuneId] && now - lastPlayeds[tuneId] < 86400000) {
        return true
      } else {
        return false
      }
    }
    
  function nextNumber(current, max) {
    var val = current > 0 ? parseInt(current) + 1 : 1
    if (max > 0) val = val % max
    return val
  }
  
  function previousNumber(current, max) {
    if (current == 0) return (max - 1)
    else return (current > 0 ? parseInt(current) - 1 : 0)
    
  }
  
  function download(filename, text) {
      var element = document.createElement('a');
      element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
      element.setAttribute('download', filename);

      element.style.display = 'none';
      document.body.appendChild(element);

      element.click();

      document.body.removeChild(element);
  }
    
  function copyText(text) {
      const cb = navigator.clipboard;
      cb.writeText(text).then(function() {
         alert('Copied!')
      }).catch(function(e) {
          console.log(e)
      });
  }  
     
    function uniquifyArray(a) {
        ////console.log(['UNIQARRAY',a])
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
    
    function stripText(text) {
        var result = ''
        if (text && text.trim) {
            result = text.trim().replace(/[^a-zA-Z0-9 ]/g, ' ').toLowerCase().trim()
        }
       return result
    }
    
    function resetAudioCache() {
      
      var store = localForage.createInstance({
          name: "abcaudiocache"
      });     

      store.clear().then(function() {
          // Run this code once the database has been entirely deleted.
          //console.log('Database is now empty.');
      }).catch(function(err) {
          // This code runs if there were any errors
          console.log(err);
      }); 
    }
    
    return {loadLocalObject, saveLocalObject, toSearchText, scrollTo, generateObjectId, hash, saveLastPlayed, hasPlayedInLast24Hours, nextNumber, previousNumber, download, copyText, uniquifyArray, stripText, resetAudioCache}
    
}
