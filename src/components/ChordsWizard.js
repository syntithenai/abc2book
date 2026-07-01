import { Alert, Button, Form } from 'react-bootstrap'
import {useState, useEffect} from 'react'
import ParserProblemsDiff from './ParserProblemsDiff'
import useAbcjsParser from '../useAbcjsParser'
import CreatableSelect from 'react-select/creatable';
import { resolvePrimaryVoiceKey } from '../abcVoiceUtils'
import ChordsSearchButton from './ChordsSearchButton'
import { finalizeChordSheetToTune, noteLinesHaveRealMelody } from '../timedImportFinalizer'
import { getLyricLines } from '../wLinesUtils'
import { FormLabelWithHelp } from './FormFieldHelp'
import { CHORDS_FIELD_HELP } from '../formFieldHelpText'

export default function ChordsWizard(props) {
    const [chords, setChords] = useState(props.chords)
    const abcjsParser = useAbcjsParser({tunebook: props.tunebook})
    
    useEffect(function() {
        if (Array.isArray(props.notes)) { 
            var final = abcjsParser.renderChords(props.abc, true)
            setChords(final)
        }
    },[props.notes, props.abc, abcjsParser])

    const onConsumePendingChordImport = props.onConsumePendingChordImport
    useEffect(function() {
        if (props.pendingChordImport && String(props.pendingChordImport).trim()) {
            setChords(String(props.pendingChordImport))
            if (typeof onConsumePendingChordImport === 'function') {
                onConsumePendingChordImport()
            }
        }
    }, [props.pendingChordImport, onConsumePendingChordImport])
    
    var tune = props.tune
    return <div>
        <Form.Group  controlId="chordwiz">
            <div style={{display:'flex', flexWrap:'wrap', alignItems:'flex-start', gap:'1em'}} >
                <ChordsSearchButton
                  title={tune.name}
                  artist={tune.composer || ''}
                  token={props.token}
                  onChords={function(result) { setChords(result.chordText) }}
                  onLyrics={function(result) {
                    if (typeof props.onLyricsImport === 'function') {
                        props.onLyricsImport(result.lines)
                    }
                  }}
                />

                <Button variant="info" onClick={function(e) {
                    setChords(abcjsParser.cleanupChords(chords))
                } } >Clean Text</Button>

                <Button variant="danger" onClick={function(e) {if (window.confirm('Do you really want to reset any changes you have made to these chords !!')) {setChords(abcjsParser.renderChords(props.abc, true))}}} >Reset</Button>

                <div style={{marginLeft:'auto', display:'flex', gap:'1em', alignItems:'flex-start'}} >
                    <Button variant="success" onClick={function(e) {if (window.confirm('Do you really want to update your music with these chords !!')) {
                        var abcJson = props.tunebook.abcTools.abc2json(props.abc)
                        abcJson.id = tune.id
                        var voiceKey = resolvePrimaryVoiceKey(abcJson.voices)
                        var existingNotes = abcJson.voices[voiceKey] && abcJson.voices[voiceKey].notes
                          ? abcJson.voices[voiceKey].notes
                          : []
                        var hasMelody = noteLinesHaveRealMelody(existingNotes)
                        var lyricLines = getLyricLines(tune)

                        if (hasMelody || tune.timingScaffold) {
                          finalizeChordSheetToTune({
                            tune: abcJson,
                            tunebook: props.tunebook,
                            abcjsParser: abcjsParser,
                            abc: props.abc,
                            chordGridText: chords,
                            lyricLines: lyricLines,
                          })
                        } else {
                          var newAbcNotes = props.tunebook.abcTools.justNotes(abcjsParser.mergeChords(chords, props.abc))
                          abcJson.voices[voiceKey] = { meta: '', notes: newAbcNotes.split('\n') }
                        }

                        props.tunebook.saveTune(abcJson, false, { historyLabel: 'Apply chords', immediate: true })

                    }}} >Save</Button>

                    <ParserProblemsDiff  tunebook={props.tunebook} abc={props.abc} />
                </div>
            </div>
            <div style={{clear:'both'}} > </div>
            <FormLabelWithHelp label="Time Signature" helpBody={CHORDS_FIELD_HELP.meter.body} helpTitle={CHORDS_FIELD_HELP.meter.title} />
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
        </Form.Group>
                      
        <Form.Control disabled={(tune.meter ? false : true)} style={{height:'20em'}} as="textarea" placeholder={"eg \nC|F# C|Cmin . . G |Cb\nD|D|A D . A |C"} value={chords} onChange={function(e) {setChords(e.target.value); }}  />
    </div>
}
