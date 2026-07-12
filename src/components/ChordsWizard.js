import { Alert, Button, Form, ListGroup, Modal, Tab, Tabs } from 'react-bootstrap'
import {useState, useEffect, useRef} from 'react'
import ParserProblemsDiff from './ParserProblemsDiff'
import useAbcjsParser from '../useAbcjsParser'
import CreatableSelect from 'react-select/creatable';
import ChordsSearchButton from './ChordsSearchButton'
import FieldLookupReviewButton from './FieldLookupReviewButton'
import { applyChordSheetToTune, buildMeterMergeOptions } from '../applyChordSheetToTune'
import { buildChordKeyMergeOptions } from '../chordKeyMergeOptions'
import { exportTuneToChordPro, parseChordSheetText } from '../chordProFormatUtils'
import { getLyricLines } from '../wLinesUtils'
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
    const [keyMergeOptions, setKeyMergeOptions] = useState([])
    const [meterMergeOptions, setMeterMergeOptions] = useState([])
    const [meterAssumedNotice, setMeterAssumedNotice] = useState('')
    const [pendingPaste, setPendingPaste] = useState(null)
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
        // Carry timed media / scaffold flags from the live tune onto the ABC snapshot.
        if (tune.timingScaffold) abcJson.timingScaffold = true
        if (tune.timedLyrics) abcJson.timedLyrics = tune.timedLyrics
        if (tune.timedChords) abcJson.timedChords = tune.timedChords
        if (tune.timedMelody) abcJson.timedMelody = tune.timedMelody
        if (tune.meta) abcJson.meta = Object.assign({}, tune.meta, abcJson.meta || {})

        var linesForTune = Array.isArray(lyricLines) && lyricLines.length > 0
          ? lyricLines
          : getLyricLines(tune)
        var preserveTimedMedia = !!(tune.timedLyrics || tune.timedChords || tune.timedMelody)

        applyChordSheetToTune(abcJson, {
          chordGridText: chordGridText,
          lyricLines: linesForTune,
          chordSheetAlignment: opts.chordSheetAlignment,
          meta: opts.meta || (opts.chordProSource ? {
            chordProSource: opts.chordProSource,
          } : null),
          chordProSource: opts.chordProSource,
          mergeMode: opts.mergeMode,
          abcjsParser: abcjsParser,
          tunebook: props.tunebook,
          abc: props.abc,
          preserveTimedMedia: preserveTimedMedia,
          selectedKeyOption: opts.selectedKeyOption,
          selectedMeterOption: opts.selectedMeterOption,
        })

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

    function finishPendingPaste(overrides) {
        var pending = pendingPaste
        if (!pending) return
        var opts = overrides || {}
        mergeChordsIntoTune(pending.chordText, pending.lyricLines, {
          historyLabel: 'Paste chord sheet',
          chordProSource: pending.meta && pending.meta.chordProSource,
          chordSheetAlignment: pending.chordSheetAlignment,
          meta: pending.meta,
          selectedKeyOption: opts.selectedKeyOption != null
            ? opts.selectedKeyOption
            : pending.selectedKeyOption,
          selectedMeterOption: opts.selectedMeterOption != null
            ? opts.selectedMeterOption
            : pending.selectedMeterOption,
        })
        if (typeof props.onLyricsImport === 'function') {
            props.onLyricsImport(pending.lyricLines)
        }
        setPendingPaste(null)
        setKeyMergeOptions([])
        setMeterMergeOptions([])
        setEditorTab('grid')
    }

    function savePastedChordSheet() {
        setPasteError('')
        setMeterAssumedNotice('')
        try {
            var parsed = parseChordSheetText(pasteText, { fallbackTitle: tune.name })
            setChords(parsed.chordText)
            var meta = {
              title: parsed.title,
              name: parsed.title,
              composer: parsed.composer,
              key: parsed.key,
              capo: parsed.capo,
              tempo: parsed.tempo,
              meter: parsed.meter,
              chordProSource: parsed.chordProSource,
            }
            var meterDecision = buildMeterMergeOptions(parsed.meter, tune.meter)
            var keyOptions = buildChordKeyMergeOptions({
              chordGridText: parsed.chordText,
              notationKey: tune.key,
              sheetKey: parsed.key,
              capo: parsed.capo,
              noteLines: tune.voices && Object.keys(tune.voices).length
                ? (tune.voices[Object.keys(tune.voices)[0]].notes || [])
                : [],
            })
            var pending = {
              chordText: parsed.chordText,
              lyricLines: parsed.lyricLines,
              chordSheetAlignment: parsed.chordSheetAlignment,
              meta: meta,
              selectedMeterOption: meterDecision.options[0] || null,
              selectedKeyOption: keyOptions[0] || null,
            }
            if (meterDecision.assumedDefault) {
              setMeterAssumedNotice(meterDecision.options[0].rationale || 'Assumed 4/4')
            }
            if (meterDecision.options.length > 1) {
              setPendingPaste(pending)
              setMeterMergeOptions(meterDecision.options)
              setKeyMergeOptions(keyOptions.length > 1 ? keyOptions : [])
              return
            }
            if (keyOptions.length > 1) {
              setPendingPaste(pending)
              setKeyMergeOptions(keyOptions)
              return
            }
            mergeChordsIntoTune(parsed.chordText, parsed.lyricLines, {
              historyLabel: 'Paste chord sheet',
              chordProSource: parsed.chordProSource,
              chordSheetAlignment: parsed.chordSheetAlignment,
              meta: meta,
              selectedKeyOption: keyOptions[0] || null,
              selectedMeterOption: meterDecision.options[0] || null,
            })
            if (typeof props.onLyricsImport === 'function') {
                props.onLyricsImport(parsed.lyricLines)
            }
            setEditorTab('grid')
        } catch (e) {
            setPasteError(e && e.message ? e.message : 'Could not parse chord sheet')
        }
    }

    function applyMeterMergeOption(option) {
        if (!pendingPaste) return
        var next = Object.assign({}, pendingPaste, { selectedMeterOption: option })
        setPendingPaste(next)
        setMeterMergeOptions([])
        if (keyMergeOptions.length > 1) {
          return
        }
        finishPendingPaste({ selectedMeterOption: option, selectedKeyOption: next.selectedKeyOption })
    }

    function applyKeyMergeOption(option) {
        finishPendingPaste({ selectedKeyOption: option })
    }

    return <div>
        <Form.Group  controlId="chordwiz">
            <div style={{display:'flex', flexWrap:'wrap', alignItems:'flex-start', gap:'1em'}} >
                <ChordsSearchButton
                  tuneId={tune && tune.id}
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
                <FieldLookupReviewButton
                  tuneId={tune && tune.id}
                  kind="chords"
                  fallbackTitle={tune.name || ''}
                  onApply={function(result) {
                    if (result && result.chordText) setChords(result.chordText)
                    if (result && typeof props.onLyricsImport === 'function' && result.lyricLines) {
                      props.onLyricsImport(result.lyricLines)
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
            {meterAssumedNotice ? (
              <Alert className="mt-2 mb-0" variant="warning">{meterAssumedNotice}</Alert>
            ) : null}
          </Tab>
        </Tabs>
        <Modal show={meterMergeOptions.length > 1} onHide={function() {
          setMeterMergeOptions([])
          setKeyMergeOptions([])
          setPendingPaste(null)
        }}>
          <Modal.Header closeButton>
            <Modal.Title>Time signature options</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p>
              The chord sheet meter may not match this tune&apos;s notation meter
              ({tune.meter || 'unknown'}). Pick which meter to use for chord placement.
              Your tune meter field is only changed if you choose the sheet meter and confirm.
            </p>
            <ListGroup>
              {meterMergeOptions.map(function(option) {
                return (
                  <ListGroup.Item
                    key={option.id || option.label}
                    action
                    onClick={function() { applyMeterMergeOption(option) }}
                  >
                    <strong>{option.label}</strong>
                    {option.rationale ? (
                      <div className="text-muted small">{option.rationale}</div>
                    ) : null}
                  </ListGroup.Item>
                )
              })}
            </ListGroup>
          </Modal.Body>
        </Modal>
        <Modal show={keyMergeOptions.length > 1 && meterMergeOptions.length === 0} onHide={function() {
          setKeyMergeOptions([])
          setPendingPaste(null)
        }}>
          <Modal.Header closeButton>
            <Modal.Title>Chord key options</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p>
              The chord sheet key may not match this tune&apos;s notation key
              ({tune.key || 'unknown'}). Pick how to merge — your tune key field is not changed.
            </p>
            <ListGroup>
              {keyMergeOptions.map(function(option) {
                return (
                  <ListGroup.Item
                    key={option.id || option.label}
                    action
                    onClick={function() { applyKeyMergeOption(option) }}
                  >
                    <strong>{option.label}</strong>
                    {option.rationale ? (
                      <div className="text-muted small">{option.rationale}</div>
                    ) : null}
                    <pre style={{ marginBottom: 0, whiteSpace: 'pre-wrap', fontSize: '0.85em' }}>
                      {String(option.chordGridText || '').split('\n').slice(0, 4).join('\n')}
                    </pre>
                  </ListGroup.Item>
                )
              })}
            </ListGroup>
          </Modal.Body>
        </Modal>
    </div>
}
