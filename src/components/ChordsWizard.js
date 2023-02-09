import {Button, Form} from 'react-bootstrap'
import {useState, useEffect} from 'react'
import abcjs from 'abcjs'
import {Fraction} from '../Fraction'
import patienceDiff from '../patienceDiff'

export default function ChordsWizard(props) {
    const [chords, setChords] = useState(props.chords)
    //const [timeSignature, setTimeSignature] = useState(props.timeSignature ? timeSignature : '4/4')
    const allowedChordSites = "site:https://tabs.ultimate-guitar.com OR site:https://www.azchords.com/ OR site:https://www.chordsbase.com/ OR site:https://www.chords-and-tabs.net/ OR site:https://akordy.kytary.cz/ OR site:https://www.guitaretab.com/"
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


    function doMergeChordsIntoNotes(origNotes) {
        //console.log("merge",origNotes,props.notes)
        //return
        
        const parsed = props.tunebook.abcTools.parseAbcToBeats(origNotes)
        var [totals, notes, chordArray, preTexts] = parsed
        //console.log({totals, notes, chordArray, chords})
        //var noteLength = getNoteLengthFraction()
        var meterParts = props.tune && props.tune.meter ? props.tune.meter.trim().split("/") : ['4','4']
        if (meterParts.length === 2) {
            //console.log(meterParts)
            var chordTextParsed = props.tunebook.abcTools.parseChordText(chords,props.tune.meter,props.tune)
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
            
            var final = props.tunebook.abcTools.renderAllChordsAndNotes(chordArray, notes, preTexts).split("\n")
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
    
    function mergeChordsIntoNotes() {
        var origNotes = Array.isArray(props.notes) ? props.notes.join("\n") : ''
        return doMergeChordsIntoNotes(origNotes)
    }
    
    function generateNotesFromChords() {
        var origNotes = ''
        return doMergeChordsIntoNotes(origNotes)
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
            <Button variant="warning" style={{float:'right', marginRight:'0.2em'}} onClick={function(e) {if (window.confirm('Do you really want to merge these chords into your music? This may not work as expected!!')) {mergeChordsIntoNotes()}}} >3. Merge</Button>
            <Button variant="success" style={{float:'right', marginRight:'0.2em'}} onClick={function(e) {if (window.confirm('Do you really want to reset your music and regenerate from these chords? Any melody notes will be lost !!')) {generateNotesFromChords()}}} >3. Generate Music</Button>
            <Button variant="info" style={{float:'right', marginRight:'2em'}} onClick={function(e) {
                setChords(props.tunebook.utils.cleanupChords(chords))
            } } >2. Clean Text</Button>
             <a style={{float:'right', marginRight:'2em'}}  target="_new" href={"https://www.google.com/search?q=chords " + '"' +tune.name + '"' + ' '+(tune.composer ? '"' + tune.composer+ '"' : '')  +  " " + allowedChordSites } ><Button>1. Search Chords</Button></a>
            <Form.Label>Time Signature</Form.Label>
            <Form.Control type="text" placeholder="eg 4/4" value={tune.meter ? tune.meter : ''} onChange={function(e) {tune.meter = e.target.value;  props.saveTune(tune)  }}  />
            <Form.Label>Repeats</Form.Label>
            <Form.Control type="text" placeholder="eg 100" value={tune.repeats ? tune.repeats : ''} onChange={function(e) {tune.repeats = e.target.value; tune.id = props.tuneId;  props.saveTune(tune)  }}  />
        </Form.Group>
                      
        <Form.Control disabled={(tune.meter ? false : true)} style={{height:'20em'}} as="textarea" placeholder={"eg \nC|F# C|Cmin . . G |Cb\nD|D|A D . A |C"} value={chords} onChange={function(e) {setChords(e.target.value); }}  />
        
    </div>
}
//<Button style={{float:'right'}} disabled={tune.meter ? false : true}  onClick={mergeChordsIntoNotes} variant="success" >Save</Button>
        
