

/**
 * TO JSON
 */


function abc2Tunebook(abc) {
  var parts = abc.split('X:')
  //console.log('2book',parts)
  var final = []
  var tuneBook = parts.forEach(function(v,k) {
    if (v && v.trim().length > 0) {
      final.push(singleAbc2json('X:'+v))
    } 
  })
  //console.log('tuneBook',parts)
  return final
}

//window.abc2Tunebook = abc2Tunebook

function singleAbc2json(abc) {
  if (abc && abc.trim().length > 0) {
    var meter = ensureText(getMetaValueFromAbc("M",abc))
    //var noteLength = getMetaValueFromAbc("L",abc)
    var key = ensureText(getMetaValueFromAbc("K",abc))
    //console.log('PARSE KEY ',key, ';',getMetaValueFromAbc("K",abc),abc)
    var type = ensureText(getMetaValueFromAbc("R",abc))
    
    var id = ensureText(getKeyedCommentFromAbc('sessionorg_id',abc))
    var setting = getKeyedCommentFromAbc('sessionorg_setting',abc)
    var settingId = getKeyedCommentFromAbc('sessionorg_setting_id',abc)
    var boost = ensureInteger(getKeyedCommentFromAbc('boost',abc))
    var name = ensureText(getMetaValueFromAbc("T",abc))
    // remove song number from title
    var aliases = getAliasesFromAbc(abc)
    var tune = {
      "format": "json",
      "perpage": "50",
      "name": name,
      "type": type,
      "aliases": aliases,
      "meta": getMetaFromAbc(abc),
      "abccomments": getCommentsFromAbc(abc),
      "settings": [
          {
              "key": key,
              "abc": getNotesFromAbc(abc),
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
      //tune.meter =meter
      //tune.noteLength = noteLength
      //tune.source = source
      tune.id = id
      tune.useSetting = 0
      //tune.forceTitle = forceTitle
      tune.boost = boost
      tune.songNumber = ensureText(getMetaValueFromAbc("X",abc))
      //console.log('ABC2JSON single',tune)
      return tune
    //}
  }
  return {}
}



function isAliasLine(line) {
    return (line.startsWith("N: AKA: "))
}

function isMetaLine(line) {
    if (line[1] === ":" && line[0] !== "|" && line[2] !== "|" ) {
        // avoid alias lines
        return isAliasLine(line) ? false : true
        
    } else {
        return false
    }
}


function getMetaFromAbc(abc) {
  var parts = abc.split("\n")
  var meta = {}
  function stashMeta(key,val) {
      if (meta.hasOwnProperty(key)) {
          meta[key] = meta[key] + "\n" + val
      } else {
          meta[key] = val
      }
  }
  
  parts.map(function(part) {
    if (isMetaLine(part) && !isAliasLine(part)) {
        if (part[0] === 'T') {
            stashMeta(part[0],stripLeadingNumber(part.slice(2).trim()))
            //meta[part[0]] = stripLeadingNumber(part.slice(2).trim())
        } else {
            stashMeta(part[0],part.slice(2).trim())
            //meta[part[0]] = part.slice(2).trim()
        }
       
    }
  })
  //console.log('GET META FROM ABC',abc,meta)
  return meta
  
}


function getCommentsFromAbc(abc) {
    if (!abc) return
    var parts = abc.split('\n')
    return parts.map(function(line) { 
        // exclude custom comments
        if (line.startsWith('% ') && !line.startsWith('% abc-')) {
            return line + "\n"
        } else {
            return ''
        }    
    }).join("")
}

function getNotesFromAbc(abc, parseNotes = false) {
    //console.log('getNotesFromAbc',parseNotes,abc)
    if (!abc || !abc.split) return ''
    var parts = abc.split("\n")
    var noteLines = []
    parts.forEach(function(line) { 
        //console.log('try',line)
        if (line !== undefined && line !== null && !line.startsWith('% ') && !isMetaLine(line) && !isAliasLine(line) && (line.trim().length > 0)) {
            //console.log('try OK', line.startsWith('% ') , isMetaLine(line), isAliasLine(line))
            noteLines.push(line+"\n")
        }    
    })
    var notes = noteLines
    if (parseNotes) {
       //  try parse and rejoin notes to standardise (but lose force line breaks)
        try {
            //console.log('GET ABC text',abc)
            var tunes = window.ABCJS.extractMeasures(abc)
            //console.log('GET ABC meas',tunes)
            if (tunes.length > 0) {
                notes = tunes[0].measures.map(function(measure,measureNumber) {
                    var nl = ''
                    var offset = 0
                    if (tunes[0].hasPickup) offset = 1
                    console.log('3 for nl ',((measureNumber - offset) % 4))
                    if (((measureNumber - offset) % 4) === 3 ) nl="\n" 
                    return measure.abc + nl
                })
            }
        } catch(e) {
            console.log(e)
        }
    }

    //console.log('getNotesFromAbc',notes)
    return notes.join("")
}


function getAliasesFromAbc(abc) {
    if (!abc) return
    var aliases=[]
    var first = abc.indexOf('N: AKA: ')
    while (first !== -1) {
        var parts = abc.slice(first + 7).split("\n")
        var aliasParts = parts[0].split(",")
        aliasParts.forEach(function(aliasPart) {
          aliases.push(aliasPart.trim())
        })
        first = abc.indexOf('N: AKA:', first + 1)
    } 
    return aliases
}



function getMetaValueFromAbc(key,abc) {
    var found = null
    try {
        var parts = abc.split("\n")
        for (var partKey in parts) {
            var part = parts[partKey]
            if (part.startsWith(key + ':')) {
                //if (part[0] === 'T') {
                    //found = stripLeadingNumber(part.slice(2).trim())
                //} else {
                    found = part.slice(2).trim()
                //}
                break;
            }
        }
    } catch (e) {
        console.log(e)
    }
    return found
}

function getKeyedCommentFromAbc(key,abc) {
    if (!abc) return ''
    var first = abc.indexOf('% abc-'+key)
    if (first === 0) {
        var parts = abc.slice(first + 6 + key.length).split("\n")
        return ensureText(parts[0].trim())
    } else {
        return ''
    }
}


//function parseAbc() {
  //var abc = $('#longabc').val()
  //var tuneBook = new ABCJS.TuneBook(abc)
  //var measureArray = ABCJS.extractMeasures(abc);
  //var tunes = []
  //tuneBook.tunes.map(function(tune,k) {
    //tune.measures = measureArray[k].measures
    //tune.hasPickup = measureArray[k].hasPickup
    //tune.meta = getNotesFromAbc(tune.abc)
    //tunes.push(tune)
    //return true
  //})
  ////console.log('parsed',tunes)
  //return tunes
//}

 
function removeAbcInnerStrings(abc) {
  if (abc) {
        // remove strings from abc notes
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










/**
 * Manipulate timing of abc string
 * eg multiplier=2 then  A2 b/ b/2 => A b b 
 */
  
function isOctaveModifier(letter) {
    return (letter === ',' || letter === "'") 
}

function multiplyAbcTiming(multiplier,abc) {
    var measures = window.ABCJS.extractMeasures(abc)[0].measures
    var newMeasures = measures.map(function(m) {
      var abc = m.abc
      var c = 0
      var newAbc = []
      var inQuote = false
      var inCurlyBracket = false
      var inSquareBracket = false
      while (c < abc.length) {
        var modifier = ''
        var symbol = abc[c]
        if (symbol === '"') {
            inQuote =!inQuote
        }
        if (symbol === '{') {
            inCurlyBracket = true
        }
        if (symbol === '}') {
            inCurlyBracket = false
        }
        if (symbol === '[') {
            inSquareBracket = true
        }
        if (symbol === ']') {
            inSquareBracket = false
        }
        var newSymbol = null
        var nextSymbol = abc[c+1]
        var nextNextSymbol = null
        var nextNextNextSymbol = null
        if (!inQuote && !inCurlyBracket && !inSquareBracket && isNoteLetter(symbol)) {
            if (c < abc.length + 1) {
                nextSymbol = abc[c+1]
                if (isOctaveModifier(nextSymbol)) {
                    var modifier = abc[c+1]
                    nextSymbol = nextSymbol = abc[c+2]
                    if (c < abc.length + 3) {
                        nextNextSymbol = abc[c+3]
                        
                        if (c < abc.length + 4) {
                            nextNextNextSymbol = abc[c+4]
                        }
                    }
                    var result = symbolsToFraction(nextSymbol, nextNextSymbol,nextNextNextSymbol) 
                    //var f = decimalToFraction(result.number)
                    var asFraction = new Fraction(result.number.top,result.number.bottom)
                    var m = decimalToFraction(multiplier)
                    var multiplierFraction = new Fraction(m.top,m.bottom)
                    var finalFraction = asFraction.multiply(multiplierFraction)
                    
                    //console.log("multiply", [symbol ,nextSymbol, nextNextSymbol, nextNextNextSymbol], result.number ,"by multiplier ",multiplier, ' is ' ,finalFraction)
                    newAbc.push(symbol + modifier + abcFraction(finalFraction.numerator, finalFraction.denominator))
                    c = c + result.symbolsUsed  + 2
                } else {
                    if (c < abc.length + 2) {
                        nextNextSymbol = abc[c+2]
                        
                        if (c < abc.length + 3) {
                            nextNextNextSymbol = abc[c+3]
                        }
                    }
                    
                    var result = symbolsToFraction(nextSymbol, nextNextSymbol,nextNextNextSymbol) 
                    //var f = decimalToFraction(result.number)
                    //console.log('RES',result)
                    var asFraction = new Fraction(parseInt(result.number.top),parseInt(result.number.bottom))
                    //console.log('RESasf',asFraction)
                    var m = decimalToFraction(multiplier)
                    var multiplierFraction = new Fraction(parseInt(m.top),parseInt(m.bottom))
                    var finalFraction = asFraction.multiply(multiplierFraction)
                    //console.log("multiply", [symbol ,nextSymbol, nextNextSymbol, nextNextNextSymbol], result.number ,"by multiplier ",multiplier, ' is ' ,asFraction, finalFraction)
                    //console.log("multiply", finalFraction)
                    newAbc.push(symbol + modifier + abcFraction(finalFraction.numerator, finalFraction.denominator))
                    c = c + result.symbolsUsed  + 1
                }
            } else {
                newAbc.push(symbol)
                c++
            }
            
        } else {
            newAbc.push(symbol)
            c++
        }
      }
      m.abc = newAbc.join('')
      return m 
    })
    return generateAbcFromMeasures(newMeasures)
}

function generateAbcFromMeasures(measures) {
    return measures.map(function(measure) {
        var abc = measure.abc
        return abc 
    }).join(" ")
}

// eg /4 becomes 0.25, /2 becomes 0.5, 4 becomes 4.0
function symbolsToFraction(a,b,c) {
    if (isSlash(a)) {
        if (isDigit(b)) {
            if (isDigit(c)) {
                var combined = parseInt(b + '' + c)
                return {symbolsUsed: 3, number: {top: 1, bottom: combined}}
            } else {
                return {symbolsUsed: 2, number: {top: 1, bottom: b}}
            }
        } else {
            return {symbolsUsed: 1, number: {top: 1, bottom: 2}}
        }
    } else {
        if (isDigit(a)) {
            if (isDigit(b)) {
                var combined = parseInt(a + '' + b)
                return {symbolsUsed: 2, number: {top: combined, bottom: 1}}
            } else {
                return {symbolsUsed: 1, number: {top: a, bottom: 1}}
            }
        } else {
            return {symbolsUsed: 0, number: {top: 1, bottom: 1}}
        }
    }
}

function gcd(a, b) {
	return (b) ? gcd(b, a % b) : a;
}

var decimalToFraction = function (_decimal) {
    //console.log('DECIMALTOFRACTION',_decimal)
    if (_decimal == parseInt(_decimal)) {
        var a = {
            top: parseInt(_decimal),
            bottom: 1,
            display: parseInt(_decimal) + '/' + 1
        };
        //console.log('DECIMALTOFRACTION ret a',a)
        return a
    }
    else {
        var top = _decimal.toString().includes(".") ? _decimal.toString().replace(/\d+[.]/, '') : 0;
        var bottom = Math.pow(10, top.toString().replace('-','').length);
        if (_decimal >= 1) {
            top = +top + (Math.floor(_decimal) * bottom);
        }
        else if (_decimal <= -1) {
            top = +top + (Math.ceil(_decimal) * bottom);
        }

        var x = Math.abs(gcd(top, bottom));
        var a = {
            top: (top / x),
            bottom: (bottom / x),
            display: (top / x) + '/' + (bottom / x)
        };
        //console.log('DECIMALTOFRACTION ret a',a)
        return a
    }
}

function abcFraction(top, bottom) {
    //console.log('abcfraction',top, bottom)
    if (bottom === 1) {
        if (top === 1) {
            //console.log('abcfraction ret empty top 1')
            return ''
        } else {
            //console.log('abcfraction ret top '+fraction.top)
            return top
        }
    } else {
        if (bottom === 2) {
            //console.log('abcfraction ret bottom is 2 ret /')
            return "/"
        } else {
            //console.log('abcfraction ret bottom '+fraction.bottom)
            return "/" + bottom
        }
    }
}


function isNoteLetter(a) {
    if ("zabcdefgABCDEFG".indexOf(a) !== -1) {
        return true
    } else {
        return false
    }
}
function isDigit(a) {
    if ("123456789".indexOf(a) !== -1) {
        return true
    } else {
        return false
    }
}
function isSlash(a) {
    if (a === "/") {
        return true
    } else {
        return false
    }
}



function getTuneName(tune) {
    if (tune && tune.meta && tune.meta.hasOwnProperty("T")) {
        return ensureText(tune.meta["T"],tune.name)
    } else return tune.name
}

function getTuneType(tune) {
    if (tune && tune.meta && tune.meta.hasOwnProperty("R")) {
        return ensureText(tune.meta["R"],tune.type)
    } else return tune.type
}

function getTuneNoteLength(tune) {
    if (tune && tune.meta && tune.meta.hasOwnProperty("L")) {
        return ensureText(tune.meta["L"],'1/8')
    } else return '1/8'
}
function getTuneMeter(tune) {
    //console.log('getmetyer',tune.meta, tune.type)
    if (tune && tune.meta && tune.meta.hasOwnProperty("M")) {
        var meter = ensureText(tune.meta["M"],timeSignatureFromTuneType(tune.type))
        //console.log('getmetyerRES',meter)
        return meter
    } else return timeSignatureFromTuneType(tune.type)
}
//function getTuneSource(tune) {
    //if (tune && tune.meta && tune.meta.hasOwnProperty("S")) {
        //return ensureText(tune.meta.hasOwnProperty("S"))
    //}
//}
function cleanMetaData(meta) {
    var final = {}
    if (meta) Object.keys(meta).forEach(function(key) {
      if (requiredHeaders.indexOf(key) !== -1) {
          final[key] = meta[key]
      }
    })
    return final
}
