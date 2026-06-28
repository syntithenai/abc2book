import { Alert, Button, Form } from 'react-bootstrap'
import {useState, useEffect, useRef} from 'react'
import ParserProblemsDiff from './ParserProblemsDiff'
import useAbcjsParser from '../useAbcjsParser'
import CreatableSelect from 'react-select/creatable';
import TuneMediaAnalysisButton from './TuneMediaAnalysisButton'
import useTuneMediaAnalysis from '../useTuneMediaAnalysis'

export default function ChordsWizard(props) {
    const [chords, setChords] = useState(props.chords)
    const abcjsParser = useAbcjsParser({tunebook: props.tunebook})
    const { analysis } = useTuneMediaAnalysis()
    const lastAppliedVersionRef = useRef(0)
    const allowedChordSites = "site:https://tabs.ultimate-guitar.com OR site:https://www.azchords.com/ OR site:https://www.chordsbase.com/ OR site:https://www.chords-and-tabs.net/ OR site:https://akordy.kytary.cz/ OR site:https://www.guitaretab.com/"
    
    useEffect(function() {
        if (Array.isArray(props.notes)) { 
            var final = abcjsParser.renderChords(props.abc, true)
            setChords(final)
        }
    },[props.notes])

    useEffect(function() {
        if (!analysis || !analysis.formatted || !analysis.formatted.chordsText) return
        if (analysis.version === lastAppliedVersionRef.current) return
        lastAppliedVersionRef.current = analysis.version
        setChords(analysis.formatted.chordsText)
    }, [analysis])
    
    var tune = props.tune
    return <div>
        <Form.Group  controlId="chordwiz">
            <div style={{clear:'both'}} >
                <a style={{float:'left', marginRight:'1em'}}  target="_new" href={"https://www.google.com/search?q=chords " + '"' +tune.name + '"' + ' '+(tune.composer ? '"' + tune.composer+ '"' : '')  +  " " + allowedChordSites } ><Button>Search Chords</Button></a>
                
                <Button variant="info" style={{float:'left', marginRight:'1em'}} onClick={function(e) {
                    setChords(abcjsParser.cleanupChords(chords))
                } } >Clean Text</Button>

                <TuneMediaAnalysisButton
                  label="Listen"
                  activeLabel="Listening..."
                  buttonStyle={{ float: 'left', marginRight: '1em' }}
                />
          
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
        {!analysis && (
          <Alert variant="info" style={{ marginTop: '0.8em' }}>
            Listen runs one shared analysis for lyrics, chords, and melody. Lyrics are applied immediately in the Lyrics tab and can be undone with the back arrow.
          </Alert>
        )}
    </div>
}
