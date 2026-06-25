import {Alert, Button, Form, ListGroup, Modal} from 'react-bootstrap'
import {useState, useEffect, useMemo, useRef} from 'react'
import ParserProblemsDiff from './ParserProblemsDiff'
import useAbcjsParser from '../useAbcjsParser'
import CreatableSelect from 'react-select/creatable';
import useMediaResolverHealth from '../useMediaResolverHealth'
import { discoverChordsFromSource } from '../chordDiscoveryClient'
import { formatDiscoveredChords } from '../chordDiscoveryFormatter'
import { getLinkedMediaSources } from '../mediaTranscriptionSources'

export default function ChordsWizard(props) {
    const [chords, setChords] = useState(props.chords)
    const [showSourceDialog, setShowSourceDialog] = useState(false)
    const [discoveryError, setDiscoveryError] = useState('')
    const [discoveryStatus, setDiscoveryStatus] = useState('')
    const [isDiscovering, setIsDiscovering] = useState(false)
    const abcjsParser = useAbcjsParser({tunebook: props.tunebook})
    const abortRef = useRef(null)
    const accessToken = props.token && props.token.access_token ? props.token.access_token : null
    const { available: resolverAvailable } = useMediaResolverHealth({ accessToken })
    const allowedChordSites = "site:https://tabs.ultimate-guitar.com OR site:https://www.azchords.com/ OR site:https://www.chordsbase.com/ OR site:https://www.chords-and-tabs.net/ OR site:https://akordy.kytary.cz/ OR site:https://www.guitaretab.com/"
    const mediaSources = useMemo(function() {
        return getLinkedMediaSources(props.tune, props.tunebook)
    }, [props.tune, props.tunebook])

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

    useEffect(function() {
        return function() {
            if (abortRef.current) {
                abortRef.current.abort()
            }
        }
    }, [])

    function getBeatsPerBar(meter) {
        return props.tunebook.abcTools.getBeatsPerBar(meter || '4/4') || 4
    }

    function getSlotsPerBeat() {
        const meter = tune && tune.meter ? tune.meter : '4/4'
        const noteLength = tune && tune.noteLength ? tune.noteLength : '1/8'
        const barSlots = props.tunebook.abcTools.getNoteLengthsPerBar(noteLength, meter)
        const beatsPerBar = getBeatsPerBar(meter)
        if (!barSlots || !beatsPerBar) return 2
        return Math.max(1, Math.round(barSlots / beatsPerBar))
    }

    async function startChordDiscovery(source) {
        if (!source) return

        abortRef.current = new AbortController()
        setIsDiscovering(true)
        setDiscoveryError('')
        setDiscoveryStatus('Resolving audio...')
        setShowSourceDialog(false)

        try {
            const result = await discoverChordsFromSource({
                source: source,
                accessToken: accessToken,
                signal: abortRef.current.signal,
                onProgress: setDiscoveryStatus,
            })
            setDiscoveryStatus('Formatting chords...')
            const formatted = formatDiscoveredChords({
                segments: result.segments,
                beatTimes: result.beatTimes,
                beatsPerBar: getBeatsPerBar(tune && tune.meter),
                slotsPerBeat: getSlotsPerBeat(),
            })
            if (!formatted) {
                throw new Error('No chords were returned from chord discovery')
            }
            setChords(formatted)
            setDiscoveryStatus('Listen complete')
        } catch (error) {
            if (error && error.name === 'AbortError') {
                setDiscoveryStatus('Listen cancelled')
            } else {
                setDiscoveryStatus('')
                setDiscoveryError(error && error.message ? error.message : 'Chord discovery failed')
            }
        } finally {
            abortRef.current = null
            setIsDiscovering(false)
        }
    }

    function handleListenClick() {
        if (isDiscovering) {
            if (abortRef.current) {
                setDiscoveryStatus('Cancelling...')
                abortRef.current.abort()
            }
            return
        }

        setDiscoveryError('')
        if (mediaSources.length === 0) {
            setDiscoveryError('No linked media is available for chord discovery')
            return
        }
        if (mediaSources.length === 1) {
            startChordDiscovery(mediaSources[0])
            return
        }
        setShowSourceDialog(true)
    }

    function getListenButtonLabel() {
        if (isDiscovering) {
            return discoveryStatus || 'Listening...'
        }
        return 'Listen'
    }
    
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

                {resolverAvailable && mediaSources.length > 0 && <Button
                    variant={isDiscovering ? 'warning' : 'primary'}
                    style={{float:'left', marginRight:'1em'}}
                    onClick={handleListenClick}
                >{getListenButtonLabel()}</Button>}
          
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
            {discoveryError && <Alert variant="danger" style={{marginTop:'1em', marginBottom:'0.5em'}}>{discoveryError}</Alert>}
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

        <Modal show={showSourceDialog} onHide={function() { if (!isDiscovering) setShowSourceDialog(false) }}>
            <Modal.Header closeButton={!isDiscovering}>
                <Modal.Title>Select media to listen to</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <ListGroup>
                    {mediaSources.map(function(source) {
                        return <ListGroup.Item key={source.id}>
                            <div style={{display:'flex', justifyContent:'space-between', gap:'1em', alignItems:'center'}}>
                                <div>
                                    <div style={{fontWeight:'bold'}}>{source.label}</div>
                                    <div style={{fontSize:'0.9em', wordBreak:'break-word'}}>{source.detail}</div>
                                </div>
                                <Button disabled={isDiscovering} onClick={function() { startChordDiscovery(source) }}>Use this</Button>
                            </div>
                        </ListGroup.Item>
                    })}
                </ListGroup>
            </Modal.Body>
        </Modal>

    </div>
}
//<Button style={{float:'right'}} disabled={tune.meter ? false : true}  onClick={mergeChordsIntoNotes} variant="success" >Save</Button>
        
