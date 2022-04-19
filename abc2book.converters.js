
/**
 * Append metadata for song title,.. to abc string
 * for rendering complete tunes
 * @return multiline abc string starting with \nX:<tuneid>\n suitable for tune book 
 */
function json2abc(songNumber, tune) { //abc, songNumber, name, forceTitle, key, type, aliases) {
  //console.log('json2abc',tune)
  if (tune) {
    var abc = ''
    var setting = {}
    if (tune.settings && tune.settings.length > tune.useSetting) {
      //abc = getNotesFromAbc(tune)
      setting = tune.settings[tune.useSetting]
      abc = setting ? setting.abc : ''
    }
    //console.log('json2abc',tune,getTuneName(tune))
    //if (!abc) {
      //abc = ''
    //}
    //var titleText = getTextFromSongline(tune.forceTitle)
    //const capitalize = (str, lower = false) =>
    //(lower ? str.toLowerCase() : str).replace(/(?:^|\s|["'([{])+\S/g, match => match.toUpperCase());
  //;
    //var useName = capitalize(getTuneName(tune),true)
    //var titleText = useName
    //titleText && titleText.trim().length > 0 ? capitalize(titleText,true) : capitalize(tune.name,true)
    var aliasText = ''
    //if (tune.forceTitle && tune.forceTitle.trim().length > 0) {
      //aliasText += 'N: Primary name on thesession.org : ' + tune.name +"\n"
    //}
    //if (setting.key) aliasText = 'N: Key ' +setting.key.slice(0,1) + " " + setting.key.slice(1) + "\n"
       
    if (Array.isArray(tune.aliases) && tune.aliases.length > 0) {
       var aliasChunks = sliceIntoChunks(tune.aliases,5)
       aliasChunks.forEach(function(chunk) {
        aliasText += 'N: AKA: '  +chunk.join(", ")+"\n"
      })
    }
    
    // TODO
    var boost = tune.boost > 0 ? tune.boost : 0
    var tweaked = "\nX: "+songNumberForDisplay(songNumber) + "\n" 
                + "T: " + getTuneName(tune) + "\n" //songNumberForDisplay(songNumber) + ". "  + 
                + "M:"+getTuneMeter(tune)+ "\n" 
                + "L:" + getTuneNoteLength(tune) + "\n" 
                + "R: "+  getTuneType(tune) + "\n" 
                + renderOtherHeaders(tune)
                + aliasText 
                + "K:"+setting.key+ "\n" 
                + abc  + "\n" 
                // add song number to title
                +
                "% abc-sessionorg_id " + tune.id + "\n" + 
                "% abc-sessionorg_setting " + tune.useSetting + "\n" + 
                "% abc-sessionorg_setting_id " + setting.id + "\n" + 
                //"% abc-force_title " + tune.forceTitle + "\n" +
                "% abc-boost " +  boost + "\n" 
                + ensureText(tune.abccomments) + "\n"
    
    
    //console.log('ABC OUT', tune, songNumber, tweaked)
    return tweaked
  } else {
    return ''
  }
}


function renderOtherHeaders(tune) {
  if (tune && tune.meta) {
    return Object.keys(tune.meta).map(function(key) {
      // exclude required headers
      if (requiredHeaders.indexOf(key) === -1) {
        return tune.meta[key].split("\n").map(function(metaLine) {
          return key + ": "+metaLine + "\n"
        }).join("")
        //return key + ": "+tune.meta[key] + "\n"
      } else {
        return ''
      }
    }).join("")
  } else {
     return "" 
  }
}

function json2shortabc(songNumber, tune) { //abc, songTitle, forceTitle, keySig, tuneType, songNumber) {
  if (tune) {
    var abc = null
    var setting = {}
    if (tune.settings && tune.settings.length > tune.useSetting) {
      abc = tune.settings[tune.useSetting].abc
      setting = tune.settings[tune.useSetting]
    }
    if (!abc || !abc.trim) {
      return emptyABC(songNumber,getTuneName(tune), tune.forceTitle)
    }
    ////var titleText = getTextFromSongline(tune.forceTitle)
    //const capitalize = (str, lower = false) =>
    //(lower ? str.toLowerCase() : str).replace(/(?:^|\s|["'([{])+\S/g, match => match.toUpperCase());
  //;

    //var useName = capitalize(getTuneName(tune),true)
    //var titleText = useName
    //titleText && titleText.trim().length > 0 ? capitalize(titleText,true) : capitalize(tune.name,true)
    
      abc = abc.trim()
      // remove strings from abc
      var next = abc.indexOf('"')
      while (next !== -1) {
        nextClose = abc.indexOf('"', next+1)
        if ((nextClose !== -1) && (nextClose > next)) {
          abc = abc.slice(0,next) + abc.slice(nextClose+1)
        } else {
          abc = abc.slice(0,next) + abc.slice(next + 1)
        }
        next = abc.indexOf('"')
      }
      // strip start repeats
      abc = abc.replace("|:","|")
      // first three bars
      var shortAbcParts = []
      shortAbcParts = abc.split("|").slice(0,4)
      var shortAbc = ''
      // handle placement of text(song title)
      if (shortAbcParts.length > 3) {
        // tune starts at first bar
        if (shortAbcParts[0].trim() === '') {
          var ts = getTuneMeter(tune)
          if (ts !== '') {
            shortAbc = shortAbc + "[M:"+ts+ "] "
          } 
          shortAbc = shortAbc + "[K:"+setting.key+ "] "
          // tune title 
          shortAbc = shortAbc  + '"' + songNumberForDisplay(songNumber) + '. '+getTuneName(tune)+ '"' +  shortAbcParts.slice(1).join("|") 
        // lead in note
        } else {
          var ts = getTuneMeter(tune)
          if (ts !== '') {
            shortAbc = shortAbc + "[M:"+ts+ "] "
          } 
          shortAbc = shortAbc + "[K:"+setting.key+ "] "
          shortAbc = shortAbc  + '"' + songNumberForDisplay(songNumber) + '. ' +getTuneName(tune)+ '"' +  shortAbcParts.join("|") 
        }
      }
      shortAbc = "\nX: "+songNumber + "\n" + shortAbc + "\n"
    
    
    return shortAbc
  } else {
    return ''
  }
   
}



function getTextFromSongline(songline) {
    if (!songline) return
    var last = songline.lastIndexOf(']')
    if (last !== -1) {
        return songline.slice(last + 1)
    } else {
        return songline
    }
}

function timeSignatureFromTuneType(type) {
  var types = {
    'jig': '6/8',
    'reel':  '4/4',
    'slip jig':  '9/8',
    'hornpipe':  '4/4',
    'polka':  '2/4',
    'slide':  '12/8',
    'waltz':  '3/4',
    'barndance':  '4/4',
    'strathspey':  '4/4',
    'three-two':  '3/2',
    'mazurka':  '3/4'
  }
  if (types.hasOwnProperty(type)) {
    return types[type]
  } else {
    return ''
  }
}

function emptyABC(number, name) {
  return "\nX:"+number+"\n" + 'T:' + (number + 1) +". "+name +  '' + "\n"
}

function songNumberForDisplay(songNumber) {
  if (parseInt(songNumber) > 0) {
    return  parseInt(songNumber) + 1
  }
  return 1
}

function stripText(text) {
  var result = ''
  if (text && text.trim) {
      result = text.trim().replace(/[^a-zA-Z0-9 ]/g, ' ').toLowerCase().trim()
  }
  return result
}


//module.exports = {songNumberForDisplay}
