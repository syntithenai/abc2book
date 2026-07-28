import abcjs from 'abcjs'
import useAbcTools from './useAbcTools'
import useUtils from './useUtils'
import { chordParserFactory, chordRendererFactory } from 'chord-symbol';
import { getBarModel, normalizeMeter, beatPositionsForBarChords as barModelBeatPositions } from './barModel'
import { normalizeChordChartRepeatMarks } from './chordSheetUtils'

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
        var parts = abc.split("\n")
        var meterText = null
        for (var partKey in parts) {
            var part = parts[partKey]
            if (part.startsWith('L:')) {
                var found = part.slice(2).trim()
                var foundParts = found.split("/")
                if (foundParts.length === 2 && foundParts[0] !== '' && foundParts[1] !== '') {
                    // an explicit, valid unit note length always wins
                    return foundParts[0]/foundParts[1]
                }
            } else if (part.startsWith('M:') && meterText === null) {
                meterText = part.slice(2).trim()
            }
        }
        // No explicit L: field. Apply the ABC standard default which depends on
        // the meter: if the meter is less than 0.75 the unit note length is 1/16,
        // otherwise it is 1/8. abcjs parses durations using this same rule, so
        // render() must match it or every note length is scaled incorrectly.
        return meterToDefaultNoteLength(meterText)
    }

    /**
     * Compute the default unit note length (as a decimal) for a meter when no
     * explicit L: field is present, following the ABC standard / abcjs behaviour.
     */
    function meterToDefaultNoteLength(meterText) {
        var meterValue = 1
        if (meterText) {
            var trimmed = meterText.trim()
            if (trimmed === 'C' || trimmed === 'C|') {
                meterValue = 1
            } else if (trimmed === 'none' || trimmed === '') {
                meterValue = 1
            } else {
                var meterParts = trimmed.split("/")
                if (meterParts.length === 2 && meterParts[1] !== '0' && meterParts[1] !== '') {
                    meterValue = parseFloat(meterParts[0]) / parseFloat(meterParts[1])
                }
            }
        }
        if (!isFinite(meterValue) || meterValue <= 0) {
            meterValue = 1
        }
        return meterValue < 0.75 ? 0.0625 : 0.125
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
                            } else if (symbol.rest && (symbol.rest.type === 'rest' || symbol.rest.type === 'whole') && symbol.duration > 0) {
                                // abcjs reports a rest filling an entire bar as type
                                // 'whole' rather than 'rest'; both round-trip to z
                                note = 'z' + durationToNoteLength(symbol.duration, noteLength)
                            } else if (symbol.rest && symbol.rest.type === 'invisible' && symbol.duration > 0) {
                                note = 'x' + durationToNoteLength(symbol.duration, noteLength)
                            } else if (symbol.rest && symbol.rest.type === 'multimeasure') {
                                note = 'Z' + (symbol.rest.text > 1 ? symbol.rest.text : '')
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
        if (transpose > 0 || transpose < 0) {
            renderOptions.transposeValue = Number(transpose)
        }
        var renderChord = chordRendererFactory(renderOptions);
        var renderedChord = renderChord(parsedChord)
        
        var parsedKey = parseChord(key)
        var keyRenderOptions = { useShortNamings: true }
        if (transpose > 0 || transpose < 0) {
            keyRenderOptions.transposeValue = Number(transpose)
        }
        var renderKey = chordRendererFactory(keyRenderOptions);
        var renderedKey = renderKey(parsedKey)
        
        var renderedChord2 = utils.canonicalChordForKey(renderedKey,renderedChord)
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
        var final = []
        var noteLengthsSinceLastBar = 0
        var hasWrittenBar = false
        var fullBarDuration = barSize * noteLength
        // Display charts only: carry |: / [1 / [2 onto the next written bar.
        var pendingStartRepeat = false
        var pendingEndingLabel = null
        
        function writeBar(barLayout, closeBarline) {
            var close = closeBarline || '|'
            var chunks = []
            if (!showDots) {
                if (pendingStartRepeat) {
                    chunks.push('|:')
                    pendingStartRepeat = false
                }
                if (pendingEndingLabel !== null && pendingEndingLabel !== undefined && pendingEndingLabel !== '') {
                    chunks.push('[' + String(pendingEndingLabel))
                    pendingEndingLabel = null
                }
            }
            for (var i=0; i < barSize; i++) {
               if (Array.isArray(barLayout[i]) && barLayout[i].length > 0) {
                    // push the chords on beat i
                    chunks.push(barLayout[i].join(' ').trim())
                } else {
                    if (showDots) {
                        chunks.push(".")
                    }
                }
             }
            // One final[] entry per bar (content + close) so join(' ') cannot
            // insert spaces inside |: / :| / :|: markers.
            var body = chunks.filter(Boolean).join(' ').trim()
            final.push(body ? (body + ' ' + close) : close)
        }
        
        abc[0].lines.forEach(function(line, lineNumber) {
            //line.staff[0].voices.forEach(function(symbols, voiceNumber) {
                if (line && Array.isArray(line.staff) && line.staff.length > 0) {
                    var symbols = line.staff[0].voices[0]
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
                       if (symbol.el_type === 'tempo' && symbol.bpm > 0) {
                            final.push('[Q:' + symbol.bpm + ']')
                       } else if (symbol.el_type === 'timeSignature' && symbol.value && symbol.value[0]) {
                            var nextMeter = String(symbol.value[0].num) + '/' + String(symbol.value[0].den)
                            meter = normalizeMeter(nextMeter)
                            noteLength = getNoteLengthDecimal("L:"+noteLengthText+"\nM:"+meter)
                            barSize = abcTools.getNoteLengthsPerBar(noteLengthText, meter)
                            fullBarDuration = barSize * noteLength
                            final.push('[M:' + meter + ']')
                            barLayout = []
                            for (var mi = 0; mi < barSize; mi++) {
                                barLayout.push([])
                            }
                            noteLengthsSinceLastBar = 0
                       } else if (symbol.el_type === 'note') {
                            // assign note chord to bar layout
                            if (Array.isArray(symbol.chord) && symbol.chord.length > 0) {
                                symbol.chord.forEach(function(chordT) {
                                    chordT.name.trim().split("\n").forEach(function(chord) {
                                        var renderedChord2 = cleanChord(key, chord, transpose)
                                    
                                        var assignChordToBeat = Math.round(noteLengthsSinceLastBar / noteLength)
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
                            }
                       } else if (symbol.el_type === 'bar') {
                           // Display charts omit the opening anacrusis (pickup) bar so
                           // chord blocks start on the first full bar. Editor grids
                           // (showDots) keep it so pickup chords remain editable.
                           var isAnacrusis = !hasWrittenBar
                             && noteLengthsSinceLastBar > 0
                             && noteLengthsSinceLastBar < fullBarDuration - 1e-9
                           // Display charts also omit bars with no notes or rests
                           // (empty between barlines). Rest-only bars still render.
                           var isEmptyBar = noteLengthsSinceLastBar <= 0
                           var closeBarline = '|'
                           if (symbol.type === 'bar_right_repeat') closeBarline = ':|'
                           else if (symbol.type === 'bar_dbl_repeat') closeBarline = ':|:'
                           if (!showDots) {
                               if (!isAnacrusis && !isEmptyBar) writeBar(barLayout, closeBarline)
                               // Hymns often start the chorus with |: rather than ||.
                               // Emit a blank line so verse/chorus become separate blocks.
                               if (symbol.type === 'bar_left_repeat') {
                                   pendingStartRepeat = true
                                   if (hasWrittenBar) {
                                       final.push("\n")
                                   }
                               } else if (symbol.type === 'bar_dbl_repeat') {
                                   // :|: ends one repeat and starts the next.
                                   pendingStartRepeat = true
                               }
                               // startEnding applies to the following bar's content.
                               if (symbol.startEnding !== null && symbol.startEnding !== undefined
                                   && String(symbol.startEnding) !== ''
                                   && Number(symbol.startEnding) > 0) {
                                   pendingEndingLabel = symbol.startEnding
                               }
                           } else {
                               writeBar(barLayout)
                           }
                           hasWrittenBar = true
                           noteLengthsSinceLastBar = 0
                           barLayout = []
                            for (var i=0; i < barSize; i++) {
                                barLayout.push([])
                            }
                    }
                }) 
                if (lastSymbol && lastSymbol.el_type == 'bar') {
                    final.push("\n")
                    if (lastSymbol.type === 'bar_thin_thin') {
                       final.push("\n" )
                    }
                } else if (lastSymbol && lastSymbol.el_type !== 'bar') {
                    if (showDots || noteLengthsSinceLastBar > 0) {
                        writeBar(barLayout)
                    }
                    final.push("\n")
                 
                }
            }
        }) 
        return normalizeChordChartRepeatMarks(final.join(' ').replaceAll("\n ","\n"))
    }
    
    /**
     * Parse an abc string into abcjs object format
     */
    function parse(abc) {
        return abcjs.renderAbc("*", abc)
    }
    
    /**
     * Prefer chordSheetAlignment anchors for beat placement within a bar.
     * Falls back to even token distribution or compound beat centers via getBarModel.
     */
    function beatPositionsForBarChords(barChords, noteLengthsPerBar, anchors, lyricWordCount, barModel) {
        var model = barModel || getBarModel('4/4', '1/8')
        if (noteLengthsPerBar && noteLengthsPerBar !== model.unitSlotsPerBar) {
            model = Object.assign({}, model, { unitSlotsPerBar: noteLengthsPerBar })
        }
        return barModelBeatPositions(barChords, model, anchors, lyricWordCount)
    }

    function alignmentHintsForChordLine(alignment, chordLineIndex) {
        if (!Array.isArray(alignment) || alignment.length === 0) return null
        var chordLineCounter = -1
        for (var bi = 0; bi < alignment.length; bi++) {
            var block = alignment[bi]
            var pairs = block && Array.isArray(block.linePairs) ? block.linePairs : []
            for (var pi = 0; pi < pairs.length; pi++) {
                var pair = pairs[pi]
                var chordLines = pair && Array.isArray(pair.chordLines) ? pair.chordLines : []
                if (chordLines.length === 0) continue
                for (var ci = 0; ci < chordLines.length; ci++) {
                    chordLineCounter += 1
                    if (chordLineCounter === chordLineIndex) {
                        var lyricTokens = pair.lyricTokens || []
                        return {
                            anchors: Array.isArray(pair.anchors) ? pair.anchors : [],
                            wordCount: lyricTokens.length || String(pair.lyricLine || '').trim().split(/\s+/).filter(Boolean).length,
                        }
                    }
                }
            }
        }
        return null
    }

    /**
     * Parse an string containing compressed chord format 
     * into an object representing the lines, bars and timing of the chords.
     * Supports inline [M:x/y] and [Q:…] tokens that change meter/tempo for following bars.
     * @returns {{ lines: array, meterByBarKey: object, tempoByBarKey: object, initialMeter: string, initialTempo: number|null }}
     */
    function parseChordText(chordText, abcString, alignment) {
        var abcJson = abcTools.abc2json(abcString)
        var noteLengthText = abcJson.noteLength ? abcJson.noteLength : '1/8'
        var currentMeter = normalizeMeter(abcJson.meter || '4/4')
        var currentTempo = abcTools.cleanTempo(abcJson.tempo) || null
        var barModel = getBarModel(currentMeter, noteLengthText)
        var noteLengthsPerBar = barModel.unitSlotsPerBar
        var key = abcTools.getMetaValueFromAbc('K',abcString)
        var result = []
        var meterByBarKey = {}
        var tempoByBarKey = {}
        var initialMeter = currentMeter
        var initialTempo = currentTempo
        if (chordText && chordText.trim()) {
            var lines = chordText.trim().split("\n")
            var nonEmptyChordLineIndex = -1
            lines.forEach(function(line,lineNumber) {
              if (!Array.isArray(result[lineNumber])) result[lineNumber] = []
              var cleanLine = line.trim()
              if (cleanLine.endsWith('||')) {
                  cleanLine = cleanLine.slice(0, -2)
              } else if (cleanLine.endsWith('|')) {
                  cleanLine = cleanLine.slice(0, -1)
              }
              var bars = cleanLine.split("|")
              var lineHasChords = bars.some(function(bar) { return typeof bar === 'string' && bar.trim() })
              if (lineHasChords) nonEmptyChordLineIndex += 1
              var hints = lineHasChords ? alignmentHintsForChordLine(alignment, nonEmptyChordLineIndex) : null
              var flatAnchors = hints && hints.anchors ? hints.anchors.slice() : []
              var anchorCursor = 0
              bars.forEach(function(bar,bk) {
                  if (typeof bar === 'string' && bar.trim()) {
                    var meterMatch = /\[M:\s*([^\]]+)\]/i.exec(bar)
                    if (meterMatch) {
                      currentMeter = normalizeMeter(meterMatch[1])
                      barModel = getBarModel(currentMeter, noteLengthText)
                      noteLengthsPerBar = barModel.unitSlotsPerBar
                      if (lineNumber === 0 && bk === 0) initialMeter = currentMeter
                    }
                    var tempoMatch = /\[Q:\s*([^\]]+)\]/i.exec(bar)
                    if (tempoMatch) {
                      var parsedTempo = abcTools.cleanTempo(tempoMatch[1])
                      if (parsedTempo > 0) {
                        currentTempo = parsedTempo
                        if (lineNumber === 0 && bk === 0) initialTempo = currentTempo
                      }
                    }
                    meterByBarKey[lineNumber + '-' + bk] = currentMeter
                    if (currentTempo > 0) tempoByBarKey[lineNumber + '-' + bk] = currentTempo
                    var barWithoutMeta = bar
                      .replace(/\[M:\s*[^\]]+\]/gi, ' ')
                      .replace(/\[Q:\s*[^\]]+\]/gi, ' ')
                      .trim()
                    if (!barWithoutMeta) {
                      result[lineNumber][bk] = {}
                      return
                    }
                    // cull empties and ensure valid chords
                    var barChords = barWithoutMeta.split(" ").filter(function(val) {if (!val || !val.trim()) return false; else return true}).map(function(chord) {
                        var clean = cleanChord(key, chord)
                        return clean
                    })
                    var barAnchors = []
                    if (flatAnchors.length > 0) {
                        barAnchors = flatAnchors.slice(anchorCursor, anchorCursor + barChords.length)
                        anchorCursor += barChords.length
                    }
                    var positions = beatPositionsForBarChords(
                        barChords,
                        noteLengthsPerBar,
                        barAnchors,
                        hints ? hints.wordCount : 0,
                        barModel
                    )
                    var newChords = {}
                    barChords.forEach(function(barToken, barTokenKey) {
                        var position = positions[barTokenKey]
                        if (barChords[barTokenKey].replaceAll('.','').trim().length !== 0)  {
                            if (!Array.isArray(newChords[position])) {
                                newChords[position] = []
                            }  
                            newChords[position].push(barChords[barTokenKey])  
                        }
                    })
                  
                    result[lineNumber][bk] = newChords
                  }
              })
            
            })
        }
        return {
          lines: result,
          meterByBarKey: meterByBarKey,
          tempoByBarKey: tempoByBarKey,
          initialMeter: initialMeter,
          initialTempo: initialTempo,
        }
    }
    
    /**
     * Merge compressed chord text into an abcString
     * and return the updated abcString.
     * Optional alignment (chordSheetAlignment) prefers anchor-based beat placement.
     * Inline [M:…] tokens switch bar size and are written into the ABC voice.
     */
    function  mergeChords(chordText, abcString, alignment) {
        var parsedChords = parseChordText(chordText, abcString, alignment)
        var chordLayout = parsedChords.lines
        var meterByBarKey = parsedChords.meterByBarKey || {}
        var tempoByBarKey = parsedChords.tempoByBarKey || {}
        var abc = parse(abcString)
        var abcJson = abcTools.abc2json(abcString)
        var noteLengthText = abcJson.noteLength ? abcJson.noteLength : '1/8'
        var meter = normalizeMeter(parsedChords.initialMeter || abcJson.meter || '4/4')
        if (parsedChords.initialTempo > 0) {
            abcJson.tempo = parsedChords.initialTempo
        }
        var noteLength = getNoteLengthDecimal("L:"+noteLengthText+"\nM:"+meter)
        var barSize = abcTools.getNoteLengthsPerBar(noteLengthText, meter)
        function meterState(meterText) {
            var m = normalizeMeter(meterText || meter)
            var nl = getNoteLengthDecimal("L:"+noteLengthText+"\nM:"+m)
            var bs = abcTools.getNoteLengthsPerBar(noteLengthText, m)
            return { meter: m, noteLength: nl, barSize: bs }
        }
        function timeSignatureSymbol(meterText) {
            var parts = normalizeMeter(meterText).split('/')
            return {
              el_type: 'timeSignature',
              type: 'specified',
              value: [{ num: parseInt(parts[0], 10) || 4, den: parseInt(parts[1], 10) || 4 }],
            }
        }
        function tempoSymbol(bpm) {
            return {
              el_type: 'tempo',
              type: 'tempo',
              bpm: bpm,
              duration: [0.25],
              preString: '',
              preStringRaw: '',
            }
        }
        if (barSize > 0) {
            var final = []
            var noteLengthsSinceLastBar = 0
            var barIndex = {} 

            // abcjs collapses a rest filling an entire bar into a single
            // symbol (rest.type 'whole'). Split it into beat-sized rests so
            // incoming chords can be placed mid-bar, not just on beat one.
            // Also insert inline time signatures from the chord grid.
            var voiceMeter = normalizeMeter(abcJson.meter || meter)
            abc[0].lines.forEach(function(line, lineNumber) {
                if (line && line.staff && line.staff.length > 0) {
                    var voice = line.staff[0].voices[0]
                    for (var i = voice.length - 1; i >= 0; i--) {
                        var symbol = voice[i]
                        if (symbol.el_type === 'note' && symbol.rest && symbol.rest.type === 'whole' && symbol.duration > 0) {
                            var restMeter = meterByBarKey[lineNumber + '-' + '0'] || voiceMeter
                            var restState = meterState(restMeter)
                            var restCount = Math.max(1, Math.round(symbol.duration / restState.noteLength))
                            var rests = []
                            for (var j = 0; j < restCount; j++) {
                                rests.push({rest: {type: 'rest'}, el_type: 'note', duration: restState.noteLength})
                            }
                            voice.splice.apply(voice, [i, 1].concat(rests))
                        }
                    }
                }
            })

            // iterate parsed note and bar lines to create lookups 
            // per line/bar/beat to symbol number
            abc[0].lines.forEach(function(line,lineNumber) {
                var barCount = 0
                var barTally = 0
                var lineMeter = voiceMeter
                if (line && line.staff && line.staff.length > 0) {
                    line.staff[0].voices[0].forEach(function(symbol, symbolNumber) {
                        var indexKey = lineNumber + "-" + barCount + '-' + barTally
                        if (!Array.isArray(barIndex[indexKey])) barIndex[indexKey] = []
                        if (symbol.el_type === 'timeSignature' && symbol.value && symbol.value[0]) {
                            lineMeter = normalizeMeter(String(symbol.value[0].num) + '/' + String(symbol.value[0].den))
                            noteLength = meterState(lineMeter).noteLength
                        } else if (symbol.el_type === 'note') {
                            barIndex[indexKey].push(symbolNumber)
                            if (symbol.duration > 0) barTally = barTally + (symbol.duration/noteLength)
                        } else if (symbol.el_type === 'bar') {
                            barCount++
                            barTally = 0
                        }
                        // clear chords
                        abc[0].lines[lineNumber].staff[0].voices[0][symbolNumber].chord = []
                    })
                }
            })
           
            
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
            function barSymbolForLine(lineIndex, barNumber, barsOnLine) {
                var isLastBarOnLine = barNumber === barsOnLine - 1;
                return (isLastBarOnLine && lineNewLines[lineIndex])
                    ? { type: 'bar_thin_thin', el_type: 'bar' }
                    : { type: 'bar_thin', el_type: 'bar' };
            }

            function barSizeFor(lineIndex, barNumber) {
                var key = lineIndex + '-' + barNumber
                var m = meterByBarKey[key] || meter
                return meterState(m).barSize
            }

            function noteLengthFor(lineIndex, barNumber) {
                var key = lineIndex + '-' + barNumber
                var m = meterByBarKey[key] || meter
                return meterState(m).noteLength
            }

            var lastEmittedMeter = normalizeMeter(abcJson.meter || meter)
            var lastEmittedTempo = abcTools.cleanTempo(abcJson.tempo) || null

            if (chordLength > parsedLength) {
                // create lines
                for (var i = 0; i < (chordLength - parsedLength); i++) {
                    var restLine = []
                    var lineIndex = parsedLength + i
                    var barsToCreate = chordLinesNotEmpty[lineIndex].length
                    for (var k = 0; k < barsToCreate; k++) {
                        var restChord = chordLinesNotEmpty[lineIndex][k]
                        var createMeter = meterByBarKey[lineIndex + '-' + k] || meter
                        if (normalizeMeter(createMeter) !== lastEmittedMeter) {
                            restLine.push(timeSignatureSymbol(createMeter))
                            lastEmittedMeter = normalizeMeter(createMeter)
                        }
                        var createTempo = tempoByBarKey[lineIndex + '-' + k]
                        if (createTempo > 0 && createTempo !== lastEmittedTempo) {
                            restLine.push(tempoSymbol(createTempo))
                            lastEmittedTempo = createTempo
                        }
                        var createBarSize = barSizeFor(lineIndex, k)
                        var createNoteLength = noteLengthFor(lineIndex, k)
                        for (var j = 0; j< createBarSize; j++) {
                            var r = {rest: {type:'rest'}, el_type:'note', duration: createNoteLength}
                            if (restChord && Array.isArray(restChord[j])) r.chord = restChord[j].map(function(c) {return {name: c}})
                            restLine.push(r)
                        }
                        restLine.push(barSymbolForLine(lineIndex, k, barsToCreate))
                    }
                    
                    //var totalBars = 0
                    //var totalRests = 0
                    //for var
                    abc[0].lines.push({staff:[{voices:[restLine]}]})
                }
            } else if (chordLength < parsedLength) {
                // chop lines
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
                    abc[0].lines[lineNumber].staff[0].voices[0].push(lineNewLines[lineNumber] ? {type:'bar_thin_thin', el_type:'bar'} : {type:'bar_thin', el_type:'bar'})
                } else {
                    // if lineNewLine force double bar
                    var barLine = abc[0].lines[lineNumber].staff[0].voices[0][lastSymbolNumber]
                    barLine.type = lineNewLines[lineNumber] ? 'bar_thin_thin' : 'bar_thin'
                    abc[0].lines[lineNumber].staff[0].voices[0].splice(lastSymbolNumber,1,barLine)
                    //push(lineNewLines[lineNumber] ? {type:'bar_thin_thin', el_type:'bar'} : {type:'bar_thin', el_type:'bar'})
                    //}
                }
                var barsInChordText = chordLinesNotEmpty[lineNumber].length
                var barCountDiff = barsInChordText - barCount
                if (barCountDiff > 0) {
                    // add bars
                    for (var k = 0; k < barCountDiff; k++) {
                        var restChord = chordLinesNotEmpty[lineNumber][barCount + k]
                        var addMeter = meterByBarKey[lineNumber + '-' + (barCount + k)] || meter
                        if (normalizeMeter(addMeter) !== lastEmittedMeter) {
                            abc[0].lines[lineNumber].staff[0].voices[0].push(timeSignatureSymbol(addMeter))
                            lastEmittedMeter = normalizeMeter(addMeter)
                        }
                        var addBarSize = barSizeFor(lineNumber, barCount + k)
                        var addNoteLength = noteLengthFor(lineNumber, barCount + k)
                        for (var j = 0; j< addBarSize; j++) {
                            var r = {rest: {type:'rest'}, el_type:'note', duration: addNoteLength}
                            if (restChord[j]) r.chord = restChord[j].map(function(c) {return {name: c}})
                            abc[0].lines[lineNumber].staff[0].voices[0].push(r)
                        }
                        abc[0].lines[lineNumber].staff[0].voices[0].push(
                            barSymbolForLine(lineNumber, barCount + k, barsInChordText)
                        )
                    }
                    //var totalBars = 0
                    //var totalRests = 0
                    //for var
                    //abc[0].lines.push({staff:[{voices:[restLine]}]})
                } else if (barCountDiff < 0) {
                    // remove bars
                    var removeBarsAfter = barCount + barCountDiff - 1
                    var barLineIndex = barEnds[removeBarsAfter] + 1
                    abc[0].lines[lineNumber].staff[0].voices[0] = abc[0].lines[lineNumber].staff[0].voices[0].slice(0,barLineIndex) 
                }
            })

            // Inject missing time signatures at bar starts from the chord grid meters.
            lastEmittedMeter = normalizeMeter(abcJson.meter || meter)
            abc[0].lines.forEach(function(line, lineNumber) {
                if (!line || !line.staff || !line.staff[0] || !line.staff[0].voices) return
                var voice = line.staff[0].voices[0]
                var barNumber = 0
                var insertAt = []
                voice.forEach(function(symbol, symbolNumber) {
                    if (symbol.el_type === 'timeSignature' && symbol.value && symbol.value[0]) {
                        lastEmittedMeter = normalizeMeter(String(symbol.value[0].num) + '/' + String(symbol.value[0].den))
                    }
                    if (symbol.el_type === 'tempo' && symbol.bpm > 0) {
                        lastEmittedTempo = symbol.bpm
                    }
                    if (symbol.el_type === 'bar') {
                        barNumber += 1
                        return
                    }
                    if (symbol.el_type !== 'note') return
                    // First note of a bar: ensure meter/tempo markers if grid requests a change.
                    var prevIsBarOrStart = symbolNumber === 0 || (voice[symbolNumber - 1] && (
                        voice[symbolNumber - 1].el_type === 'bar'
                        || voice[symbolNumber - 1].el_type === 'timeSignature'
                        || voice[symbolNumber - 1].el_type === 'tempo'
                    ))
                    if (!prevIsBarOrStart) return
                    var wantMeter = meterByBarKey[lineNumber + '-' + barNumber]
                    var wantTempo = tempoByBarKey[lineNumber + '-' + barNumber]
                    var insertIndex = symbolNumber
                    if (wantMeter && normalizeMeter(wantMeter) !== lastEmittedMeter) {
                        if (!(voice[symbolNumber - 1] && voice[symbolNumber - 1].el_type === 'timeSignature')) {
                            insertAt.push({ index: insertIndex, kind: 'meter', meter: wantMeter })
                            lastEmittedMeter = normalizeMeter(wantMeter)
                        }
                    }
                    if (wantTempo > 0 && wantTempo !== lastEmittedTempo) {
                        if (!(voice[symbolNumber - 1] && voice[symbolNumber - 1].el_type === 'tempo')) {
                            insertAt.push({ index: insertIndex, kind: 'tempo', tempo: wantTempo })
                            lastEmittedTempo = wantTempo
                        }
                    }
                })
                for (var ii = insertAt.length - 1; ii >= 0; ii--) {
                    var item = insertAt[ii]
                    if (item.kind === 'tempo') {
                        voice.splice(item.index, 0, tempoSymbol(item.tempo))
                    } else {
                        voice.splice(item.index, 0, timeSignatureSymbol(item.meter))
                    }
                }
            })

            // Rebuild bar index after structural edits (added bars / time signatures).
            barIndex = {}
            abc[0].lines.forEach(function(line, lineNumber) {
                var barCount = 0
                var barTally = 0
                var lineMeter = normalizeMeter(abcJson.meter || meter)
                noteLength = meterState(lineMeter).noteLength
                if (line && line.staff && line.staff.length > 0) {
                    line.staff[0].voices[0].forEach(function(symbol, symbolNumber) {
                        var indexKey = lineNumber + "-" + barCount + '-' + barTally
                        if (!Array.isArray(barIndex[indexKey])) barIndex[indexKey] = []
                        if (symbol.el_type === 'timeSignature' && symbol.value && symbol.value[0]) {
                            lineMeter = normalizeMeter(String(symbol.value[0].num) + '/' + String(symbol.value[0].den))
                            noteLength = meterState(lineMeter).noteLength
                        } else if (symbol.el_type === 'note') {
                            barIndex[indexKey].push(symbolNumber)
                            if (symbol.duration > 0) barTally = barTally + (symbol.duration / noteLength)
                        } else if (symbol.el_type === 'bar') {
                            barCount++
                            barTally = 0
                        }
                    })
                }
            })
            
            
            var lineCount = 0        
            // iterate incoming chords assigning to parsed abc 
            chordLayout.forEach(function(line,lineNumber) {
                //var addNewLine = false
                
                line.forEach(function(bar,barNumber) {
                    var lastSymbolNumber = null
                    Object.keys(bar).sort(function(a, b) {
                        var fa = parseFloat(a)
                        var fb = parseFloat(b)
                        if (fa < fb) return -1
                        if (fa > fb) return 1
                        return 0
                    }).forEach(function(barKey, barCount) {
                        var chords = bar[barKey]
                        var key = lineCount + "-" + barNumber + "-" + Math.floor(barKey)
                        if (barIndex.hasOwnProperty(key) && barIndex[key] && barIndex[key].length > 0) {
                            var firstNoteSymbolNumber = barIndex[key][0]
                            lastSymbolNumber = firstNoteSymbolNumber
                            abc[0].lines[lineCount].staff[0].voices[0][firstNoteSymbolNumber].chord = chords.reverse().map(function(c) {
                              return {name: c}  
                            })
                        } else {
                            //var akey = lineCount + "-" + barNumber + "-" + Math.floor(barKey * 2) / 2
                            if (lastSymbolNumber !== null) {
                                //barIndex.hasOwnProperty(akey) && barIndex[akey] && barIndex[akey].length > 0) {
                                //var firstNoteSymbolNumber = barIndex[akey][0]
                                var oldChords = abc[0].lines[lineCount].staff[0].voices[0][lastSymbolNumber].chord 
                                
                                chords.reverse().forEach(function(c) {
                                  oldChords.push({name: c} )
                                })
                                abc[0].lines[lineCount].staff[0].voices[0][lastSymbolNumber].chord = oldChords
                            } else {
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
        return final
    }

    /**
     * Merge melody note text into an ABC string while preserving existing chord symbols.
     * The melody draft is the structural source of truth, so inline [M:] meter changes
     * and barlines generated from detected timing survive the merge.
     */
    function mergeMelody(melodyText, abcString) {
        if (!melodyText || !melodyText.trim()) return abcString
        var abcJson = abcTools.abc2json(abcString)
        var header = 'M:' + (abcJson.meter || '4/4') + '\n'
            + 'L:' + (abcJson.noteLength || '1/8') + '\n'
            + 'K:' + (abcJson.key || 'C') + '\n'
        var melodyAbc = header + melodyText
        var melodyParsed = parse(melodyAbc)
        var abc = parse(abcString)
        if (!melodyParsed || !melodyParsed[0] || !abc || !abc[0]) return abcString

        var existingChords = []
        abc[0].lines.forEach(function(line) {
            if (line && line.staff && line.staff.length > 0 && line.staff[0].voices[0]) {
                line.staff[0].voices[0].forEach(function(symbol) {
                    if (symbol.el_type === 'note' && Array.isArray(symbol.chord) && symbol.chord.length > 0) {
                        existingChords.push(symbol.chord)
                    }
                })
            }
        })

        var chordIdx = 0
        melodyParsed[0].lines.forEach(function(line) {
            if (line && line.staff && line.staff.length > 0 && line.staff[0].voices[0]) {
                line.staff[0].voices[0].forEach(function(symbol) {
                    if (symbol.el_type === 'note') {
                        if (chordIdx < existingChords.length) {
                            symbol.chord = existingChords[chordIdx]
                        }
                        chordIdx++
                    }
                })
            }
        })

        return render(melodyParsed, melodyAbc)
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

    /**
     * Combine existing inline chords from abc with new chord-grid text so mergeChords
     * can place the new bars after the current notation instead of from bar one.
     */
    function buildAppendChordGrid(abcString, newChordGrid) {
        var existing = renderChords(abcString, true)
        var existingGrid = existing ? String(existing).trim() : ''
        var newGrid = newChordGrid ? String(newChordGrid).trim() : ''
        if (!newGrid) return existingGrid
        if (!existingGrid) return newGrid
        if (existingGrid.endsWith('\n')) return existingGrid + newGrid
        if (existingGrid.endsWith('|')) return existingGrid + ' ' + newGrid
        return existingGrid + '\n' + newGrid
    }
    
    
    
    return {render,renderChords, parse, mergeChords, mergeMelody, cleanupChords, cleanupLyrics, buildAppendChordGrid}
}
