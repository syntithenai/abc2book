import abcjs from 'abcjs'
import useAbcTools from './useAbcTools'
import useUtils from './useUtils'
import { chordParserFactory, chordRendererFactory } from 'chord-symbol';

/**
 * Utilities for converting to/from abcjs object format
 * Also utilities for extracting and rendering chord data from abc notation (using abcjs)
 */
export default function useAbcjsParser() {
    
    var abcTools = useAbcTools()
    var utils = useUtils()
    
    /**
     * Get note length as a decimal number from abc notation string
     * 1/8 note == 0.125 is default
     * Seek note length in abc
     */
    function getNoteLengthDecimal(abc) {
        var nl = 0.125
        var parts = abc.split("\n")
        for (var partKey in parts) {
            var part = parts[partKey]
            if (part.startsWith('L:')) {
                var found = part.slice(2).trim()
                var foundParts = found.split("/")
                if (foundParts.length === 2) {
                    nl = foundParts[0]/foundParts[1]
                } 
                break;
            }
        }
       return nl
    }
    
    /** 
     * Get the time signature from an abc string
     */
    function getMeter(abc) {
        var nl = '4/4'
        var parts = abc.split("\n")
        for (var partKey in parts) {
            var part = parts[partKey]
            if (part.startsWith('M:')) {
                var found = part.slice(2).trim()
                var foundParts = found.split("/")
                if (foundParts.length === 2) {
                    nl = foundParts[0] + "/" + foundParts[1]
                } 
                break;
            }
        }
       return nl
    }
    
    /** 
     * Greatest common denominator of a and b
     */
    function gcd(a, b) {
        return (b) ? gcd(b, a % b) : a;
    }
    
    /**
     * Convert a decimal number to a fraction object 
     */
    var decimalToFraction = function (_decimal) {

        if (_decimal == 1){
            return {
                top		: 1,
                bottom	: 1,
                display	: 1 + ':' + 1
            };
        }  else {

            var top		= _decimal.toString().replace(/\d+[.]/, '');
            var bottom	= Math.pow(10, top.length);
            if (_decimal > 1) {
                top	= +top + Math.floor(_decimal) * bottom;
            }
            var x = gcd(top, bottom);
            return {
                top		: (top / x),
                bottom	: (bottom / x),
                display	: (top / x) + ':' + (bottom / x)
            };
        }
    };
    
    /**
     * Convert duration to number of noteLengths as a fraction string
     * that can be used in abc notation to describe note length
     */
    function durationToNoteLength(duration, noteLength=0.125) {
        var l = duration / noteLength 
        if (l > 1) {
            // avoid fraction if possible
            if (Math.round(l) == l) {
                return l
            } else {
                // fraction
                var f = decimalToFraction(l)
                return f.top + "/" + f.bottom
            }
        } else if (l < 1) {
            // just denominator for durations less than notelength 
            // assumes durations less than notelenght are an even fraction of notelength
            return "/" + parseInt((1/l))
        } else {
            return ''
        }
    }
    
    /**
     * Convert abcjs pitch element to string that can 
     * be used in abc notation to represent note 
     */
    function pitchToNote(pitch,duration, noteLength) {
        var note = ''
        if (pitch && pitch.name && duration > 0) {
            note = pitch.name.trim() + durationToNoteLength(duration, noteLength)
        }
        
        if (pitch.startSlur) {
            note = "(" + note
        } else if (pitch.endSlur) {
            note = note + ")"
        } else if (pitch.startTie) {
            note = note + "-"
        } else if (pitch.endTie) {
            
        }
        return note
    }

    /**
     * Convert decoration string to canonical short form
     */
    function lookupDecoration(d) {
        var decorations = {'upbow': 'u','downbow':'v','fermata': 'H','accent': 'L','mordent': 'M','coda':'O','pralltriller':'P','segno':'S','trill':'T','staccato':'.', 'wedge': "!wedge!", 'uppermordent': "!uppermordent!", 'turn': "!turn!", 'thumb': "!thumb!", 'tenuto': "!tenuto!", 'snap': "!snap!", 'shortphrase': "!shortphrase!", 'roll': "!roll!", 'pppp': "!pppp!", 'ppp': "!ppp!", 'pp': "!pp!", 'p': "!p!", 'open': "!open!", 'mf': "!mf!", 'mediumphrase': "!mediumphrase!", 'lowermordent': "!lowermordent!", 'longphrase': "!longphrase!", 'invertedfermata': "!invertedfermata!", 'fine': "!fine!", 'ffff': "!ffff!", 'fff': "!fff!", 'ff': "!ff!", 'f': "!f!", 'diminuendo)': "!diminuendo)!", 'diminuendo(': "!diminuendo(!", 'crescendo)': "!crescendo)!", 'crescendo(': "!crescendo(!", 'breath': "!breath!", 'D.S.': "!D.S.!", 'D.C.': "!D.C.!", '5': "!5!", '4': "!4!", '3': "!3!", '2': "!2!", '1': "!1!", '0': "!0!", '+': "!+!"}
        return decorations.hasOwnProperty(d) ? decorations[d] : '' //'{'+d+"}"
    }   
       
       
    /**
     * Convert from abcjs parsed object to ABC notation string
     * the original string is required as well as the parsed version 
     * to determine note spacings  and note length  
     */
    function render(abc, abcString) {
        //console.log('ren',abc)
        var noteLength = getNoteLengthDecimal(abcString)
        var final = []
        var symbolsSinceLastBar = 0
        abc[0].lines.forEach(function(line, lineNumber) {
            if (line && line.staff && line.staff.length > 0) {
                line.staff[0].voices.forEach(function(symbols, voiceNumber) {
                   symbols.forEach(function(symbol,symbolNumber) {
                       var originalString = abcString && abcString.length >= symbol.startChar && abcString.length > symbol.endChar ? abcString.slice(symbol.startChar,symbol.endChar + 1) : ''
                       var trailingSpace = originalString.endsWith(' ')
                       if (symbol && symbol.el_type === 'note') {
                            symbolsSinceLastBar++
                            var note = ''
                            if (symbol.pitches && symbol.pitches.length > 1 && symbol.duration > 0) {
                                note = '[' + symbol.pitches.map(function(pitch) { return pitch.name}).join('') + ']' +  durationToNoteLength(symbol.duration, noteLength)
                            } else if (symbol.pitches && symbol.pitches.length === 1 && symbol.duration > 0) {
                                note = pitchToNote(symbol.pitches[0], symbol.duration, noteLength)
                            } else if (symbol.rest && symbol.rest.type === 'rest' && symbol.duration > 0) {
                                note = 'z' + durationToNoteLength(symbol.duration, noteLength)
                            } else if (symbol.rest && symbol.rest.type === 'spacer') {
                                note = 'y' + (trailingSpace ? ' ' : '')
                            }
                            if (Array.isArray(symbol.decoration) && symbol.decoration.length > 0) {
                                symbol.decoration.reverse().forEach(function(decoration) {
                                   note = lookupDecoration(decoration) + note  
                                })
                            }
                            if (symbol.startTriplet > 0) {
                                note = "(" + String(symbol.startTriplet) + note
                            }
                            if (Array.isArray(symbol.gracenotes) && symbol.gracenotes.length > 0) {
                                note = "{" + symbol.gracenotes.map(function(note) {
                                        if (note.acciaccatura) {
                                            return "/" + note.name
                                        } else {
                                            return note.name
                                        }
                                    }).join("") + "}" + note
                                
                            }
                            if (Array.isArray(symbol.chord) && symbol.chord.length > 0) {
                                note = symbol.chord.map(function(chord) {
                                        return  '"' +chord.name.replace("♭","b").replace("♯","#") + '"' 
                                    }).join("").trim()  +  note
                            }
                            if (trailingSpace) {
                                note = note + ' '
                            }
                            if (note.length > 0) {
                                final.push({note: note, lineNumber: lineNumber})
                            } 
                       }  else if (symbol.el_type === "tempo")  {
                           var note = '[Q:' + symbol.bpm + "]" + (trailingSpace ? ' ' : '')
                           final.push({note: note, lineNumber: lineNumber})
                       }  else if (symbol.el_type === "keySignature")  {
                           var note = '[K:' + symbol.root + "]" + (trailingSpace ? ' ' : '')
                           final.push({note: note, lineNumber: lineNumber})
                       }  else if (symbol && symbol.value && symbol.el_type === "timeSignature")  {
                           var note = '[M:' + symbol.value[0].num + "/" + symbol.value[0].den + "]" + (trailingSpace ? ' ' : '')
                           final.push({note: note, lineNumber: lineNumber})
                       }  else if (symbol.el_type === "part" && symbol.title && symbol.title.length > 0)  {
                           var note = '[P:' + symbol.title + "]" + (trailingSpace ? ' ' : '')
                           final.push({note: note, lineNumber: lineNumber})
                       } else if (symbol.el_type === 'bar') {
                           symbolsSinceLastBar = 0
                           if (symbol.type === 'bar_thin') {
                               var note = "|" + (trailingSpace ? ' ' : '')
                               final.push({note: note, lineNumber: lineNumber})
                           } else if (symbol.type === 'bar_thin_thin') {
                               var note = "||" + (trailingSpace ? ' ' : '')
                               final.push({note: note, lineNumber: lineNumber})
                           } else if (symbol.type === 'bar_thin_thick') {
                               var note = "|]" + (trailingSpace ? ' ' : '')
                               final.push({note: note, lineNumber: lineNumber})
                           } else if (symbol.type === 'bar_thick_thin') {
                               var note = "[|" + (trailingSpace ? ' ' : '')
                               final.push({note: note, lineNumber: lineNumber})
                           } else if (symbol.type === 'bar_left_repeat') {
                               var note = "|:" + (trailingSpace ? ' ' : '')
                               final.push({note: note, lineNumber: lineNumber})
                           } else if (symbol.type === 'bar_right_repeat') {
                               var note = ":|" + (trailingSpace ? ' ' : '')
                               final.push({note: note, lineNumber: lineNumber})
                           }
                           if (symbol.startEnding > 0)  {
                               var em = (symbolsSinceLastBar > 0 ? "[" : '') +String(symbol.startEnding)
                               final.push({note: em, lineNumber: lineNumber})
                           }
                        }
                    })
                })
            }
        }) 
        //console.log(final)
        var lastLineNumber = 0
        return final.map(function(noteData) {
            if (noteData.lineNumber != lastLineNumber) {
                lastLineNumber = noteData.lineNumber
                return "\n" + noteData.note
            } else {
                return noteData.note
            }
        }).join("")
    }
   
   
    /* 
     * Given a chord symbol return a canonical short name for the chord
     * or an empty string if not a valid chord symbol
     */
    function cleanChord(key = null , chord, transpose = 0) {
        
        const parseChord = chordParserFactory();
        
        var parsedChord = parseChord(chord)
        
        var renderOptions = { useShortNamings: true }
        //console.log('TRSPOS',transpose,abcString)
        if (transpose > 0 || transpose < 0) {
            renderOptions.transposeValue = Number(transpose)
        }
        var renderChord = chordRendererFactory(renderOptions);
        var renderedChord = renderChord(parsedChord)
        
        var parsedKey = parseChord(key)
        var keyRenderOptions = { useShortNamings: true }
        //console.log('TRSPOS',transpose,abcString)
        if (transpose > 0 || transpose < 0) {
            keyRenderOptions.transposeValue = Number(transpose)
        }
        var renderKey = chordRendererFactory(keyRenderOptions);
        var renderedKey = renderKey(parsedKey)
        
        var renderedChord2 = utils.canonicalChordForKey(renderedKey,renderedChord)
        //console.log('CLEAN',key,chord,transpose,renderedChord, renderedKey, renderedChord2)
        return renderedChord2
    }
   
    /**
     * Extract the chords from an abc string and render them
     * in a format suitable for guitar players
     * Chords are aligned to the beat, number of beats per bar is determined
     * from the time signature (default 4/4)
     * @param boolean showDots - use dots to show chord spacing within the bar
     * @param number transpose - transpose chords before rendering
     * @param key - key of abc song (NOT extract from string) used to
     *  determine whether to use # or b for display
     */    
    function renderChords(abcString, showDots=true, transpose = 0, forceKey=null, forceNoteLength=null, forceMeter=null) {
        var abcJson = abcTools.abc2json(abcString)
        var key = forceKey ? forceKey : abcJson.key
        var noteLengthText = forceNoteLength ? forceNoteLength : abcJson.noteLength
        var meter = forceMeter ? forceMeter : abcJson.meter
        var noteLength = getNoteLengthDecimal("L:"+noteLengthText+"\nM:"+meter)
        var barSize = abcTools.getNoteLengthsPerBar(noteLengthText, meter)
        //var meter = getMeter(abcString)
        var abc = parse(abcString)
        //console.log("render chords",noteLength,barSize, meter, abcJson, abc)
        //console.log("render chords",abc)
        //console.log("AAAA",abc, abc[0].lines[0].staff[0].voices[0])
        var final = []
        var noteLengthsSinceLastBar = 0
        
        function writeBar(barLayout) {
            //console.log("BL",barLayout)
            for (var i=0; i < barSize; i++) {
               if (Array.isArray(barLayout[i]) && barLayout[i].length > 0) {
                    // push the chords on beat i
                    final.push(barLayout[i].join(' ').trim())
                } else {
                    if (showDots) {
                        final.push(".")
                    }
                }
             }
       
             final.push("|")
        }
        
        abc[0].lines.forEach(function(line, lineNumber) {
            //line.staff[0].voices.forEach(function(symbols, voiceNumber) {
                if (line && Array.isArray(line.staff) && line.staff.length > 0) {
                    var symbols = line.staff[0].voices[0]
                    //console.log("VVV",lineNumber,symbols)
                    //var lastBarLayout = null
                    // prepare an array of arrays to allocate chords into
                    // top level array is beats
                    // inner array contains chords on that beat
                    var barLayout = []
                    for (var i=0; i < barSize; i++) {
                        barLayout[i] = []
                    }
                    //// iterate symbols mapping to barLayout
                    //// for each symbol if there is a chord attached, assign it to the closest noteLength in barLayout
                    //// if the symbol is a bar
                    var lastSymbol = null
                    
                    symbols.forEach(function(symbol,symbolNumber) {
                       lastSymbol = symbol
                       if (symbol.el_type === 'note') {
                            // assign note chord to bar layout
                            if (Array.isArray(symbol.chord) && symbol.chord.length > 0) {
                                symbol.chord.forEach(function(chordT) {
                                    chordT.name.trim().split("\n").forEach(function(chord) {
                                        var renderedChord2 = cleanChord(key, chord, transpose)
                                    
                                        var assignChordToBeat = Math.round(noteLengthsSinceLastBar / noteLength)
                                        //console.log('assign',assignChordToBeat,renderedChord2, chord)
                                        if (assignChordToBeat <= barSize && Array.isArray(barLayout[assignChordToBeat])) {
                                            var current = Array.isArray(barLayout[assignChordToBeat]) ? barLayout[assignChordToBeat] : []
                                            current.push(renderedChord2 ? renderedChord2.trim() : '')
                                            barLayout.splice(assignChordToBeat,1,current)
                                        }
                                        //return chord.name.replace("♭","b").replace("♯","#")
                                    })
                                })
                            } 
                            if (symbol.duration > 0) {
                                noteLengthsSinceLastBar = noteLengthsSinceLastBar + symbol.duration
                                //console.log('sincelast',noteLengthsSinceLastBar,symbol.duration)
                            }
                       } else if (symbol.el_type === 'bar') {
                           noteLengthsSinceLastBar = 0
                           //var maxChordsInBeat = 0
                           //for (var i=0; i < barSize; i++) {
                                //if (Array.isArray(barLayout[i]) && barLayout[i].length > maxChordsInBeat) {
                                    //maxChordsInBeat = barLayout[i].length
                                //}
                           //}
                        
                           // write bar to final array
                           writeBar(barLayout)
                           barLayout = []
                            for (var i=0; i < barSize; i++) {
                                barLayout.push([])
                            }
                     //console.log(final.join(' '))
                    }
                }) 
                //console.log("LASTBAR",lineNumber)
                if (lastSymbol && lastSymbol.el_type == 'bar') {
                    final.push("\n")
                    if (lastSymbol.type === 'bar_thin_thin') {
                       final.push("\n" )
                    }
                } else if (lastSymbol && lastSymbol.el_type !== 'bar') {
                    writeBar(barLayout)
                    final.push("\n")
                 
                }
            }
        }) 
        //console.log(final.join(' '))
        return final.join(' ').replaceAll("\n ","\n")
    }
    
    /**
     * Parse an abc string into abcjs object format
     */
    function parse(abc) {
        return abcjs.renderAbc("*", abc)
    }
    
    /**
     * Parse an string containing compressed chord format 
     * into an object representing the lines, bars and timing of the chords
     */
    function parseChordText(chordText, abcString) {
        var abcJson = abcTools.abc2json(abcString)
        var noteLengthsPerBar = abcTools.getNoteLengthsPerBar(abcJson.noteLength, abcJson.meter) 
        var key = abcTools.getMetaValueFromAbc('K',abcString)
        var result = []
        if (chordText && chordText.trim()) {
            var lines = chordText.trim().split("\n")
            lines.forEach(function(line,lineNumber) {
              if (!Array.isArray(result[lineNumber])) result[lineNumber] = []
              var cleanLine = line.trim()
              if (cleanLine.endsWith("|")) {
                  cleanLine = cleanLine.slice(0,-1)
              }
              var bars = cleanLine.split("|")
              bars.forEach(function(bar,bk) {
                  if (typeof bar === 'string' && bar.trim()) {
                    // cull empties and ensure valid chords
                    var barChords = bar.trim().split(" ").filter(function(val) {if (!val || !val.trim()) return false; else return true}).map(function(chord) {
                        var clean = cleanChord(key, chord)
                        //console.log('FILTER',chord,clean)
                        return clean
                    })
                    // distribute provided symbols over beats
                    var newChords = {} //new Array(noteLengthsPerBar)
                    barChords.forEach(function(barToken, barTokenKey) {
                        var position = (barTokenKey/barChords.length) * noteLengthsPerBar
                        if (barChords[barTokenKey].replaceAll('.','').trim().length !== 0)  {
                            //console.log("PARSECHORDTEXT",position,barChords[barTokenKey], barTokenKey, barChords.length, noteLengthsPerBar) 
                            if (!Array.isArray(newChords[position])) {
                                newChords[position] = []
                            }  
                            //if (newChords[position].length > 0) newChords[position].push(' ')
                            newChords[position].push(barChords[barTokenKey])  
                        }
                    })
                  
                    result[lineNumber][bk] = newChords
                  }
                   //else {
                      //result[lineNumber][bk] = {}
                  //}
              })
            
            })
        }
        console.log('CHORDTEXT',result)
        return result
    }
    
    /**
     * Merge compressed chord text into an abcString
     * and return the updated abcString
     */
    function  mergeChords(chordText, abcString) {
        var chordLayout = parseChordText(chordText, abcString)
        var abc = parse(abcString)
        var abcJson = abcTools.abc2json(abcString)
        var noteLengthText = abcJson.noteLength ? abcJson.noteLength : '1/8'
        var meter = abcJson.meter
        var noteLength = getNoteLengthDecimal("L:"+noteLengthText+"\nM:"+meter)
        var barSize = abcTools.getNoteLengthsPerBar(noteLengthText, meter)
        if (barSize > 0) {
            var final = []
            var noteLengthsSinceLastBar = 0
            //console.log("meRGE",noteLength, meter, barSize, chordLayout,abc)
            var barIndex = {} 
            // iterate parsed note and bar lines to create lookups 
            // per line/bar/beat to symbol number
            
            
            
            abc[0].lines.forEach(function(line,lineNumber) {
                var barCount = 0
                var barTally = 0
                if (line && line.staff && line.staff.length > 0) {
                    line.staff[0].voices[0].forEach(function(symbol, symbolNumber) {
                        var indexKey = lineNumber + "-" + barCount + '-' + barTally
                        //console.log(indexKey, symbol, symbol.el_type)
                        if (!Array.isArray(barIndex[indexKey])) barIndex[indexKey] = []
                        if (symbol.el_type === 'note') {
                            barIndex[indexKey].push(symbolNumber)
                            //console.log('UPDDURpre',barTally)
                            if (symbol.duration > 0) barTally = barTally + (symbol.duration/noteLength)
                            //console.log('UPDDUR',symbol.duration, noteLength, barTally)
                        } else if (symbol.el_type === 'bar') {
                            barCount++
                            barTally = 0
                            //console.log('UPDtally',barCount)
                        }
                        // clear chords
                        abc[0].lines[lineNumber].staff[0].voices[0][symbolNumber].chord = []
                    })
                }
            })
           
            console.log("BARIND",barIndex, chordLayout)    
            
            // ensure the correct number of lines
            var parsedLength = abc[0].lines.length
            var counter = 0
            
            var lineNewLines = {}
            // filter lines without any chords
            // during iteration, count non empty lines and create an 
            // index of empty line numbers (for double bar lines)
            var chordLinesNotEmpty = chordLayout.filter(function(a) {
                if (a.length > 0) {
                    counter++
                    return true
                } else {
                    if (counter > 0) lineNewLines[counter - 1] = true
                    return false
                }
            })
            
            // chop or slice lines to ensure correct number of lines
            var chordLength = chordLinesNotEmpty.length
            //console.log("LENGS",lineNewLines,chordLength, parsedLength)    
            if (chordLength > parsedLength) {
                // create lines
                for (var i = 0; i < (chordLength - parsedLength); i++) {
                    var restLine = []
                    var barsToCreate = chordLinesNotEmpty[parsedLength + i].length
                    for (var k = 0; k < barsToCreate; k++) {
                        var restChord = chordLinesNotEmpty[parsedLength + i][k]
                        for (var j = 0; j< barSize; j++) {
                            var r = {rest: {type:'rest'}, el_type:'note', duration: noteLength}
                            if (restChord && Array.isArray(restChord[j])) r.chord = restChord[j].map(function(c) {return {name: c}})
                            //console.log("RRRR",restChord,r)
                            restLine.push(r)
                        }
                        restLine.push(lineNewLines[parsedLength + i] ? {type:'bar_thin_thin', el_type:'bar'} : {type:'bar_thin', el_type:'bar'})
                    }
                    
                    //var totalBars = 0
                    //var totalRests = 0
                    //for var
                    //console.log('push line',chordLength > parsedLength)
                    abc[0].lines.push({staff:[{voices:[restLine]}]})
                }
            } else if (chordLength < parsedLength) {
                // chop lines
                //console.log('chops lines',parsedLength - chordLength)
                abc[0].lines = abc[0].lines.slice(0,chordLength)
            }
            
            // ensure correct bar lengths and line endings
            abc[0].lines.forEach(function(line, lineNumber) {
                var barCount = 0
                var lastSymbol = null
                var lastSymbolNumber = null
                var symbols = line.staff[0].voices[0]
                var barEnds = {}
                // count bars and create index of bar end symbol numbers
                symbols.forEach(function(symbol, symbolNumber) {
                    if (symbol.el_type === "bar") {
                        barEnds[barCount] = symbolNumber
                        barCount++
                    }
                    lastSymbol = symbol
                    lastSymbolNumber = symbolNumber
                })
                
                // add bar line to lines without closing bar
                if (lastSymbol.el_type !== 'bar') {
                    barCount++
                    // append rests and bar line to 
                    //console.log('append bar with rests')
                    abc[0].lines[lineNumber].staff[0].voices[0].push(lineNewLines[lineNumber] ? {type:'bar_thin_thin', el_type:'bar'} : {type:'bar_thin', el_type:'bar'})
                } else {
                    // if lineNewLine force double bar
                    var barLine = abc[0].lines[lineNumber].staff[0].voices[0][lastSymbolNumber]
                    //console.log("FIRCECDIB",barLine,lastSymbolNumber, lastSymbol)
                    barLine.type = lineNewLines[lineNumber] ? 'bar_thin_thin' : 'bar_thin'
                    abc[0].lines[lineNumber].staff[0].voices[0].splice(lastSymbolNumber,1,barLine)
                    //push(lineNewLines[lineNumber] ? {type:'bar_thin_thin', el_type:'bar'} : {type:'bar_thin', el_type:'bar'})
                    //}
                }
                var barsInChordText = chordLinesNotEmpty[lineNumber].length
                var barCountDiff = barsInChordText - barCount
                if (barCountDiff > 0) {
                    // add bars
                    //console.log('add bars',barCountDiff,parsedLength,chordLinesNotEmpty)
                    for (var k = 0; k < barCountDiff; k++) {
                        var restChord = chordLinesNotEmpty[lineNumber][k]
                        for (var j = 0; j< barSize; j++) {
                            var r = {rest: {type:'rest'}, el_type:'note', duration: noteLength}
                            if (restChord[j]) r.chord = restChord[j].map(function(c) {return {name: c}})
                            abc[0].lines[lineNumber].staff[0].voices[0].push(r)
                        }
                        abc[0].lines[lineNumber].staff[0].voices[0].push(lineNewLines[lineNumber] ? {type:'bar_thin_thin', el_type:'bar'} : {type:'bar_thin', el_type:'bar'})
                    }
                    //var totalBars = 0
                    //var totalRests = 0
                    //for var
                    //console.log('push line',chordLength > parsedLength)
                    //abc[0].lines.push({staff:[{voices:[restLine]}]})
                } else if (barCountDiff < 0) {
                    // remove bars
                    var removeBarsAfter = barCount + barCountDiff - 1
                    var barLineIndex = barEnds[removeBarsAfter] + 1
                    //console.log('remove bars',barCountDiff, removeBarsAfter, barLineIndex )
                    abc[0].lines[lineNumber].staff[0].voices[0] = abc[0].lines[lineNumber].staff[0].voices[0].slice(0,barLineIndex) 
                    //console.log('removed bars',abc[0].lines[lineNumber].staff[0].voices[0])
                }
            })
            
            //console.log('Fixed bars',abc[0].lines)
            
            var lineCount = 0        
            // iterate incoming chords assigning to parsed abc 
            //console.log(chordLayout)
            chordLayout.forEach(function(line,lineNumber) {
                //var addNewLine = false
                //console.log(lineNumber,line)
                
                line.forEach(function(bar,barNumber) {
                    var lastSymbolNumber = null
                    Object.keys(bar).sort(function(a,b) {return (parseFloat(a) < parseFloat(b) ? -1 : 1) }).forEach(function(barKey, barCount) {
                        var chords = bar[barKey]
                        var key = lineCount + "-" + barNumber + "-" + Math.floor(barKey)
                        console.log(key,chords)
                        if (barIndex.hasOwnProperty(key) && barIndex[key] && barIndex[key].length > 0) {
                            //console.log('note exists at correct time ' ,barKey , Math.floor(barKey))
                            var firstNoteSymbolNumber = barIndex[key][0]
                            lastSymbolNumber = firstNoteSymbolNumber
                            abc[0].lines[lineCount].staff[0].voices[0][firstNoteSymbolNumber].chord = chords.reverse().map(function(c) {
                              return {name: c}  
                            })
                        } else {
                            //console.log('NO note exists at correct time ' + Math.floor(barKey))
                            //var akey = lineCount + "-" + barNumber + "-" + Math.floor(barKey * 2) / 2
                            if (lastSymbolNumber !== null) {
                                //barIndex.hasOwnProperty(akey) && barIndex[akey] && barIndex[akey].length > 0) {
                                //console.log('use previous note ' + lastSymbolNumber)
                                //var firstNoteSymbolNumber = barIndex[akey][0]
                                var oldChords = abc[0].lines[lineCount].staff[0].voices[0][lastSymbolNumber].chord 
                                
                                chords.reverse().forEach(function(c) {
                                  oldChords.push({name: c} )
                                })
                                abc[0].lines[lineCount].staff[0].voices[0][lastSymbolNumber].chord = oldChords
                            } else {
                                //console.log('DUMP NOTE',key, barIndex, barKey) //.hasOwnProperty(akey) )
                                //if (barIndex[akey]) console.log(barIndex[akey] , barIndex[akey].length > 0)
                            }
                        }
                    })  
                })
                if (line.length > 0) {
                    lineCount++
                }
             //else {
                //addNewLine = true
            //}
            }) 
        } else {
            console.log("Invalid notelength")
        }

        var final = render(abc, abcString)            
        //console.log("MERGED",abc,final)
        return final
    }
    
    /** 
     * Take text containing lyrics and chords and extract the chords and 
     * lyrics returning an object with extracted data
     * @return {chords:'', lyrics:'']
     */  
    function parseChordsAndText(chords) {
        const parseChord = chordParserFactory();
        const renderChord = chordRendererFactory({ useShortNamings: true });
        var lines = chords.replaceAll(/[(){}\[\]]/g, ' ').replaceAll("|"," | ").split("\n")
        // first by tokens
        var parsedLines = {}
        lines.forEach(function(line, lineKey) {
            if (line.trim().length > 0) {
                var chordTokens = []
                var textTokens = []
                var tokens = line.trim().split(' ')
                tokens.forEach(function(token) {
                     const chord = parseChord(token);
                     const chordRendered = renderChord(chord)
                     if (chordRendered !== null) {
                          chordTokens.push(chordRendered)
                     } else {
                         if (token.trim().length > 0) {
                             if (token.trim() === '|' || token.trim() === '.') {
                                 chordTokens.push(token.trim())
                             } else {
                                textTokens.push(token.trim())
                             }
                         }
                     }
                })
                parsedLines[lineKey] = {chords:chordTokens, text: textTokens, line: line}
            } else {
                parsedLines[lineKey] = {chords:[], text: [], line: line} 
            }
        })
        var lyricsLineKeys = Object.keys(parsedLines).filter(function(lineKey) {
            if (parsedLines[lineKey].text.join(' ').trim().length === 0 && parsedLines[lineKey].chords.length === 0) {
                return true
            } else if (parsedLines[lineKey].text.join(' ').trim().length > 0) {
                return true
            } else {
                return false
            }
        })
        var lyrics = lyricsLineKeys.map(function(lineKey) {
            return  parsedLines[lineKey].text.join(' ')
        }).join('\n')
        var chords = Object.keys(parsedLines).filter(function(lineKey) {
            // preserve blanks
            if (parsedLines[lineKey].text.join(' ').trim().length === 0 && parsedLines[lineKey].chords.length === 0) {
                return true
            } else if (parsedLines[lineKey].chords.length > 0) {
                return true
            } else {
                return false
            }
        }).map(function(lineKey) {
            return parsedLines[lineKey].chords.join(' ')
        }).join('\n').replaceAll("\n\n\n\n","\n")
        return {chords: chords, lyrics: lyrics}

    }
    
    /**
     * Extract the chords from a text containing chords and lyrics
     */
    function cleanupChords(val) {
        var data = parseChordsAndText(val)
        return data && data.chords ? data.chords : (val ? val : '')
    }
    
    /**
     * Extract the lyrics from a text containing chords and lyrics
     */
    function cleanupLyrics(val) {
           var data = parseChordsAndText(val)
           return data && data.lyrics ? data.lyrics :  ''
    }
    
    
    
    return {render,renderChords, parse, mergeChords, cleanupChords, cleanupLyrics}
}
