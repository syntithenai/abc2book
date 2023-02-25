/** DEPRECATED **/

export default function useChordParser() {


    function renderAllChordsAndNotes(chords, notes, preTexts) {
        console.log("renall",chords, notes)
        // all arrays should be same structure 
        // if overriding with chords, which one is longer and fill?
        return notes.map(function(line,lineNumber) {
            // iterate bars
                //console.log("CL",chords[lineNumber])
                return line.map(function(beats,cbk) {
                    //console.log('CBB',lineNumber,cbk,beats)
                    if (Array.isArray(beats)) {
                        // iterate beats in bar
                        var beatsOut= []
                        
                        for (var beatNumber = 0; beatNumber < beats.length; beatNumber++) {
                            var chord = Array.isArray(chords[lineNumber]) && Array.isArray(chords[lineNumber][cbk]) && Array.isArray(chords[lineNumber][cbk][beatNumber]) ? chords[lineNumber][cbk][beatNumber].join('') : ''
                            
                            var note = Array.isArray(notes[lineNumber]) && Array.isArray(notes[lineNumber][cbk]) && Array.isArray(notes[lineNumber][cbk][beatNumber]) ? notes[lineNumber][cbk][beatNumber].join('') : ''
                            
                            var preText = Array.isArray(preTexts[lineNumber]) && Array.isArray(preTexts[lineNumber][cbk]) && Array.isArray(preTexts[lineNumber][cbk][beatNumber]) ? preTexts[lineNumber][cbk][beatNumber].join('') : ''
                            //console.log('ALL',lineNumber,cbk, beatNumber,chord,note)
                            
                            if (preText) beatsOut.push(preText)
                            if (chord && chord !== '.') beatsOut.push('"' + chord + '"')
                            if (note && note.length > 0) {
                                beatsOut.push(note)
                            } 
                            //else {
                                //beatsOut.push('z')
                            //}
                        }
                        var postText = Array.isArray(preTexts[lineNumber]) && Array.isArray(preTexts[lineNumber][cbk]) && Array.isArray(preTexts[lineNumber][cbk][beats.length]) ? preTexts[lineNumber][cbk][beats.length].join('') : ''
                        if (postText) beatsOut.push(postText)
                        
                        return beatsOut.join("")
                    
                    } else {
                        return ''
                    }
                }).join("")
            }).join("\n").replace("|\n\n","||\n\n") //+ "||"
    }
    
    function renderChords(chords, useDots = true, transpose) {
        //console.log("reccc",chords)
        if (Array.isArray(chords)) {
            var lastChord = null
            return chords.map(function(chordLines,clk) {
                // iterate bars
                    return chordLines.map(function(chordBeats,cbk) {
                        //console.log('CBB',cbk,chordBeats)
                        if (Array.isArray(chordBeats)) {
                            // iterate beats in bar
                            var beats= []
                            for (var clk = 0; clk < chordBeats.length; clk++) {
                                var chordLettersGroup = chordBeats[clk]
                                //console.log('B',cbk,clk, chordLettersGroup)
                                if (Array.isArray(chordLettersGroup)) {
                                    chordLettersGroup.forEach(function(chordLetters) {
                                        if (chordLetters && chordLetters.trim().length > 0) {
                                        //return chordBeats.map(function(chordLetters,clk) {
                                            var found = false
                                            // determine chord name
                                            
                                            const parseChord = chordParserFactory();
                                            var renderOptions = { useShortNamings: true }
                                            if (transpose) renderOptions.transposeValue = Number(transpose)
                                            const renderChord = chordRendererFactory(renderOptions);

                                            const chord = parseChord(chordLetters);
                                            if (chord.error) {
                                                //console.log("chord parser error",chord.error)
                                            } else {
                                                var rendered = renderChord(chord)
                                                //console.log(chord,rendered);
                                                //for (var i = chordLetters.length; i >= 0; i--) {
                                                    //if (!found && isChord(chordLetters.join('').slice(0,i))) {
                                                        beats.push(rendered) 
                                                        //chordLetters.join('').slice(0,i))
                                                        lastChord = rendered
                                                        //chordLetters.join('').slice(0,i)
                                                        found = true
                                                    //}
                                                //}
                                            }
                                            //if (!found && useDots)  beats.push('.')
                                            if (!found) {
                                                if (clk === 0 && lastChord) {
                                                    beats.push(lastChord)
                                                } else if (useDots) {
                                                    beats.push('. ')
                                                }
                                            } 
                                        } else {
                                            if (clk === 0 && lastChord) {
                                                beats.push(lastChord)
                                            } else if (useDots) {
                                                beats.push('. ')
                                            }
                                        }
                                    })
                                }
                            }
                            return beats.join(" ")
                        
                        } else {
                            var noteLength = getNoteLengthFraction()
                            var filler = new Array(noteLength.denominator)
                            if (useDots) filler.fill('.')
                            return filler.join(" ")
                        }
                    }).join("|")
                }).join("\n").replace("|\n\n","||\n\n")
            }
    }

    /* take chords as text and return array of lines
     * each containing an array of bars
     * each bar containing an array of chords spaced out with empties to
     * capture chord timing within the bar
     * 
     * After rendering 
     * with chords aligned to timing with dots and bar lines
     * assuming noteLength 1/8
     * ie 4/4   C G| G C  ==> C....G....|G....C....
     * ie 3/4   C . G| G . C  ==> C....G..|G....C..
     * * ie 3/4   C G| G C  ==> C...G...|G....C..
     * or 4/4   C G\n G C  ==> C....G....\nG....C....
     * number of . reflects meter and notelength
     */
     
    function parseChordText(chords, meter, noteLength = new Fraction(1,8)) {
        //console.log('parseChordText',chords)
        var meterParts = meter && meter.trim().split("/").length === 2 ? meter.trim().split("/") : ['4','4']
        var meterFraction = new Fraction(meterParts[0],meterParts[1])
        // how many dots per bar
        var noteLengthsPerBar = meterFraction.divide(noteLength).numerator
        console.log("MMM",meter, noteLength , noteLengthsPerBar)
        var result = []
        var lines = chords.split("\n")
        lines.forEach(function(line,lineNumber) {
          if (!Array.isArray(result[lineNumber])) result[lineNumber] = []
          var bars = line.trim().split("|")
          bars.forEach(function(bar,bk) {
              //if (!Array.isArray(result[lineNumber][bk])) result[lineNumber][bk] = []
              if (typeof bar === 'string' && bar.trim()) {
                // cull empties
                var barChords = bar.trim().split(" ").filter(function(val) {if (!val || !val.trim()) return false; else return true})
                // how many beats(noteLengths) per bar from tune.meter
                // distribute provided symbols over beats
                //var noteLength = tune ? getNoteLengthFraction(tune) : "1/8"
                //var meterParts = meter && meter.trim().split("/").length === 2 ? meter.trim().split("/") : ['4','4']
                //if (meterParts.length === 2) {
                    //var meterFraction = new Fraction(meterParts[0],meterParts[1])
                    //// how many dots per bar
                    //var noteLengthsPerBar = meterFraction.divide(noteLength)
                    // now the tricky bit aligning the chords to note length fractions
               
                var zoom = 1
                //if (barChords.length > 0 && Math.floor(noteLengthsPerBar.numerator / barChords.length) > 0) {
                    //zoom = Math.floor(noteLengthsPerBar.numerator / barChords.length) 
                //} else if (noteLengthsPerBar.numerator > 0) {
                    //zoom = noteLengthsPerBar.numerator 
                //}
                var newChords = new Array(noteLengthsPerBar)
                //console.log('nc',barChords,barChords.length,noteLengthsPerBar.numerator ,"Z",zoom,newChords.length,newChords)
                ////newChords.fill('.')
                barChords.forEach(function(barToken, barTokenKey) {
                    var position = Math.round((barTokenKey/barChords.length) * noteLengthsPerBar)
                    console.log('assign bchord at ',position,"C",barChords[barTokenKey])
                    //newChords[position] = Array.isArray(newChords[position]) ? newChords[position] : []
                    //barChords[barTokenKey].split('').forEach(function(letter) {
                      //newChords[position].push(letter)  
                    //})
                    if (barChords[barTokenKey].replaceAll('.','').trim().length !== 0)  {
                        if (!Array.isArray(newChords[position])) {
                            newChords[position] = []
                         //barChords[barTokenKey].split('').forEach(function(letter) {
                        }  
                        if (newChords[position].length > 0) newChords[position].push(' ')
                        newChords[position].push(barChords[barTokenKey])  
                        //}) 
                    }
                })
                
                //var count = 0
                //for (var i=0; i < newChords.length; i+= zoom) {
                    //if (barChords[count]) newChords[i] = barChords[count].split('')
                    //count++
                //}
                ////console.log('NLLP',lineNumber, bk,  "PER BAR",noteLengthsPerBar.numerator, "Z",zoom, "BC", barChords.length,"NEW",newChords)
                result[lineNumber][bk] = newChords
                //}
              }
          })
        })
        //console.log("CHORD TEXT",result)
        return result
    }
    
    
  function parseAbcToBeats(abcAll) {        
        //console.log('ddparseabc',abcAll ? abcAll.length : 'NONE')
        //var tb = new abcjs.TuneBook(abc)
        //var tuneObj = abcjs.parseOnly(abc)[0];
        var measureTotals = []
        var measureBeats = []
        var chords = []
        var preText = []
        
        var abcHeader = "X:0\nK:G\n"
        // strip line continuances
        var abcCleaned = []
        var current = []
        abcAll.split("\n").forEach(function(line) {
            //console.log('line',line)
        
            //if (line && line.trim().length > 0) {
                // allow for abc lines that end in \\ for line continuation
                if (line.trim().endsWith('\\')) {
                    //console.log('line slash',line)
                    current.push(line.trim().slice(0,-1))
                } else {
                    //console.log('line end',line)
                    current.push(line.trim())
                    if (current.join('').trim().length > 0) abcCleaned.push(current.join(''))
                    current = []
                }
                // empty line after double bar lines
                if (line.trim().endsWith("||")) {
                    abcCleaned.push("")
                }
            //}
                if (current.length > 0 && current.join('').trim().length > 0) abcCleaned.push(current.join(''))
        })
        //console.log('cleaned',abcCleaned)
        
        abcCleaned.forEach(function(abc, lineNumber) {
            //console.log('try measure',abc, lineNumber)
            var measuresRaw = abcjs.extractMeasures(abcHeader + abc)
            var measures = measuresRaw[0].measures
            //console.log('mult',tuneObj.makeVoicesArray())
            //console.log('mult2',lineNumber, measuresRaw) //, [measures[0].abc, measures[1].abc, measures[2].abc, measures[3].abc].join(""))
            if (Array.isArray(measures)) {
                var newMeasures = measures.map(function(m,mk) {
                  //console.log('mult2',lineNumber,mk,m)
                  if (!Array.isArray(measureTotals[lineNumber])) measureTotals[lineNumber] = []
                  if (!Array.isArray(measureBeats[lineNumber])) measureBeats[lineNumber] = []
                  if (!Array.isArray(chords[lineNumber])) chords[lineNumber] = []
                  if (!Array.isArray(preText[lineNumber])) preText[lineNumber] = []
                  
                  if (!Array.isArray(measureTotals[lineNumber][mk])) measureTotals[lineNumber][mk] = new Fraction(0,1)
                  var noteLength = getNoteLengthFraction()
                  var noteLengthsPerBar = getNoteLengthsPerBar().numerator
                  //console.log('noteLengthsPerBar',noteLengthsPerBar)
                  if (!Array.isArray(measureBeats[lineNumber][mk])) measureBeats[lineNumber][mk] = new Array(noteLengthsPerBar)
                  if (!Array.isArray(chords[lineNumber][mk])) chords[lineNumber][mk] = new Array(noteLengthsPerBar)
                  if (!Array.isArray(preText[lineNumber][mk])) preText[lineNumber][mk] = new Array(noteLengthsPerBar)
                  
                  var abc = m.abc
                  var c = 0
                  //var newAbc = []
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
                    var nextNextNextNextSymbol = null
                    
                    function handleFraction(finalFraction, symbol) {
                        //console.log("noteLength", noteLength)
                        //var noteLengthFractionsInBar = measureTotals[lineNumber][mk].numerator % measureTotals[lineNumber][mk].denominator
                        
                        //var beatTotal = measureTotals[lineNumber][mk].divide(noteLength)
                        //var whole = Math.floor(measureTotals[lineNumber][mk].numerator / measureTotals[lineNumber][mk].denominator)
                        //var remainder = adjusted.numerator % adjusted.denominator
                        //if (remainder === 0) beatNumber--
                        //var beatNumber = 0
                        //console.log("WHOLE",  measureTotals[lineNumber][mk], adjusted, beatNumber)
                        var noteLength = getNoteLengthFraction()
                        var adjusted = measureTotals[lineNumber][mk].divide(noteLength)
                        var beatNumber = Math.floor(adjusted.numerator / adjusted.denominator)
                        if (!Array.isArray(measureTotals[lineNumber][mk][beatNumber])) {
                            measureTotals[lineNumber][mk][beatNumber] = []
                        }
                        if (!Array.isArray(measureBeats[lineNumber][mk][beatNumber])) {
                            measureBeats[lineNumber][mk][beatNumber] = []
                        }
                        measureTotals[lineNumber][mk][beatNumber].push(symbol+abcFraction(finalFraction.numerator,finalFraction.denominator))
                        
                        measureTotals[lineNumber][mk] = measureTotals[lineNumber][mk].add(finalFraction.multiply(noteLength))
                        measureBeats[lineNumber][mk][beatNumber].push(symbol)
                    }

                    
                    
                    // is this a note ?
                    if (!inQuote && !inCurlyBracket && !inSquareBracket &&isNoteLetter(symbol)) {
                        // are there more letters after this note ?
                        if (c < abc.length + 1) {
                            nextSymbol = abc[c+1]
                            // is the extra letter an octave modifier
                            if (isOctaveModifier(nextSymbol)) {
                                var modifier = abc[c+1]
                                nextSymbol = abc[c+2]
                                // grab some extra letters for fraction parser
                                if (c < abc.length + 3) {
                                    nextNextSymbol = abc[c+3]
                                    
                                    if (c < abc.length + 4) {
                                        nextNextNextSymbol = abc[c+4]
                                    }
                                    if (c < abc.length + 5) {
                                        nextNextNextNextSymbol = abc[c+5]
                                    }                                
                                    
                                }
                                var result = symbolsToFraction(nextSymbol, nextNextSymbol,nextNextNextSymbol,nextNextNextNextSymbol) 
                                var finalFraction = new Fraction(result.number.top,result.number.bottom)
                                //var m = props.tunebook.abcTools.decimalToFraction(multiplier)
                                //var multiplierFraction = new Fraction(m.top,m.bottom)
                                //var finalFraction = props.tunebook.abcTools.asFraction.multiply(multiplierFraction)
                                handleFraction(finalFraction)
                                //newAbc.push(symbol + modifier + props.tunebook.abcTools.abcFraction(finalFraction.numerator, finalFraction.denominator))
                                c = c + result.symbolsUsed  + 2
                                
                            // first extra letter isn't an octave modifier
                            } else {
                                if (c < abc.length + 2) {
                                    nextNextSymbol = abc[c+2]
                                    if (c < abc.length + 3) {
                                        nextNextNextSymbol = abc[c+3]
                                        if (c < abc.length + 4) {
                                        nextNextNextSymbol = abc[c+4]
                                        }
                                        if (c < abc.length + 5) {
                                            nextNextNextNextSymbol = abc[c+5]
                                        }   
                                    }
                                }
                                var result = symbolsToFraction(nextSymbol, nextNextSymbol,nextNextNextSymbol,nextNextNextNextSymbol) 
                                var finalFraction = new Fraction(parseInt(result.number.top),parseInt(result.number.bottom))
                                //var m = props.tunebook.abcTools.decimalToFraction(multiplier)
                                //var multiplierFraction = new Fraction(parseInt(m.top),parseInt(m.bottom))
                                //var finalFraction = props.tunebook.abcTools.asFraction.multiply(multiplierFraction)
                                handleFraction(finalFraction, symbol + modifier + abcFraction(finalFraction.numerator, finalFraction.denominator))
                                
                                //newAbc.push(symbol + modifier + props.tunebook.abcTools.abcFraction(finalFraction.numerator, finalFraction.denominator))
                                c = c + result.symbolsUsed  + 1
                            }
                        // just the note with no following letters
                        } else {
                            var finalFraction=getNoteLengthFraction()
                            handleFraction(finalFraction, symbol)
                            //newAbc.push(symbol)
                            c++
                        }
                    // not a note, push the letter through 
                    } else if (inQuote && symbol !== '"') {
                        //console.log('in quote',symbol)
                        var noteLength = getNoteLengthFraction()
                        var adjusted = measureTotals[lineNumber][mk].divide(noteLength)
                        var beatNumber = Math.floor(adjusted.numerator / adjusted.denominator)
                        if (!Array.isArray(chords[lineNumber][mk][beatNumber])) {
                            chords[lineNumber][mk][beatNumber] = []
                        }
                        chords[lineNumber][mk][beatNumber].push(symbol)
                        c++
                    } else {
                        if (symbol !== '\"') {
                            var noteLength = getNoteLengthFraction()
                            var adjusted = measureTotals[lineNumber][mk].divide(noteLength)
                            var beatNumber = Math.floor(adjusted.numerator / adjusted.denominator)
                            if (!Array.isArray(preText[lineNumber][mk][beatNumber])) {
                                preText[lineNumber][mk][beatNumber] = []
                            }
                            preText[lineNumber][mk][beatNumber].push(symbol)
                        }
                        //newAbc.push(symbol)
                        c++
                    }
                  }
                  //m.abc = newAbc.join('')
                  //return m 
                })
                
                
            }
        }) 
        //console.log('PARSE',measureBeats)
        //console.log('CHORDS',chords)
        //console.log('pretext',preText)
        return [measureTotals,measureBeats, chords, preText]
        //return generateAbcFromMeasures(newMeasures)
    }
    
    function generateNotesFromChords(chords, tune, meter, noteLengthFraction, saveTune) {
        //console.log("merge",origNotes,"NNN",props.notes)
        //return
        
        //const parsed = parseAbcToBeats(origNotes) 
        //var [totals, notes, chordArray, preTexts] = parsed
        //console.log({totals, notes, chordArray: JSON.stringify(chordArray)})
        var chordArray = []
        var notes = []
        var preTexts = [] 
        ////var noteLength = getNoteLengthFraction()
        var meterParts = (meter && meter.trim().split("/").length === 2 ) ? meter.trim().split("/") : ['4','4']
        //if (meterParts.length === 2) {
        console.log(meterParts)
        var chordTextParsed = parseChordText(chords,meter,noteLengthFraction)
        //console.log( "ORIG",JSON.stringify(chordArray),"PARSED",JSON.stringify(chordTextParsed)) //,"DIFF",patienceDiff(JSON.stringify(chordArray), JSON.stringify(chordTextParsed)))
         //iterate parsed chords, applying changes to orig chords and adding notes(as rests) if not present
        chordTextParsed.map(function(line, lineNumber) {
            line.map(function(bar,bk) {
                var meterFraction = new Fraction(meterParts[0],meterParts[1])
                var noteLengthsPerBar = meterFraction.divide(noteLengthFraction).numerator
                 //console.log(meterParts,"BAR",lineNumber, bk,"/",noteLengthsPerBar, bar)
                 if (!Array.isArray(chordArray[lineNumber])) chordArray[lineNumber] = []
                 if (!Array.isArray(chordArray[lineNumber][bk])) chordArray[lineNumber][bk] = []
                 // take the whole bar of chords
                 chordArray[lineNumber][bk] = bar
                 //console.log("BBB",bar)
                 // if more chords than notes add notes as rests to fill
                 if (!Array.isArray(notes[lineNumber])) notes[lineNumber]=[]
                 if (!Array.isArray(notes[lineNumber][bk])) {
                     notes[lineNumber][bk] = Array(noteLengthsPerBar + 1)
                     for (var k = 0; k < noteLengthsPerBar; k++) {
                        notes[lineNumber][bk][k] = ['z']
                     }
                     notes[lineNumber][bk][noteLengthsPerBar] = ["|"]
                    //  notes[lineNumber][bk] = [['z']]
                 } 
                 // ensure tailing bar line
                 //if (bk === (line.length - 1)) {
                     //var lastBeatNumber = notes[lineNumber][bk].length - 1
                     //var lastBeat = notes[lineNumber][bk][lastBeatNumber]
                     //var barPos = lastBeat.indexOf('|')
                     //console.log('ensure',lineNumber,bk, lastBeatNumber,lastBeat,"P",barPos ,"N", notes[lineNumber][bk])
                     //if (barPos === -1) {
                        //notes[lineNumber][bk][noteLengthsPerBar-1].push("|")
                     //}
                 //}
                })
            })
            var final = renderAllChordsAndNotes(chordArray, notes, preTexts).split("\n")
            //console.log( "chords",JSON.stringify(chordArray))
            //console.log("notes",JSON.stringify(notes))
            //console.log("FINAL",final) 
            // update the first voice
            var voices = tune.voices
            if (Object.keys(voices).length > 0) {
                voices[Object.keys(voices)[0]] = {
                    meta:'',
                    notes: final
                }
            // create a voice if none exist
            } else {
                voices = {1: {
                    meta:'',
                    notes: final
                }}
            }
            tune.voices = voices
            saveTune(tune) 
            
            //console.log("O",origNotes,"P",chordTextParsed, "D",patienceDiff(origNotes, final) )
            console.log("F", final)
        //} else {
            //console.log("Ff missing/invalid meter")
        //}
    }
    
   
    return {renderAllChordsAndNotes, renderChords, parseChordText, parseAbcToBeats, generateNotesFromChords}
}
