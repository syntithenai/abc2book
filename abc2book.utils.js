Number.prototype.mod = function (n) {
  return ((this % n) + n) % n;
};
 
function getTuneTitles() {
    var tunes = loadLocalObject('abc2book_tunes')
    var titles = tunes ? Object.values(tunes).map(function(tune) {return tune.name}) : []
    return titles.join("\n")    
} 

function getSearchTexts() {
    var tunes = $("#songlist").val().split("\n")
    var titles = tunes ? Object.values(tunes).map(function(tune) {return getTextFromSongline(tune)}) : []
    console.log(tunes,titles)
    return titles.join("\n")    
} 

function bindCopy(element,val) {
  console.log('bindcopy',element,val)
  element.click(function() {
    console.log('bindcopy click')
    const cb = navigator.clipboard;
    cb.writeText(val()).then(function() {
       alert('Copied!')
       
    }).catch(function(e) {
        console.log(e)
    });
  })
}
    
function removeAbcInnerStrings(abc) {
  if (abc) {
        // remove strings from abc
      abc = abc.trim()
      var next = abc.indexOf('"')
      while (next !== -1) {
        nextClose = abc.indexOf('"', next+1)
        if ((nextClose !== -1) && (nextClose > next)) {
          // strip string
          abc = abc.slice(0,next) + abc.slice(nextClose+1)
        } else {
          abc = abc.slice(0,next) + abc.slice(next + 1)
        }
        next = abc.indexOf('"')
      }
  }
  return abc
}

function getInnerStrings(abc) {
    var s = []
  if (abc) {
        // remove strings from abc
      abc = abc.trim()
      var next = abc.indexOf('"')
      while (next !== -1) {
        nextClose = abc.indexOf('"', next+1)
        if ((nextClose !== -1) && (nextClose > next)) {
          // strip string
          s.push(abc.slice(next+1,nextClose))
          abc = abc.slice(0,next) + abc.slice(nextClose+1)
        } else {
          abc = abc.slice(0,next) + abc.slice(next + 1)
        }
        next = abc.indexOf('"')
      }
  }
  return s
}



function safeString(text) {
    if (text) {
        text = text.replaceAll(" ",'_')
        text = text.replaceAll(",",'_')
        text = text.replaceAll(".",'_')
        text = text.replaceAll("[",'_')
        text = text.replaceAll("]",'_')
        text = text.replaceAll("(",'_')
        text = text.replaceAll(")",'_')
        text = text.replaceAll("?",'_')
    }
    return  text
}

function test() {
    
    //generateAbcFromTunes();
    var tb = new window.ABCJS.TuneBook($('#longabc').val())
}


/* extract key sig and rhythm from string with - seperator
 * for formatting, the rhythm key R is abused to hold key signature and rhythm
 * @return {key:'',rhythm:''}
 */
function splitKeyAndRhythm(text) {
    if (text) {
        var parts = text.split('-')
        if (parts.length ==2) {
            return {key: parts[0].trim(), rhythm: parts[1].trim()}
        } else if (parts.length ==1) {
            return {key: '', rhythm: parts[0].trim()}
        }
    }
    return {key: '', rhythm: ''}
}

function getMetaValueFromSongline(key,songline) {
    try {
        var parts = songline.split("["+key+":")
        var isFirst = songline.indexOf(key + "]") === 0
        if (isFirst || parts.length > 1) {
            return parts[1].split("]")[0]
        } else {
            return ''
        }
    } catch (e) {
        return ''
    }
}
function scrollTo(id) {
    var element = document.getElementById(id);
    var headerOffset = 60;
    var elementPosition = element.offsetTop;
    var offsetPosition = elementPosition - headerOffset;
    document.documentElement.scrollTop = offsetPosition;
    document.body.scrollTop = offsetPosition; // For Safari
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


function download(filename, text) {
    var element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);

    element.style.display = 'none';
    document.body.appendChild(element);

    element.click();

    document.body.removeChild(element);
}

function printPage() {
  $('#indexes').show()
  $('#music').show()
  $('#cheatsheet_music_container').show()
  $('#songlistmanager').show()
  window.print()
}
function showTuneControls() {
    $("#stopbutton").hide()
    $("#generatebutton").show()
    $('#downloadbutton').show()
    $('#printbutton').show()
    $('#cheatsheetbutton').show()
    $('#indexbutton').show()
    $('#playallbutton').show()
    $('#tempo').show()
}
function hideTuneControls() {
    $("#generatebutton").hide()
    $('#downloadbutton').hide()
    $('#printbutton').hide()
    $('#cheatsheetbutton').hide()
    $('#indexbutton').hide()
    $('#playallbutton').hide()
    $('#tempo').hide()
}

function showContentSection(contentId) {
    var contentTypes = ['cheatsheet_music_container','indexes','music','help','review']
    if (contentId == 'home') {
         $('#helptext').show()
         $('#songlistbutton').show()
         $('#errors').show()
         $("#music").show()
         $("#cheatsheet_music_container").hide()
         $("#indexes").hide()
         $("#help").hide()
         $("#review").hide()
         scrollTo('topofpage')
    } else {
        
             
        contentTypes.map(function(type) {
          if (contentId !== type) {
              $("#"+type).hide()
          } else {
              $("#"+type).show()
          }  
        })
        $('#helptext').hide()
        $('#songlistbutton').hide()
        $('#errors').hide()
       // $('#songlistmanager').hide()
        scrollTo('topofpage')
    }
    
}

/**
 * Set flag to stop rendering lookups.
 */

function setStopNow(val) {
   $("#stopbuttonvalue").val("true")
   $("#stopbutton").hide()
}


function downloadLongAbc() {
  download('tunebook.abc', $("#longabc").val())
}

function downloadShortAbc() {
  download('tunebook_cheatsheet.abc', $("#shortabc").val())
}

function isChord(chord) {
  var chordMatches = [
      'A','B','C','D','E','F','G',  
      'Am','Bm','Cm','Dm','Em','Fm','Gm',
      'Amin','Bmin','Cmin','Dmin','Emin','Fmin','Gmin',
      'Amaj','Bmaj','Cmaj','Dmaj','Emaj','Fmaj','Gmaj',
      'Adim','Bdim','Cdim','Ddim','Edim','Fdim','Gdim',
      'Aaug','Baug','Caug','Daug','Eaug','Faug','Gaug',
      'Asus','Bsus','Csus','Dsus','Esus','Fsus','Gsus',
      'A7','B7','C7','D7','E7','F7','G7',
      'A9','B9','C9','D9','E9','F9','G9',
      
      'Ab','Bb','Cb','Db','Eb','Fb','Gb',  
      'Abm','Bbm','Cbm','Dbm','Ebm','Fbm','Gbm',
      'Abmin','Bbmin','Cbmin','Dbmin','Ebmin','Fbmin','Gbmin',
      'Abmaj','Bbmaj','Cbmaj','Dbmaj','Ebmaj','Fbmaj','Gbmaj',
      'Abdim','Bbdim','Cbdim','Dbdim','Ebdim','Fbdim','Gbdim',
      'Abaug','Bbaug','Cbaug','Dbaug','Ebaug','Fbaug','Gbaug',
      'Absus','Bbsus','Cbsus','Dbsus','Ebsus','Fbsus','Gbsus',
      'Ab7','Bb7','Cb7','Db7','Eb7','Fb7','Gb7',
      'Ab9','Bb9','Cb9','Db9','Eb9','Fb9','Gb9',
      
      'A#','B#','C#','D#','E#','F#','G#',  
      'A#m','B#m','C#m','D#m','E#m','F#m','G#m',
      'A#min','B#min','C#min','D#min','E#min','F#min','G#min',
      'A#maj','B#maj','C#maj','D#maj','E#maj','F#maj','G#maj',
      'A#dim','B#dim','C#dim','D#dim','E#dim','F#dim','G#dim',
      'A#aug','B#aug','C#aug','D#aug','E#aug','F#aug','G#aug',
      'A#sus','B#sus','C#sus','D#sus','E#sus','F#sus','G#sus',
      'A#7','B#7','C#7','D#7','E#7','F#7','G#7',
      'A#9','B#9','C#9','D#9','E#9','F#9','G#9'
  ]
  return chordMatches.indexOf(chord.trim()) !== -1
}

function progressUp(songNumber) {
    var boost = parseInt($('#tune_boost_'+songNumber).text()) 
    boost = boost > 0 ? boost : 0
    var newBoost = boost + 1
    var tunes = $("#songlist").val().split("\n")
    var line = tunes[songNumber]
    var tuneId = getMetaValueFromSongline('ID',line)
    var setting = getMetaValueFromSongline('S',line)
    var text = getTextFromSongline(line)
    var newLine = ''
    if (tuneId)  newLine += '[ID:'+tuneId+']'
    if (setting)  newLine += '[S:'+setting+']'
    newLine += '[B:'+newBoost+']' + text
    tunes[songNumber] = newLine
    $("#songlist").val(tunes.join("\n"))
    //console.log('songlist written',line)
    $('#tune_boost_'+songNumber).text(newBoost)
    saveSongList()
}

function progressDown(songNumber) {
    var boost = parseInt($('#tune_boost_'+songNumber).text()) 
    boost = boost > 0 ? boost : 0
    var newBoost = boost - 1
    var tunes = $("#songlist").val().split("\n")
    var line = tunes[songNumber]
    var tuneId = getMetaValueFromSongline('ID',line)
    var setting = getMetaValueFromSongline('S',line)
    var text = getTextFromSongline(line)
    var newLine = ''
    if (tuneId)  newLine += '[ID:'+tuneId+']'
    if (setting)  newLine += '[S:'+setting+']'
    newLine += '[B:'+newBoost+']' + text
    tunes[songNumber] = newLine
    $("#songlist").val(tunes.join("\n"))
    //console.log('songlist written',line)
    $('#tune_boost_'+songNumber).text(newBoost)
    saveSongList()
}
