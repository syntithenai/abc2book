import {Button, Form} from 'react-bootstrap'
import {useState, useEffect} from 'react'
import abcjs from 'abcjs'
import {Fraction} from '../Fraction'
import patienceDiff from '../patienceDiff'
//import ChordSheetJS from 'chordsheetjs';
import ParserProblemsDiff from './ParserProblemsDiff'
import useAbcjsParser from '../useAbcjsParser'

export default function ChordsWizard(props) {
    const [chords, setChords] = useState(props.chords)
    const abcjsParser = useAbcjsParser({tunebook: props.tunebook})
    //const [timeSignature, setTimeSignature] = useState(props.timeSignature ? timeSignature : '4/4')
    const allowedChordSites = "site:https://tabs.ultimate-guitar.com OR site:https://www.azchords.com/ OR site:https://www.chordsbase.com/ OR site:https://www.chords-and-tabs.net/ OR site:https://akordy.kytary.cz/ OR site:https://www.guitaretab.com/"

    //function mergeChordsIntoNotes() {
        //var origNotes = Array.isArray(props.notes) ? props.notes.join("\n") : ''
        //return props.tunebook.abcTools.mergeChordsIntoNotes(chords,tune, origNotes, props.tune.meter, props.tunebook.abcTools.getNoteLengthFraction(props.tune), props.saveTune)
    //}
    
    function generateNotesFromChords() {
        //return props.tunebook.abcTools.generateNotesFromChords(chords,tune, props.tune.meter, props.tunebook.abcTools.getNoteLengthFraction(props.tune), props.saveTune)
    } 
    
    useEffect(function() {
        //console.log('voicechange', props.tune.noteLength, props.tune, props.notes)
        if (Array.isArray(props.notes)) { 
            //const parsed = props.tunebook.abcTools.parseAbcToBeats(props.notes.join("\n"))
            //var [totals, notes, chords, preText] = parsed
            ////console.log({totals, notes, chords})
            //// iterate lines
            ////var final = renderAll(chords, notes)
            //console.log("RENCH",props.abc)
            var final = abcjsParser.renderChords(props.abc, true)
            //console.log(final, props.abc)
            setChords(final)
        }
    },[props.notes])
    
     //<Button variant="warning" style={{float:'right', marginRight:'0.2em'}} onClick={function(e) {if (window.confirm('Do you really want to merge these chords into your music? This may not work as expected!!')) {mergeChordsIntoNotes()}}} >3. Merge</Button>
    var tune = props.tune
    //console.log(tune)
    return <div>
        <Form.Group  controlId="chordwiz">
            <div style={{clear:'both'}} >
                <a style={{float:'left', marginRight:'1em'}}  target="_new" href={"https://www.google.com/search?q=chords " + '"' +tune.name + '"' + ' '+(tune.composer ? '"' + tune.composer+ '"' : '')  +  " " + allowedChordSites } ><Button>Search Chords</Button></a>
                
                <Button variant="info" style={{float:'left', marginRight:'1em'}} onClick={function(e) {
                    setChords(abcjsParser.cleanupChords(chords))
                } } >Clean Text</Button>
          
                <Button variant="success" style={{float:'right', marginRight:'1em'}}  onClick={function(e) {if (window.confirm('Do you really want to update your music with these chords !!')) { 
                    var newAbcNotes = props.tunebook.abcTools.justNotes(abcjsParser.mergeChords(chords,props.abc))
                    var abcJson = props.tunebook.abcTools.abc2json(props.abc)
                    var keyList = Object.keys(abcJson.voices).sort()
                    var useVoiceKey = keyList.length > 0 ? keyList[0] : null
                    if (useVoiceKey === null) {
                        abcJson.voices[1] = {meta:"", notes: newAbcNotes.split("\n")}
                    } else {
                        abcJson.voices[parseInt(useVoiceKey)] = {meta:"", notes: newAbcNotes.split("\n")}
                    }
                    var abcTune = props.tunebook.saveTune(abcJson)
                   
                }}} >Save</Button>
                
                <Button style={{float:'right', marginRight:'3em'}}  variant="danger"  onClick={function(e) {if (window.confirm('Do you really want to reset any changes you have made to these chords !!')) {setChords(abcjsParser.renderChords(props.abc, true))}}} >Reset</Button>
                
                <div style={{float:'right', marginRight:'1em'}} ><ParserProblemsDiff  tunebook={props.tunebook} abc={props.abc} /></div>
            </div>
            <div style={{clear:'both'}} > </div>
            <Form.Label>Time Signature</Form.Label>
            <Form.Control type="text" placeholder="eg 4/4" value={tune.meter ? tune.meter : ''} onChange={function(e) {tune.meter = e.target.value;  props.saveTune(tune)  }}  />
            <Form.Label>Repeats</Form.Label>
            <Form.Control type="text" placeholder="eg 100" value={tune.repeats ? tune.repeats : ''} onChange={function(e) {tune.repeats = e.target.value; tune.id = props.tuneId;  props.saveTune(tune)  }}  />
        </Form.Group>
                      
        <Form.Control disabled={(tune.meter ? false : true)} style={{height:'20em'}} as="textarea" placeholder={"eg \nC|F# C|Cmin . . G |Cb\nD|D|A D . A |C"} value={chords} onChange={function(e) {setChords(e.target.value); }}  />
        
    </div>
}
//<Button style={{float:'right'}} disabled={tune.meter ? false : true}  onClick={mergeChordsIntoNotes} variant="success" >Save</Button>
        
