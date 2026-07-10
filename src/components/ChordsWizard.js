import { Alert, Button, Form, Tab, Tabs } from 'react-bootstrap'
import {useState, useEffect, useRef} from 'react'
import ParserProblemsDiff from './ParserProblemsDiff'
import useAbcjsParser from '../useAbcjsParser'
import CreatableSelect from 'react-select/creatable';
import { resolvePrimaryVoiceKey } from '../abcVoiceUtils'
import ChordsSearchButton from './ChordsSearchButton'
import { finalizeChordSheetToTune, noteLinesHaveRealMelody } from '../timedImportFinalizer'
import { exportTuneToChordPro, parseChordSheetText } from '../chordProFormatUtils'
import { getLyricLines, setPlainLyricLines } from '../wLinesUtils'
import { FormLabelWithHelp } from './FormFieldHelp'
import { CHORDS_FIELD_HELP } from '../formFieldHelpText'
import ChordRecordControls from './ChordRecordControls'

const PASTE_CHORD_SHEET_PLACEHOLDER = [
  '[Verse 1]',
  '    Am',
  'The language of love',
  '      F               Dm',
  'Slips from my lover\'s tongue',
  '',
  '[Chorus]',
  'Am         G',
  'Who\'s that girl',
  'Em                  F',
  'Running around with you',
].join('\n')

export default function ChordsWizard(props) {
    const [chords, setChords] = useState(props.chords)
    const [editorTab, setEditorTab] = useState('grid')
    const [pasteText, setPasteText] = useState('')
    const [pasteError, setPasteError] = useState('')
    const pastePrefilledRef = useRef(false)
    const chordsFromRecordingRef = useRef(false)
    const abcjsParser = useAbcjsParser({tunebook: props.tunebook})
    
    useEffect(function() {
        if (chordsFromRecordingRef.current) {
            chordsFromRecordingRef.current = false
            return
        }
        if (Array.isArray(props.notes)) { 
            var final = abcjsParser.renderChords(props.abc, true)
            setChords(final)
        }
    },[props.notes, props.abc])

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

    function mergeChordsIntoTune(chordGridText, lyricLines, options) {
        var opts = options || {}
        if (!String(chordGridText || '').trim() && !(Array.isArray(lyricLines) && lyricLines.length > 0)) {
            return false
        }

        var abcJson = props.tunebook.abcTools.abc2json(props.abc)
        abcJson.id = tune.id
        var voiceKey = resolvePrimaryVoiceKey(abcJson.voices)
        var existingNotes = abcJson.voices[voiceKey] && abcJson.voices[voiceKey].notes
          ? abcJson.voices[voiceKey].notes
          : []
        var hasMelody = noteLinesHaveRealMelody(existingNotes)
        var linesForTune = Array.isArray(lyricLines) && lyricLines.length > 0
          ? lyricLines
          : getLyricLines(tune)

        if (hasMelody || tune.timingScaffold) {
          finalizeChordSheetToTune({
            tune: abcJson,
            tunebook: props.tunebook,
            abcjsParser: abcjsParser,
            abc: props.abc,
            chordGridText: chordGridText,
            lyricLines: linesForTune,
          })
        } else {
          if (String(chordGridText || '').trim()) {
            var newAbcNotes = props.tunebook.abcTools.justNotes(abcjsParser.mergeChords(chordGridText, props.abc))
            abcJson.voices[voiceKey] = { meta: '', notes: newAbcNotes.split('\n') }
          }
          if (Array.isArray(lyricLines) && lyricLines.length > 0) {
            setPlainLyricLines(abcJson, lyricLines)
          }
        }

        if (opts.chordProSource) {
          abcJson.meta = Object.assign({}, abcJson.meta || {}, {
            chordProSource: opts.chordProSource,
            chordSheetAlignment: opts.chordSheetAlignment || null,
          })
        }

        props.tunebook.saveTune(abcJson, false, {
          historyLabel: opts.historyLabel || 'Merge chords',
          immediate: true,
        })
        return true
    }

    function applyChords(mode) {
        var isAppend = mode === 'append'
        var confirmMessage = isAppend
            ? 'Append these chords after the existing notation?'
            : 'Apply these chords from the start of the tune?'
        if (!window.confirm(confirmMessage)) return

        var chordGridText = isAppend
            ? abcjsParser.buildAppendChordGrid(props.abc, chords)
            : chords
        mergeChordsIntoTune(chordGridText, null, {
          historyLabel: isAppend ? 'Append chords' : 'Merge chords',
        })
    }

    function handleEditorTabSelect(key) {
        if (!key) return
        setEditorTab(key)
        if (key === 'paste' && !pastePrefilledRef.current && !pasteText.trim()) {
            try {
                var exported = exportTuneToChordPro(tune)
                if (exported && exported.trim()) {
                    setPasteText(exported)
                }
            } catch (e) {
                // Leave empty for a fresh paste.
            }
            pastePrefilledRef.current = true
        }
    }

    function savePastedChordSheet() {
        setPasteError('')
        try {
            var parsed = parseChordSheetText(pasteText, { fallbackTitle: tune.name })
            setChords(parsed.chordText)
            mergeChordsIntoTune(parsed.chordText, parsed.lyricLines, {
              historyLabel: 'Paste chord sheet',
              chordProSource: parsed.chordProSource,
              chordSheetAlignment: parsed.chordSheetAlignment,
            })
            if (typeof props.onLyricsImport === 'function') {
                props.onLyricsImport(parsed.lyricLines)
            }
            setEditorTab('grid')
        } catch (e) {
            setPasteError(e && e.message ? e.message : 'Could not parse chord sheet')
        }
    }

    return <div>
        <Form.Group  controlId="chordwiz">
            <div style={{display:'flex', flexWrap:'wrap', alignItems:'flex-start', gap:'1em'}} >
                <ChordsSearchButton
                  title={tune.name}
                  artist={tune.composer || ''}
                  rhythm={tune.rhythm || ''}
                  currentGenre={tune.genre || ''}
                  onGenreAccept={props.onGenreAccept}
                  token={props.token}
                  tunebook={props.tunebook}
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
                    <Button variant="primary" onClick={function() { applyChords('append') }}>Append</Button>
                    <Button variant="success" onClick={function() { applyChords('merge') }}>Merge</Button>

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

        <Tabs
          activeKey={editorTab}
          onSelect={handleEditorTabSelect}
          className="abc-editor-chords-inner-tabs mb-2"
        >
          <Tab eventKey="grid" title="Chord grid">
            <ChordRecordControls
              tune={tune}
              meter={tune.meter}
              initialChords={chords}
              autoActivate={!!props.autoActivateChordRecord}
              onChordsCaptured={function(gridText) {
                const captured = String(gridText || '').trim()
                if (captured) {
                  chordsFromRecordingRef.current = true
                  setChords(captured)
                }
              }}
            />

            <Form.Control
              disabled={!tune.meter}
              style={{height:'20em'}}
              as="textarea"
              placeholder={"eg \nC|F# C|Cmin . . G |Cb\nD|D|A D . A |C"}
              value={chords}
              onChange={function(e) {setChords(e.target.value); }}
            />
          </Tab>
          <Tab eventKey="paste" title="Paste chord sheet">
            <p className="text-muted small mb-2">
              Paste a chord sheet with section labels like <code>[Verse 1]</code> and chord names spaced above each lyric line (Ultimate Guitar style), then click Save to update lyrics and merge chords into the tune.
            </p>
            <Form.Control
              as="textarea"
              style={{height:'20em', fontFamily: 'monospace'}}
              placeholder={PASTE_CHORD_SHEET_PLACEHOLDER}
              value={pasteText}
              onChange={function(e) { setPasteText(e.target.value); setPasteError('') }}
            />
            <div className="d-flex align-items-center gap-2 mt-2">
              <Button
                variant="success"
                disabled={!pasteText.trim()}
                onClick={savePastedChordSheet}
              >
                Save
              </Button>
              <Button
                variant="outline-secondary"
                disabled={!pasteText.trim()}
                onClick={function() {
                  setPasteText('')
                  setPasteError('')
                  pastePrefilledRef.current = false
                }}
              >
                Clear
              </Button>
            </div>
            {pasteError ? <Alert className="mt-2 mb-0" variant="danger">{pasteError}</Alert> : null}
          </Tab>
        </Tabs>
    </div>
}
