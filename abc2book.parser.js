

/**
 * TO JSON
 */


function abc2Tunebook(abc) {
  var parts = abc.split('X:')
  console.log('2book',parts)
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
    var key = ensureText(getMetaValueFromAbc("K",abc).trim())
    var type = ensureText(getMetaValueFromAbc("R",abc).trim())
    
    var id = ensureText(getKeyedCommentFromAbc('sessionorg_id',abc))
    var setting = getKeyedCommentFromAbc('sessionorg_setting',abc)
    var settingId = getKeyedCommentFromAbc('sessionorg_setting_id',abc)
    //var forceTitle = getKeyedCommentFromAbc('force_title',abc)
    var boost = ensureInteger(getKeyedCommentFromAbc('boost',abc))
    var title = ensureText(getMetaValueFromAbc("T",abc))
    //var source = ensureText(getMetaValueFromAbc("S",abc))
    // remove song number from title
    var tParts = title.split(".")
    var name = ensureText(tParts.length > 1 ? tParts[1].trim() : title.trim())
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
      console.log('ABC2JSON single',tune)
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
  parts.map(function(part) {
    if (isMetaLine(part) && !isAliasLine(part)) {
        if (part[0] === 'T') {
            meta[part[0]] = stripLeadingNumber(part.slice(2).trim())
        } else {
            meta[part[0]] = part.slice(2).trim()
        }
       
    }
  })
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

function getNotesFromAbc(abc) {
    if (!abc) return
    var parts = abc.split('\n')
    var noteLines = []
    parts.forEach(function(line) { 
        //console.log('try',line)
        if (line !== undefined && line !== null && !line.startsWith('% ') && !isMetaLine(line) && !isAliasLine(line) && (line.trim().length > 0)) {
            //console.log('try OK', line.startsWith('% ') , isMetaLine(line), isAliasLine(line))
            noteLines.push(line)
        }    
    })
    var notes = noteLines
    try {
        notes = window.ABCJS.extractMeasures(noteLines.join("\n"))
        if (notes.trim().length === 0) {
            notes = noteLines
        }
    } catch(e) {
        notes = noteLines
    }
    console.log('Gna',abc,noteLines)
    return notes.join("\n")
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
    try {
        var parts = abc.split("\n"+key+":")
        var isFirst = abc.indexOf(key + ":") === 0
        if (isFirst || parts.length > 1) {
            if (part[0] === 'T') {
                return stripLeadingNumber(parts[1].split("\n")[0].trim())
            } else {
                return parts[1].split("\n")[0].trim()
            }
        } else {
            return ''
        }
    } catch (e) {
        return ''
    }
}

function getKeyedCommentFromAbc(key,abc) {
    if (!abc) return
    var first = abc.indexOf('% abc-'+key)
    if (first !== -1) {
        var parts = abc.slice(first + 6 + key.length).split("\n")
        return parts[0].trim()
    } else {
        return null
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
                    var modifier = nextSymbol = abc[c+1]
                    nextSymbol = nextSymbol = abc[c+2]
                    if (c < abc.length + 3) {
                        nextNextSymbol = abc[c+3]
                        
                        if (c < abc.length + 4) {
                            nextNextNextSymbol = abc[c+4]
                        }
                    }
                    var result = symbolsToNumber(nextSymbol, nextNextSymbol,nextNextNextSymbol) 
                    newAbc.push(symbol + modifier + abcFraction(decimalToFraction(result.number  * multiplier)))
                    c = c + result.symbolsUsed  + 2
                } else {
                    if (c < abc.length + 2) {
                        nextNextSymbol = abc[c+2]
                        
                        if (c < abc.length + 3) {
                            nextNextNextSymbol = abc[c+3]
                        }
                    }
                    var result = symbolsToNumber(nextSymbol, nextNextSymbol,nextNextNextSymbol) 
                    newAbc.push(symbol + abcFraction(decimalToFraction(result.number  * multiplier)))
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
function symbolsToNumber(a,b,c) {
    if (isSlash(a)) {
        if (isDigit(b)) {
            if (isDigit(c)) {
                var combined = parseInt(b + '' + c)
                return {symbolsUsed: 3, number: 1/combined}
            } else {
                return {symbolsUsed: 2, number: 1/b}
            }
        } else {
            return {symbolsUsed: 1, number: 1/2}
        }
    } else {
        if (isDigit(a)) {
            if (isDigit(b)) {
                var combined = parseInt(a + '' + b)
                return {symbolsUsed: 2, number: 1/combined}
            } else {
                return {symbolsUsed: 1, number: 1/a}
            }
        } else {
            return {symbolsUsed: 0, number: 1}
        }
    }
}

function gcd(a, b) {
	return (b) ? gcd(b, a % b) : a;
}

var decimalToFraction = function (_decimal) {
    if (_decimal == parseInt(_decimal)) {
        return {
            top: parseInt(_decimal),
            bottom: 1,
            display: parseInt(_decimal) + '/' + 1
        };
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
        return {
            top: (top / x),
            bottom: (bottom / x),
            display: (top / x) + '/' + (bottom / x)
        };
    }
}

function abcFraction(fraction) {
    if (fraction.bottom === 1) {
        if (fraction.top === 1) {
            return ''
        } else {
            return fraction.top
        }
    } else {
        if (fraction.bottom === 2) {
            return "/"
        } else {
            return "/" + fraction.bottom
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
        return ensureText(stripLeadingNumber(tune.meta.hasOwnProperty("T")),tune.name)
    }
}

function getTuneType(tune) {
    if (tune && tune.meta && tune.meta.hasOwnProperty("R")) {
        return ensureText(tune.meta.hasOwnProperty("R"),tune.type)
    }
}

function getTuneNoteLength(tune) {
    if (tune && tune.meta && tune.meta.hasOwnProperty("L")) {
        return ensureText(tune.meta.hasOwnProperty("L"),'1/8')
    }
}
function getTuneMeter(tune) {
    if (tune && tune.meta && tune.meta.hasOwnProperty("M")) {
        return ensureText(tune.meta.hasOwnProperty("M"),timeSignatureFromTuneType(tune.type))
    }
}
function getTuneSource(tune) {
    if (tune && tune.meta && tune.meta.hasOwnProperty("S")) {
        return ensureText(tune.meta.hasOwnProperty("S"))
    }
}
