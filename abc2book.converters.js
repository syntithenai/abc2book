
/**
 * Append metadata for song title,.. to abc string
 * for rendering complete tunes
 * @return multiline abc string starting with \nX:<tuneid>\n suitable for tune book 
 */
function tweakABC(songNumber, tune) { //abc, songNumber, name, forceTitle, key, type, aliases) {
  
  if (tune) {
    var abc = null
    var setting = {}
    if (tune.settings && tune.settings.length > tune.useSetting) {
      abc = tune.settings[tune.useSetting].abc
      setting = tune.settings[tune.useSetting]
    }
    //console.log('tweakabc',abc, tune, songNumber)
    if (!abc) {
      return emptyABC(songNumber,tune.name)
    }
    //var titleText = getTextFromSongline(tune.forceTitle)
    const capitalize = (str, lower = false) =>
    (lower ? str.toLowerCase() : str).replace(/(?:^|\s|["'([{])+\S/g, match => match.toUpperCase());
  ;
    var useName = capitalize(tune.name,true)
    var titleText = useName
    //titleText && titleText.trim().length > 0 ? capitalize(titleText,true) : capitalize(tune.name,true)
    var aliasText = ''
    if (tune.forceTitle && tune.forceTitle.trim().length > 0) {
      aliasText += 'N: Primary name on thesession.org : ' + tune.name +"\n"
    }
    if (setting.key) aliasText = 'N: Key ' +setting.key.slice(0,1) + " " + setting.key.slice(1) + "\n"
       
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
                + "K:"+setting.key+ "\n"+ 
                "M:"+meter+ "\n" + aliasText + abc  + " \n" + 
                "T: " + songNumberForDisplay(songNumber) + ". "  + useName + 
                "\nL:" + ((tune.noteLength && tune.noteLength.trim().length > 0) ? tune.noteLength : "1/8") + "\n" + 
                "S:" + (tune.source ? tune.source : '')  +
                " \nR: "+  tune.type + "\n" 
                +
                "% abc-sessionorg_id " + tune.id + "\n" + 
                "% abc-sessionorg_setting " + tune.useSetting + "\n" + 
                "% abc-sessionorg_setting_id " + setting.id + "\n" + 
                "% abc-force_title " + tune.forceTitle + "\n" +
                "% abc-boost " +  boost + "\n" 
    
    
    //console.log('tweakabc D',abc, tune, songNumber, tweaked)
    return tweaked
  } else {
    return ''
  }
}


function tweakShortABC(songNumber, tune) { //abc, songTitle, forceTitle, keySig, tuneType, songNumber) {
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


function abc2Tunebook(abc) {
  var parts = abc.split('X:')
  //console.log('2book',parts)
  var final = []
  var tuneBook = parts.forEach(function(v,k) {
    if (v && v.trim().length > 0) {
      final.push(abc2Tune('X:'+v))
    } 
  })
  //console.log('tuneBook',parts)
  return final
}

//window.abc2Tunebook = abc2Tunebook

function abc2Tune(abc) {
  if (abc && abc.trim().length > 0) {
    var id = getCommentFromAbc('sessionorg_id',abc)
    var setting = getCommentFromAbc('sessionorg_setting',abc)
    var settingId = getCommentFromAbc('sessionorg_setting_id',abc)
    var forceTitle = getCommentFromAbc('force_title',abc)
    var boost = getCommentFromAbc('boost',abc)
    var title = getMetaValueFromTune("T",abc)
    var meter = getMetaValueFromTune("M",abc)
    var noteLength = getMetaValueFromTune("L",abc)
    var source = getMetaValueFromTune("S",abc)
    var tParts = title.split(".")
    var name = tParts.length > 1 ? tParts[1].trim() : title
    var key = getMetaValueFromTune("K",abc) !== null ? getMetaValueFromTune("K",abc).trim() : ''
    var type = getMetaValueFromTune("R",abc) !== null ? getMetaValueFromTune("R",abc).trim() : ''
    var aliases = getAliasesFromAbc("abc")
    var tuneBook = new window.ABCJS.TuneBook(abc.trim())
    
    // TODO what do i need to do to tunebook object to make like below
    if (tuneBook.tunes && tuneBook.tunes.length > 0 && tuneBook.tunes[0]) { 
      var tunebookTune = tuneBook.tunes[0]
      var tune = {
          "format": "json",
          "perpage": "50",
          "name": name,
          "type": type,
          "aliases": aliases,
          "comments": [],
          "settings": [
              {
                  "key": key,
                  "abc": extractAbcMeta(tunebookTune.abc).cleanAbc,
                  "member": {
                  },
                  
              }
            ]
          }
      if (id) {
        tune.id = id
        tune.url = "https://thesession.org/tunes/"+id
        if (settingId) {
          tune.settings[0].id = settingId
          tune.settings[0].url = "https://thesession.org/tunes/"+id+"#setting"+settingId
        }
      }
      tune.meter =meter
      tune.noteLength = noteLength
      tune.source = source
      tune.id = id
      tune.useSetting = 0
      tune.forceTitle = forceTitle
      tune.boost = boost
      console.log('ABC2TUNE',tunebookTune,abc, tune)
      return tune
    }
  }
  return {}
}


function extractAbcMeta(abc) {
  var parts = abc.split("\n")
  var meta = {}
  var tune = []
  parts.map(function(part) {
    if (part[1] === ":" && part[0] !== "|" ) {
       meta[part[0]] = part.slice(2)
    } else {
      tune.push(part)
    }
  })
  meta.cleanAbc = tune.join("\n")
  return meta
  
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

function getMetaValueFromTune(key,abc) {
    try {
        var parts = abc.split("\n"+key+":")
        var isFirst = abc.indexOf(key + ":") === 0
        if (isFirst || parts.length > 1) {
            return parts[1].split("\n")[0]
        } else {
            return ''
        }
    } catch (e) {
        return ''
    }
}

function getCommentFromAbc(key,abc) {
    if (!abc) return
    var first = abc.indexOf('\n% abc-'+key)
    if (first !== -1) {
        var parts = abc.slice(first + 8 + key.length).split("\n")
        return parts[0]
    } else {
        return null
    }
}

function getAliasesFromAbc(abc) {
    if (!abc) return
    var aliases=[]
    var first = abc.indexOf('N: AKA:')
    while (first !== -1) {
        var parts = abc.slice(first + 7).split("\n")
        var aliasParts = parts[0].split(",")
        aliasParts.forEach(function(aliasPart) {
          aliases.push(aliasPart)
        })
        first = abc.indexOf('N: AKA:', first + 1)
    } 
    return aliases
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
