
/**
 * Append metadata for song title,.. to abc string
 * for rendering complete tunes
 * @return multiline abc string starting with \nX:<tuneid>\n suitable for tune book 
 */
function json2abc(songNumber, tune) { //abc, songNumber, name, forceTitle, key, type, aliases) {
  
  if (tune) {
    var abc = ''
    var setting = {}
    if (tune.settings && tune.settings.length > tune.useSetting) {
      abc = getNotesFromAbc(tune.settings[tune.useSetting].abc)
      setting = tune.settings[tune.useSetting]
    }
    console.log('tweakabc',abc, tune, songNumber)
    //if (!abc) {
      //abc = ''
    //}
    //var titleText = getTextFromSongline(tune.forceTitle)
    const capitalize = (str, lower = false) =>
    (lower ? str.toLowerCase() : str).replace(/(?:^|\s|["'([{])+\S/g, match => match.toUpperCase());
  ;
    var useName = capitalize(tune.name,true)
    var titleText = useName
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
    var meter = (tune.meter && tune.meter.trim().length > 0) ? tune.meter : timeSignatureFromTuneType(tune.type)
    // TODO
    var boost = tune.boost > 0 ? tune.boost : 0
    var tweaked = "\nX: "+songNumber + "\n" 
                + "K:"+setting.key+ "\n" 
                + "M:"+meter+ "\n" 
                + "L:" + ((tune.noteLength && tune.noteLength.trim().length > 0) ? tune.noteLength : "1/8") + "\n" 
                + aliasText + abc  + " \n" + 
                "T: " + songNumberForDisplay(songNumber) + ". "  + useName + "\n" + 
                "S:" + (tune.source ? tune.source : '')  + "\n" +
                "R: "+  tune.type + "\n" 
                +
                "% abc-sessionorg_id " + tune.id + "\n" + 
                "% abc-sessionorg_setting " + tune.useSetting + "\n" + 
                "% abc-sessionorg_setting_id " + setting.id + "\n" + 
                "% abc-force_title " + tune.forceTitle + "\n" +
                "% abc-boost " +  boost + "\n" 
    
    
    console.log('tweakabc D',abc, tune, songNumber, tweaked)
    return tweaked
  } else {
    return ''
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
      return emptyABC(songNumber,tune.name, tune.forceTitle)
    }
    //var titleText = getTextFromSongline(tune.forceTitle)
    const capitalize = (str, lower = false) =>
    (lower ? str.toLowerCase() : str).replace(/(?:^|\s|["'([{])+\S/g, match => match.toUpperCase());
  ;

    var useName = capitalize(tune.name,true)
    var titleText = useName
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
          var ts = timeSignatureFromTuneType(tune.type)
          if (ts !== '') {
            shortAbc = shortAbc + "[M:"+ts+ "] "
          } 
          shortAbc = shortAbc + "[K:"+setting.key+ "] "
          // tune title 
          shortAbc = shortAbc  + '"' + songNumberForDisplay(songNumber) + '. '+useName+ '"' +  shortAbcParts.slice(1).join("|") 
        // lead in note
        } else {
          var ts = timeSignatureFromTuneType(tune.type)
          if (ts !== '') {
            shortAbc = shortAbc + "[M:"+ts+ "] "
          } 
          shortAbc = shortAbc + "[K:"+setting.key+ "] "
          shortAbc = shortAbc  + '"' + songNumberForDisplay(songNumber) + '. ' +useName+ '"' +  shortAbcParts.join("|") 
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
  return text ? text.trim().replace(/[^\w\s]/g,'').toLowerCase() : ''
}


//module.exports = {songNumberForDisplay}
