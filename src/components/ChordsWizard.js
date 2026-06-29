import { Alert, Button, Form } from 'react-bootstrap'
import {useState, useEffect} from 'react'
import ParserProblemsDiff from './ParserProblemsDiff'
import useAbcjsParser from '../useAbcjsParser'
import CreatableSelect from 'react-select/creatable';
import { resolvePrimaryVoiceKey } from '../abcVoiceUtils'

export default function ChordsWizard(props) {
    const [chords, setChords] = useState(props.chords)
    const abcjsParser = useAbcjsParser({tunebook: props.tunebook})
    const allowedChordSites = "site:https://tabs.ultimate-guitar.com OR site:https://www.azchords.com/ OR site:https://www.chordsbase.com/ OR site:https://www.chords-and-tabs.net/ OR site:https://akordy.kytary.cz/ OR site:https://www.guitaretab.com/"
    
    useEffect(function() {
        if (Array.isArray(props.notes)) { 
            var final = abcjsParser.renderChords(props.abc, true)
            setChords(final)
        }
    },[props.notes, props.abc])
    
    var tune = props.tune
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
                    var useVoiceKey = resolvePrimaryVoiceKey(abcJson.voices)
                    abcJson.voices[useVoiceKey] = {meta:"", notes: newAbcNotes.split("\n")}
                    props.tunebook.saveTune(abcJson)
                   
                }}} >Save</Button>
                
                <Button style={{float:'right', marginRight:'3em'}}  variant="danger"  onClick={function(e) {if (window.confirm('Do you really want to reset any changes you have made to these chords !!')) {setChords(abcjsParser.renderChords(props.abc, true))}}} >Reset</Button>
                
                <div style={{float:'right', marginRight:'1em'}} ><ParserProblemsDiff  tunebook={props.tunebook} abc={props.abc} /></div>
            </div>
            <div style={{clear:'both'}} > </div>
            <Form.Label>Time Signature</Form.Label>
            <CreatableSelect
                    value={tune.meter ? {value:tune.meter, label:tune.meter} : {value:'', label:''}}
                    onChange={function(val) {tune.meter = val.label;  props.saveTune(tune)  }}
                    options={props.tunebook.abcTools.getTimeSignatureTypes().map(function(type,key) {
                        return {value:type, label: type}
                    })}
                    isClearable={false}
                    blurInputOnSelect={true}
                    createOptionPosition={"first"}
                    allowCreateWhileLoading={true}
                    allowCreate={true}
                  />
            <Form.Label>Repeats</Form.Label>
            <Form.Control type="text" placeholder="eg 100" value={tune.repeats ? tune.repeats : ''} onChange={function(e) {tune.repeats = e.target.value; tune.id = props.tuneId;  props.saveTune(tune)  }}  />
        </Form.Group>
                      
        <Form.Control disabled={(tune.meter ? false : true)} style={{height:'20em'}} as="textarea" placeholder={"eg \nC|F# C|Cmin . . G |Cb\nD|D|A D . A |C"} value={chords} onChange={function(e) {setChords(e.target.value); }}  />
    </div>
}
