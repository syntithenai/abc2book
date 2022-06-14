import {Button, Form} from 'react-bootstrap'
import {useState, useEffect} from 'react'
import abcjs from 'abcjs'
import {Fraction} from '../Fraction'
import patienceDiff from '../patienceDiff'

export default function ChordsWizard(props) {
    const [chords, setChords] = useState(props.chords)
    //const [timeSignature, setTimeSignature] = useState(props.timeSignature ? timeSignature : '4/4')
    
    function getNoteLengthsPerBar() {
        return props.tunebook.abcTools.getNoteLengthsPerBar(props.tune)
        //var noteLength = getNoteLengthFraction()
         //var meterParts=props.tune && props.tune.meter ? props.tune.meter.trim().split("/") : ['4','4']
         //if (meterParts.length === 2) {
             //var meterFraction = new Fraction(meterParts[0],meterParts[1])
             //var noteLengthsPerBar = meterFraction.divide(noteLength)
             //return noteLengthsPerBar
        //}
        //return 1
    }
    
    //function renderChords(chords) {
        //return chords.map(function(chordLines,clk) {
            //// iterate bars
                //return chordLines.map(function(chordBeats,cbk) {
                    ////console.log('CBB',cbk,chordBeats)
                    //if (Array.isArray(chordBeats)) {
                        //// iterate beats in bar
                        //var beats= []
                        //for (var clk = 0; clk < chordBeats.length; clk++) {
                            //var chordLetters = chordBeats[clk]
                            ////console.log('B',cbk,clk, chordLetters)
                            //if (chordLetters) {
                            ////return chordBeats.map(function(chordLetters,clk) {
                                //var found = false
                                //for (var i = chordLetters.length; i >= 0; i--) {
                                    //if (!found && props.tunebook.abcTools.isChord(chordLetters.join('').slice(0,i))) {
                                        //beats.push(chordLetters.join('').slice(0,i))
                                        //found = true
                                    //}
                                //}
                                //if (!found)  beats.push('.')
                            //} else {
                                //beats.push('.')
                            //}
                        //}
                        //return beats.join(" ")
                    
                    //} else {
                        //var noteLength = getNoteLengthFraction()
                        //var filler = new Array(noteLength.denominator)
                        //filler.fill('.')
                        //return filler.join(" ")
                    //}
                //}).join("|")
            //}).join("\n")
    //}
    
    function renderAll(chords, notes, preTexts) {
        //console.log("renall",chords, notes)
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
            }).join("\n") //+ "||"
    }
    
    
    function getNoteLengthFraction() {
        //if (props.tune && props.tune.noteLength) {
            //var noteLengthParts = props.tune.noteLength.split("/")
            //if (noteLengthParts == 2) {
                //return new Fraction(noteLengthParts[0],noteLengthParts[1])
            //} else {
                //return new Fraction(1,8)
            //}
        //}
        //return new Fraction(1,8)
        return props.tunebook.abcTools.getNoteLengthFraction(props.tune)
    }
    

    

    //function diff(a, b) {
        //var i = 0;
        //var j = 0;
        //var result = "";
        //while (j < b.length)
        //{
         //if (a[i] != b[j] || i == a.length)
             //result += b[j];
         //else
             //i++;
         //j++;
        //}
        //return result;
    //}

    function mergeChordsIntoNotes() {
        //console.log("merge",props.notes)
        //return
        var origNotes = Array.isArray(props.notes) ? props.notes.join("\n") : ''
        const parsed = props.tunebook.abcTools.parseAbcToBeats(origNotes)
        var [totals, notes, chordArray, preTexts] = parsed
        //console.log({totals, notes, chordArray, chords})
        //var noteLength = getNoteLengthFraction()
        var meterParts = props.tune && props.tune.meter ? props.tune.meter.trim().split("/") : ['4','4']
        if (meterParts.length === 2) {
            //console.log(meterParts)
            var chordTextParsed = parseChordText()
            //console.log( "ORIG",chordArray,"PARSED",chordTextParsed,"DIFF",patienceDiff(JSON.stringify(chordArray), JSON.stringify(chordTextParsed)))
             //iterate parsed chords, applying changes to orig chords and adding notes(as rests) if not present
            chordTextParsed.map(function(line, lineNumber) {
            
                line.map(function(bar,bk) {
                    var meterFraction = new Fraction(meterParts[0],meterParts[1])
                    var noteLengthsPerBar = meterFraction.divide(props.tunebook.abcTools.getNoteLengthFraction()).numerator
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
            
            var final = renderAll(chordArray, notes, preTexts).split("\n")
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
            props.saveTune(tune) 
            
            ////console.log("O",origNotes,"P",chordTextParsed, "D",patienceDiff(origNotes, final) )
            ////console.log("F", final)
        } else {
            console.log("Ff missing/invalid meter")
        }
    }
    
    function parseChordText() {
        //console.log('parseChordText',chords)
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
                var noteLength = getNoteLengthFraction()
                var meterParts=props.tune && props.tune.meter ? props.tune.meter.trim().split("/") : ['4','4']
                if (meterParts.length === 2) {
                    var meterFraction = new Fraction(meterParts[0],meterParts[1])
                    var noteLengthsPerBar = meterFraction.divide(noteLength)
                    
                    var zoom = 1
                    if (barChords.length > 0 && Math.floor(noteLengthsPerBar.numerator / barChords.length) > 0) {
                        zoom = Math.floor(noteLengthsPerBar.numerator / barChords.length) 
                    } else if (noteLengthsPerBar.numerator > 0) {
                        zoom = noteLengthsPerBar.numerator 
                    }
                    var newChords = new Array(noteLengthsPerBar.numerator)
                    //console.log('nc',barChords,barChords.length,noteLengthsPerBar.numerator ,"Z",zoom,newChords.length,newChords)
                    //newChords.fill('.')
                    var count = 0
                    for (var i=0; i < newChords.length; i+= zoom) {
                        if (barChords[count]) newChords[i] = barChords[count].split('')
                        count++
                    }
                    //console.log('NLLP',lineNumber, bk,  "PER BAR",noteLengthsPerBar.numerator, "Z",zoom, "BC", barChords.length,"NEW",newChords)
                    result[lineNumber][bk] = newChords
                }
              }
          })
        })
        //console.log("CHORD TEXT",result)
        return result
    }
    
    useEffect(function() {
        //console.log('voicechange', props.tune.noteLength, props.tune, props.notes)
        if (Array.isArray(props.notes)) { 
            const parsed = props.tunebook.abcTools.parseAbcToBeats(props.notes.join("\n"))
            var [totals, notes, chords, preText] = parsed
            //console.log({totals, notes, chords})
            // iterate lines
            //var final = renderAll(chords, notes)
            var final = props.tunebook.abcTools.renderChords(chords)
            setChords(final)
        }
    },[props.notes])
    
    
    var tune = props.tune
    //console.log(tune)
    return <div>
        <Form.Group  controlId="chordwiz">
        
            <Form.Label>Time Signature</Form.Label>
            <Form.Control type="text" placeholder="eg 4/4" value={tune.meter ? tune.meter : ''} onChange={function(e) {tune.meter = e.target.value;  props.saveTune(tune)  }}  />
            <Form.Label>Repeats</Form.Label>
            <Form.Control type="text" placeholder="eg 100" value={tune.repeats ? tune.repeats : '1'} onChange={function(e) {tune.repeats = e.target.value; tune.id = props.tuneId;  props.saveTune(tune)  }}  />
        </Form.Group>
                      
        <Form.Control disabled={(tune.meter ? false : true)} style={{height:'20em'}} as="textarea" placeholder={"eg \nC|F# C|Cmin . . G |Cb\nD|D|A D . A |C"} value={chords} onChange={function(e) {setChords(e.target.value); }} onBlur={mergeChordsIntoNotes} />
        
    </div>
}
//<Button style={{float:'right'}} disabled={tune.meter ? false : true}  onClick={mergeChordsIntoNotes} variant="success" >Save</Button>
        
