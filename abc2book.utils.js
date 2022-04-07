function removeAbcInnerStrings(abc) {
  if (abc) {
        // remove strings from abc
      abc = abc.trim()
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
  }
  return abc
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
    console.log("R",splitKeyAndRhythm(getMetaValueFromTune('R',tb.tunes[0].abc)))
    console.log("K",getMetaValueFromTune('K',tb.tunes[0].abc))
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
        var parts = abc.split("["+key+":")
        var isFirst = abc.indexOf(key + "]") === 0
        if (isFirst || parts.length > 1) {
            return parts[1].split("\n")[0]
        } else {
            return ''
        }
    } catch (e) {
        return ''
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
  window.print()
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

