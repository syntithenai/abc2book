import { Button, Form, Modal } from 'react-bootstrap'
import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { toast } from 'react-toastify'
import useAbcjsParser from '../useAbcjsParser'
import CreatableSelect from 'react-select/creatable'
import ChordsSearchButton from './ChordsSearchButton'
import FieldLookupReviewButton from './FieldLookupReviewButton'
import { getLyricLines, getPlainLyricLines } from '../wLinesUtils'
import ChordSectionsDropdown from './ChordSectionsDropdown'
import ChordSectionRecordModal from './ChordSectionRecordModal'
import PasteChordSheetModal from './PasteChordSheetModal'
import ChordMergeFailureToast from './ChordMergeFailureToast'
import { commitChordSearchResultToTune } from '../commitChordSearchResultToTune'
import {
  firstSectionMeter,
  firstSectionTempo,
  insertChordsEditorSectionAfter,
  rebuildChordGridFromSections,
  reconcileChordSectionsFromGrid,
  removeChordsEditorSection,
  renameChordsEditorSection,
  replaceSectionChart,
  replaceSectionMeter,
  replaceSectionTempo,
  applyChordSectionLabels,
} from '../chordsEditorSections'
import {
  applyBlockMergeToTune,
  buildUnifiedBlocks,
  hashAbcNotes,
  readChordBlockCache,
  reconcileBlocksFromGrid,
  writeChordBlockCache,
} from '../chordBlockMerge'
import { resolvePrimaryVoiceKey } from '../abcVoiceUtils'
import { fillEmptyTuneFieldsFromMeta } from '../applyChordSheetToTune'
import { noteLinesHaveRealMelody } from '../timedImportFinalizer'
import { listLyricSections } from '../lyricStructureUtils'

const AUTOSAVE_MS = 400

function chartLooksComplete(text) {
  const lines = String(text || '').split(/\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    // Incomplete chord line: has content but no closing |
    if (!/\|\s*$/.test(line) && !/^\[M:/i.test(line)) return false
  }
  return true
}

function fitChordTextarea(el) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.max(el.scrollHeight, 72) + 'px'
}

export default function ChordsWizard(props) {
  const tune = props.tune
  const abcjsParser = useAbcjsParser({ tunebook: props.tunebook })
  const [sections, setSections] = useState([])
  const [hideSections, setHideSections] = useState(false)
  const [sectionDrafts, setSectionDrafts] = useState({})
  const [wholeDraft, setWholeDraft] = useState(null)
  const [recordTarget, setRecordTarget] = useState(null)
  const [showPaste, setShowPaste] = useState(false)
  const [pasteInitialText, setPasteInitialText] = useState(null)
  const [pasteInitialUpdateLyrics, setPasteInitialUpdateLyrics] = useState(false)
  const [highlightKey, setHighlightKey] = useState(null)
  const [mergeFailure, setMergeFailure] = useState(null)
  const [savingLabel, setSavingLabel] = useState('')
  const [addSectionDialog, setAddSectionDialog] = useState(null)
  const [newSectionName, setNewSectionName] = useState('')
  const sectionRefs = useRef({})
  const localSectionsRef = useRef(false)
  const autoRecordOpenedRef = useRef(false)
  const sectionSaveTimers = useRef({})
  const wholeSaveTimer = useRef(null)
  const committedSectionsRef = useRef([])
  const warningsBanner = useRef([])

  const meterOptions = (props.tunebook && props.tunebook.abcTools
    ? props.tunebook.abcTools.getTimeSignatureTypes()
    : ['4/4', '3/4', '6/8', '2/4']
  ).map(function(type) {
    return { value: type, label: type }
  })

  function primaryNoteLines() {
    if (!tune || !tune.voices) return []
    const voiceKey = resolvePrimaryVoiceKey(tune.voices)
    const voice = tune.voices[voiceKey]
    return voice && Array.isArray(voice.notes) ? voice.notes.slice() : []
  }

  function loadSectionsFromAbc() {
    const lyricLines = getLyricLines(tune)
    const noteLines = primaryNoteLines()
    const abcHash = hashAbcNotes(noteLines)
    const labels = Array.isArray(tune.chordSectionLabels) ? tune.chordSectionLabels : null
    const cache = readChordBlockCache(tune)
    if (cache && cache.abcHash === abcHash && Array.isArray(cache.blocks) && cache.blocks.length) {
      return labels && labels.length
        ? applyChordSectionLabels(cache.blocks, labels, lyricLines)
        : cache.blocks
    }
    const chordChart = abcjsParser.renderChords(props.abc, true)
    const extracted = buildUnifiedBlocks({
      noteLines: noteLines,
      chordChart: chordChart,
      lyricLines: lyricLines,
      defaultMeter: tune.meter || '4/4',
      defaultTempo: tune.tempo || 120,
      chordSectionLabels: labels,
    })
    warningsBanner.current = extracted.warnings || []
    writeChordBlockCache(tune, extracted.abcHash, extracted.blocks)
    return extracted.blocks
  }

  useEffect(function() {
    if (localSectionsRef.current) {
      localSectionsRef.current = false
      return
    }
    if (Array.isArray(props.notes) || props.abc) {
      const next = loadSectionsFromAbc()
      setSections(next)
      committedSectionsRef.current = next
      setSectionDrafts({})
      setWholeDraft(null)
      setMergeFailure(null)
    }
  }, [props.notes, props.abc])

  const onConsumePendingChordImport = props.onConsumePendingChordImport
  useEffect(function() {
    if (props.pendingChordImport && String(props.pendingChordImport).trim()) {
      setPasteInitialText(String(props.pendingChordImport))
      setShowPaste(true)
      if (typeof onConsumePendingChordImport === 'function') {
        onConsumePendingChordImport()
      }
    }
  }, [props.pendingChordImport, onConsumePendingChordImport])

  useEffect(function() {
    if (!props.autoActivateChordRecord || autoRecordOpenedRef.current) return
    if (!sections.length) return
    autoRecordOpenedRef.current = true
    if (hideSections) {
      setRecordTarget({
        mode: 'all',
        title: 'Record chords',
        chart: rebuildChordGridFromSections(sections),
        meter: firstSectionMeter(sections, tune.meter),
        tempo: firstSectionTempo(sections, tune.tempo),
      })
    } else {
      const firstEditable = sections.find(function(s) { return s && !s.chartRevisit })
      if (firstEditable) setRecordTarget({ mode: 'section', section: firstEditable })
    }
  }, [props.autoActivateChordRecord, sections, hideSections])

  useEffect(function() {
    return function() {
      Object.keys(sectionSaveTimers.current).forEach(function(key) {
        window.clearTimeout(sectionSaveTimers.current[key])
      })
      if (wholeSaveTimer.current) window.clearTimeout(wholeSaveTimer.current)
    }
  }, [])

  useLayoutEffect(function() {
    const root = typeof document !== 'undefined'
      ? document.querySelector('.chords-wizard')
      : null
    if (!root) return
    root.querySelectorAll('textarea.chords-wizard-textarea').forEach(fitChordTextarea)
  }, [sections, sectionDrafts, wholeDraft, hideSections])

  function saveSectionsTransaction(nextSections, options) {
    const opts = options || {}
    const abcJson = props.tunebook.abcTools.abc2json(props.abc)
    abcJson.id = tune.id
    if (tune.timingScaffold) abcJson.timingScaffold = true
    if (tune.meta) abcJson.meta = Object.assign({}, tune.meta, abcJson.meta || {})
    if (tune.words) abcJson.words = tune.words.slice()
    if (tune.wLines) abcJson.wLines = tune.wLines.slice()

    fillEmptyTuneFieldsFromMeta(abcJson, opts.meta)
    if (opts.selectedMeterOption && opts.selectedMeterOption.meter) {
      abcJson.meter = opts.selectedMeterOption.meter
    }
    if (opts.chordSheetAlignment !== undefined) {
      abcJson.meta = Object.assign({}, abcJson.meta || {}, {
        chordSheetAlignment: opts.chordSheetAlignment,
      })
    }

    const firstMeter = opts.firstMeter || firstSectionMeter(nextSections, tune.meter)
    const firstTempo = opts.firstTempo || firstSectionTempo(nextSections, tune.tempo)
    const notes = primaryNoteLines()
    const structural = !!opts.structural
    // Structural New/Delete must rebuild scaffold from the editor section list;
    // otherwise leftover ABC strains make Delete look like it removed the last block.
    const wipeNotation = !!opts.wipeNotation
      || (structural && (!noteLinesHaveRealMelody(notes) || !!tune.timingScaffold))
    const result = applyBlockMergeToTune(abcJson, {
      abc: props.abc,
      blocks: nextSections,
      tunebook: props.tunebook,
      abcjsParser: abcjsParser,
      wipeNotation: wipeNotation,
      keepEditorBlocks: true,
      chordSheetAlignment: opts.chordSheetAlignment,
      defaultMeter: firstMeter,
      firstMeter: firstMeter,
      defaultTempo: firstTempo,
      firstTempo: firstTempo,
      updateLyrics: !!opts.updateLyrics,
      lyricLines: opts.lyricLines,
    })

    if (!result.ok) {
      setMergeFailure(result.error)
      // Revert drafts to last committed
      setSections(committedSectionsRef.current.slice())
      setSectionDrafts({})
      setWholeDraft(null)
      return false
    }

    setMergeFailure(null)
    localSectionsRef.current = true
    const committed = Array.isArray(nextSections) ? nextSections.slice() : (result.blocks || [])
    setSections(committed)
    committedSectionsRef.current = committed
    setSectionDrafts({})
    setWholeDraft(null)
    if (Array.isArray(abcJson.chordSectionLabels)) {
      tune.chordSectionLabels = abcJson.chordSectionLabels
    }

    props.tunebook.saveTune(abcJson, false, {
      historyLabel: opts.historyLabel || 'Save chords',
      immediate: true,
    })
    setSavingLabel('')
    if (opts.successToast) {
      toast.success(opts.successToast)
    }
    return true
  }

  function handleSectionsChange(nextSections) {
    saveSectionsTransaction(nextSections, { historyLabel: 'Reorder chord sections' })
  }

  function jumpToSection(section) {
    if (!section) return
    setHighlightKey(section.key)
    const node = sectionRefs.current[section.key]
    if (node && node.scrollIntoView) {
      node.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
    window.setTimeout(function() { setHighlightKey(null) }, 1600)
  }

  function openRecordSection(section) {
    setRecordTarget({ mode: 'section', section: section })
  }

  function openRecordAll() {
    setRecordTarget({
      mode: 'all',
      title: 'Record chords',
      chart: wholeDraft != null ? wholeDraft : rebuildChordGridFromSections(sections),
      meter: firstSectionMeter(sections, tune.meter),
      tempo: firstSectionTempo(sections, tune.tempo),
    })
  }

  function openAddSectionDialog(afterSection) {
    setAddSectionDialog({
      afterKey: afterSection && afterSection.key ? afterSection.key : null,
    })
    setNewSectionName('')
  }

  function confirmAddSection() {
    if (!addSectionDialog) return
    const afterKey = addSectionDialog.afterKey
    const name = String(newSectionName || '').trim() || ('Section ' + (sections.length + 1))
    const base = sectionsWithDrafts(sections, sectionDrafts)
    const next = insertChordsEditorSectionAfter(
      base,
      afterKey,
      name,
      tune.meter || '4/4'
    )
    setAddSectionDialog(null)
    setNewSectionName('')
    let addedKey = null
    if (afterKey) {
      const prevIndex = base.findIndex(function(s) { return s && s.key === afterKey })
      if (prevIndex >= 0 && next[prevIndex + 1]) addedKey = next[prevIndex + 1].key
    }
    if (!addedKey && next.length) addedKey = next[next.length - 1].key
    saveSectionsTransaction(next, { historyLabel: 'Add chord section', structural: true })
    if (addedKey) {
      window.setTimeout(function() {
        jumpToSection(next.find(function(s) { return s && s.key === addedKey }) || next[next.length - 1])
      }, 50)
    }
  }

  function deleteSection(section) {
    if (!section) return
    const title = section.title || 'this section'
    if (typeof window !== 'undefined' && window.confirm) {
      if (!window.confirm('Delete section "' + title + '"?')) return
    }
    const next = removeChordsEditorSection(
      sectionsWithDrafts(sections, sectionDrafts),
      section.key
    )
    setSectionDrafts(function(prev) {
      const copy = Object.assign({}, prev)
      delete copy[section.key]
      return copy
    })
    saveSectionsTransaction(next, { historyLabel: 'Delete chord section', structural: true })
  }

  function handleRecordSave(payload) {
    if (!recordTarget) return
    if (recordTarget.mode === 'all') {
      const reconciled = reconcileChordSectionsFromGrid(
        sections,
        String(payload.chart || ''),
        payload.meter || tune.meter || '4/4',
        payload.tempo != null ? payload.tempo : tune.tempo
      )
      saveSectionsTransaction(reconciled, {
        historyLabel: 'Save recorded chords',
        firstTempo: payload.tempo,
      })
    } else if (recordTarget.section) {
      const next = replaceSectionChart(
        sections,
        recordTarget.section.key,
        payload.chart,
        payload.meter || recordTarget.section.meter,
        payload.tempo != null ? payload.tempo : recordTarget.section.tempo
      )
      saveSectionsTransaction(next, {
        historyLabel: 'Save recorded section chords',
        firstTempo: firstSectionTempo(next, payload.tempo || tune.tempo),
      })
    }
    setRecordTarget(null)
  }

  function handleMeterChange(section, nextMeter) {
    if (!section || !nextMeter) return
    const next = replaceSectionMeter(
      sectionsWithDrafts(sections, sectionDrafts),
      section.key,
      nextMeter
    )
    setSections(next)
    committedSectionsRef.current = next
    saveSectionsTransaction(next, { historyLabel: 'Save section meter' })
  }

  function handleTempoChange(section, nextTempo) {
    if (!section || !(nextTempo > 0)) return
    const next = replaceSectionTempo(
      sectionsWithDrafts(sections, sectionDrafts),
      section.key,
      nextTempo
    )
    setSections(next)
    committedSectionsRef.current = next
    saveSectionsTransaction(next, {
      historyLabel: 'Save section tempo',
      firstTempo: firstSectionTempo(next, nextTempo),
    })
  }

  function handleStanzaNameChange(section, nextName) {
    if (!section) return
    const base = sectionsWithDrafts(sections, sectionDrafts)
    const renamed = renameChordsEditorSection(base, section.key, nextName)
    if (!renamed.ok) {
      toast.warning(renamed.error || 'Could not rename stanza')
      return
    }
    setSectionDrafts(function(prev) {
      const nextDrafts = {}
      renamed.sections.forEach(function(s, i) {
        const old = base[i]
        if (old && Object.prototype.hasOwnProperty.call(prev, old.key)) {
          nextDrafts[s.key] = prev[old.key]
        }
      })
      return nextDrafts
    })
    saveSectionsTransaction(renamed.sections, {
      historyLabel: 'Rename chord section',
      structural: true,
    })
  }

  function lyricStanzaOptions() {
    return listLyricSections(getLyricLines(tune)).map(function(section) {
      const label = section.title || section.header || 'Untitled'
      return { value: label, label: label }
    })
  }

  function sectionChartValue(section) {
    if (Object.prototype.hasOwnProperty.call(sectionDrafts, section.key)) {
      return sectionDrafts[section.key]
    }
    return String(section.chart || '')
  }

  function sectionsWithDrafts(baseSections, drafts) {
    let next = Array.isArray(baseSections) ? baseSections.slice() : []
    const d = drafts || sectionDrafts
    Object.keys(d).forEach(function(key) {
      const section = next.find(function(s) { return s && s.key === key })
      if (!section) return
      next = replaceSectionChart(next, key, d[key], section.meter)
    })
    return next
  }

  function scheduleSectionAutosave(sectionKey, historyLabel) {
    if (sectionSaveTimers.current[sectionKey]) {
      window.clearTimeout(sectionSaveTimers.current[sectionKey])
    }
    setSavingLabel('Saving…')
    sectionSaveTimers.current[sectionKey] = window.setTimeout(function() {
      delete sectionSaveTimers.current[sectionKey]
      setSectionDrafts(function(drafts) {
        const chart = Object.prototype.hasOwnProperty.call(drafts, sectionKey)
          ? drafts[sectionKey]
          : ''
        if (!chartLooksComplete(chart)) {
          setSavingLabel('')
          return drafts
        }
        const next = sectionsWithDrafts(committedSectionsRef.current, drafts)
        // Defer save so we return drafts synchronously from this updater
        window.setTimeout(function() {
          saveSectionsTransaction(next, {
            historyLabel: historyLabel || 'Save chords',
          })
        }, 0)
        return drafts
      })
    }, AUTOSAVE_MS)
  }

  function handleSectionDraftChange(section, value) {
    setSectionDrafts(function(prev) {
      return Object.assign({}, prev, { [section.key]: value })
    })
    scheduleSectionAutosave(section.key, 'Save section chords')
  }

  const savedWholeGrid = rebuildChordGridFromSections(sections)
  const wholeGridValue = wholeDraft != null ? wholeDraft : savedWholeGrid

  function scheduleWholeAutosave(text) {
    if (wholeSaveTimer.current) window.clearTimeout(wholeSaveTimer.current)
    setSavingLabel('Saving…')
    wholeSaveTimer.current = window.setTimeout(function() {
      wholeSaveTimer.current = null
      if (!chartLooksComplete(text)) {
        setSavingLabel('')
        return
      }
      const reconciled = reconcileBlocksFromGrid(
        sections,
        text,
        firstSectionMeter(sections, tune.meter)
      )
      // Also keep editor section shape via positional reconcile
      const asSections = reconcileChordSectionsFromGrid(
        sections,
        text,
        firstSectionMeter(sections, tune.meter)
      )
      void reconciled
      saveSectionsTransaction(asSections, { historyLabel: 'Save chords' })
    }, AUTOSAVE_MS)
  }

  function handleWholeDraftChange(value) {
    setWholeDraft(value)
    scheduleWholeAutosave(value)
  }

  function handlePasteSave(result) {
    if (!result) return
    const lyricLines = result.updateLyrics
      ? (Array.isArray(result.lyricLines) ? result.lyricLines : getPlainLyricLines(tune))
      : undefined
    const ok = saveSectionsTransaction(result.sections || [], {
      historyLabel: result.historyLabel || (result.updateLyrics ? 'Paste chords and lyrics' : 'Paste chords'),
      meta: result.meta,
      chordSheetAlignment: result.chordSheetAlignment,
      selectedMeterOption: result.selectedMeterOption,
      firstMeter: firstSectionMeter(result.sections || [], tune.meter),
      wipeNotation: true,
      updateLyrics: !!result.updateLyrics,
      lyricLines: lyricLines,
      successToast: result.updateLyrics
        ? 'Chords and lyrics updated'
        : 'Chords updated',
    })
    if (ok) {
      setShowPaste(false)
      setPasteInitialText(null)
      setPasteInitialUpdateLyrics(false)
      if (result.updateLyrics && Array.isArray(lyricLines) && typeof props.onLyricsImport === 'function') {
        props.onLyricsImport(lyricLines)
      }
    }
  }

  function firstReuseTitle(section) {
    if (!section || !section.chartRevisit) return null
    const typeKey = section.sourceTypeKey || section.type
    if (!typeKey) return null
    const source = sections.find(function(s) {
      return s && !s.chartRevisit && (s.sourceTypeKey || s.type) === typeKey
    })
    return source ? source.title : null
  }

  const strainWarning = (warningsBanner.current || []).find(function(w) {
    return w && w.code === 'strain_lyric_count_mismatch'
  })

  return (
    <div className="chords-wizard">
      <Form.Group controlId="chordwiz">
        <div className="chords-wizard-toolbar">
          <ChordSectionsDropdown
            sections={sections}
            tunebook={props.tunebook}
            defaultMeter={tune.meter || '4/4'}
            onChange={handleSectionsChange}
            onJump={jumpToSection}
          />
          <FieldLookupReviewButton
            tuneId={tune && tune.id}
            kind="chords"
            fallbackTitle={tune.name || ''}
            onApply={function(result, _job, meta) {
              if (meta && (meta.deferred || meta.keepCurrent)) return
              if (!result) return
              var text = ''
              if (result.chordProSource) text = String(result.chordProSource)
              else if (result.chordText) text = String(result.chordText)
              if (text) {
                setPasteInitialUpdateLyrics(false)
                setPasteInitialText(text)
                setShowPaste(true)
              }
            }}
          />
          <Form.Check
            type="switch"
            id="chords-hide-sections"
            label="Hide sections"
            checked={hideSections}
            onChange={function(e) {
              setHideSections(!!e.target.checked)
              setWholeDraft(null)
              setSectionDrafts({})
            }}
          />
          {savingLabel ? (
            <span className="text-muted small align-self-center">{savingLabel}</span>
          ) : null}
          <div className="chords-wizard-toolbar-end">
            <ChordsSearchButton
              tuneId={tune && tune.id}
              title={tune.name}
              artist={tune.composer || ''}
              rhythm={tune.rhythm || ''}
              currentGenre={tune.genre || ''}
              onGenreAccept={props.onGenreAccept}
              token={props.token}
              tunebook={props.tunebook}
              showLyricsCheckbox={false}
              defaultUpdateLyrics={false}
              confirmOverwrite={true}
              onChords={function(result, options) {
                const committed = commitChordSearchResultToTune({
                  result: result,
                  tune: tune,
                  abc: props.abc,
                  tunebook: props.tunebook,
                  abcjsParser: abcjsParser,
                  updateLyrics: !!(options && options.updateLyrics),
                  historyLabel: (options && options.updateLyrics)
                    ? 'Search chords and lyrics'
                    : 'Search chords',
                })
                if (!committed.ok) {
                  toast.error(
                    (committed.error && committed.error.message)
                      ? committed.error.message
                      : 'Could not apply chord search result'
                  )
                  return
                }
                localSectionsRef.current = true
                const next = loadSectionsFromAbc()
                setSections(next)
                committedSectionsRef.current = next
                setSectionDrafts({})
                setWholeDraft(null)
                if (committed.updateLyrics && Array.isArray(committed.lyricLines)
                  && typeof props.onLyricsImport === 'function') {
                  props.onLyricsImport(committed.lyricLines)
                }
                toast.success(
                  committed.updateLyrics
                    ? 'Chords and lyrics updated from search'
                    : 'Chords updated from search'
                )
              }}
              onLyrics={function() { /* lyrics applied via merge when selected */ }}
            />
            <Button
              variant="outline-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35em' }}
              title="Paste lyrics and chords"
              onClick={function() {
                setPasteInitialUpdateLyrics(false)
                setPasteInitialText(null)
                setShowPaste(true)
              }}
            >
              {props.tunebook && props.tunebook.icons ? props.tunebook.icons.paste : null}
              Paste chords and lyrics
            </Button>
          </div>
        </div>
      </Form.Group>

      {strainWarning ? (
        <p className="text-muted small mt-2 mb-0">{strainWarning.message}</p>
      ) : null}

      {hideSections ? (
        <div className="chords-wizard-single mt-3">
          <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
            <Button size="sm" variant="outline-secondary" onClick={openRecordAll}>Record</Button>
          </div>
          <Form.Control
            as="textarea"
            className="chords-wizard-textarea chords-wizard-textarea--whole"
            placeholder={"eg \nC|F# C|Cmin . . G |Cb\n\nD|D|A D . A |C"}
            value={wholeGridValue}
            onChange={function(e) {
              fitChordTextarea(e.target)
              handleWholeDraftChange(e.target.value)
            }}
            ref={fitChordTextarea}
          />
        </div>
      ) : (
        <div className="chords-wizard-sections mt-3">
          {sections.length === 0 ? (
            <p className="text-muted">No chord sections yet. Use Record or Paste.</p>
          ) : null}
          {sections.map(function(section) {
            const reuseTitle = firstReuseTitle(section)
            const isRevisit = !!section.chartRevisit
            return (
              <div
                key={section.key}
                ref={function(node) {
                  if (node) sectionRefs.current[section.key] = node
                  else delete sectionRefs.current[section.key]
                }}
                className="chords-wizard-section mb-3"
                style={{
                  border: highlightKey === section.key ? '2px solid var(--bs-primary)' : '1px solid var(--bs-border-color, #dee2e6)',
                  borderRadius: '0.35rem',
                  padding: '0.75em',
                }}
              >
                <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                  {!isRevisit ? (
                    <div style={{ minWidth: '6.5rem', maxWidth: '8rem' }}>
                      <CreatableSelect
                        value={section.meter ? { value: section.meter, label: section.meter } : null}
                        onChange={function(val) {
                          if (val && val.label) handleMeterChange(section, val.label)
                        }}
                        options={meterOptions}
                        isClearable={false}
                        blurInputOnSelect={true}
                        createOptionPosition="first"
                        allowCreateWhileLoading={true}
                        allowCreate={true}
                        menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
                        styles={{
                          container: function(base) { return Object.assign({}, base, { minWidth: '6rem' }) },
                          menuPortal: function(base) { return Object.assign({}, base, { zIndex: 9999 }) },
                        }}
                      />
                    </div>
                  ) : null}
                  {!isRevisit ? (
                    <Form.Control
                      type="number"
                      min="20"
                      max="300"
                      title="Tempo (BPM)"
                      aria-label={'Tempo for ' + (section.title || 'section')}
                      value={section.tempo > 0 ? section.tempo : (tune.tempo || 120)}
                      style={{ width: '4.75rem' }}
                      onChange={function(e) {
                        const next = parseInt(e.target.value, 10)
                        if (!isNaN(next) && next > 0) handleTempoChange(section, next)
                      }}
                    />
                  ) : null}
                  <div style={{ flex: '1 1 12rem', minWidth: '10rem', maxWidth: '22rem' }}>
                    <CreatableSelect
                      value={section.title ? { value: section.title, label: section.title } : null}
                      onChange={function(val) {
                        if (!val) return
                        handleStanzaNameChange(section, val.label || val.value)
                      }}
                      options={lyricStanzaOptions()}
                      placeholder="Stanza name"
                      isClearable={false}
                      blurInputOnSelect={true}
                      createOptionPosition="first"
                      allowCreateWhileLoading={true}
                      allowCreate={true}
                      formatCreateLabel={function(input) { return 'Use "' + input + '"' }}
                      menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
                      styles={{
                        container: function(base) { return Object.assign({}, base, { width: '100%' }) },
                        menuPortal: function(base) { return Object.assign({}, base, { zIndex: 9999 }) },
                      }}
                    />
                  </div>
                  {!isRevisit ? (
                    <>
                      <Button size="sm" variant="outline-secondary" onClick={function() { openRecordSection(section) }}>
                        Record
                      </Button>
                      <Button size="sm" variant="outline-primary" onClick={function() { openAddSectionDialog(section) }}>
                        New
                      </Button>
                      <Button
                        size="sm"
                        variant="outline-danger"
                        onClick={function() { deleteSection(section) }}
                        disabled={sections.filter(function(s) { return s && !s.chartRevisit }).length <= 1}
                      >
                        Delete
                      </Button>
                    </>
                  ) : null}
                </div>
                {isRevisit ? (
                  <div className="text-muted small mb-0">
                    {reuseTitle ? ('Same chords as ' + reuseTitle) : 'Uses chords from an earlier section'}
                  </div>
                ) : (
                  <Form.Control
                    as="textarea"
                    className="chords-wizard-textarea"
                    placeholder={"eg \nC|F# C|Cmin . . G |Cb"}
                    value={sectionChartValue(section)}
                    onChange={function(e) {
                      fitChordTextarea(e.target)
                      handleSectionDraftChange(section, e.target.value)
                    }}
                    ref={fitChordTextarea}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      <ChordMergeFailureToast
        failure={mergeFailure}
        onDismiss={function() { setMergeFailure(null) }}
      />

      <ChordSectionRecordModal
        show={!!recordTarget}
        onHide={function() { setRecordTarget(null) }}
        title={
          recordTarget && recordTarget.mode === 'all'
            ? 'Record chords'
            : (recordTarget && recordTarget.section ? ('Record · ' + recordTarget.section.title) : 'Record chords')
        }
        tune={tune}
        meterOptions={meterOptions}
        sectionKey={recordTarget && recordTarget.section ? recordTarget.section.key : 'all'}
        chart={
          recordTarget && recordTarget.mode === 'all'
            ? recordTarget.chart
            : (recordTarget && recordTarget.section ? recordTarget.section.chart : '')
        }
        meter={
          recordTarget && recordTarget.mode === 'all'
            ? recordTarget.meter
            : (recordTarget && recordTarget.section ? recordTarget.section.meter : tune.meter)
        }
        tempo={
          recordTarget && recordTarget.mode === 'all'
            ? recordTarget.tempo
            : (recordTarget && recordTarget.section
              ? (recordTarget.section.tempo || tune.tempo)
              : tune.tempo)
        }
        autoActivate={!!props.autoActivateChordRecord && !!recordTarget}
        onSave={handleRecordSave}
      />

      <PasteChordSheetModal
        show={showPaste}
        onHide={function() {
          setShowPaste(false)
          setPasteInitialText(null)
          setPasteInitialUpdateLyrics(false)
        }}
        tune={tune}
        tuneSections={sections}
        initialText={pasteInitialText}
        initialUpdateLyrics={pasteInitialUpdateLyrics}
        onSaveSections={handlePasteSave}
      />

      <Modal
        show={!!addSectionDialog}
        onHide={function() { setAddSectionDialog(null); setNewSectionName('') }}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>New section</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group controlId="chords-new-section-name">
            <Form.Label>Section name</Form.Label>
            <Form.Control
              autoFocus
              value={newSectionName}
              placeholder="e.g. Bridge"
              onChange={function(e) { setNewSectionName(e.target.value) }}
              onKeyDown={function(e) {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  confirmAddSection()
                }
              }}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={function() { setAddSectionDialog(null); setNewSectionName('') }}>
            Cancel
          </Button>
          <Button variant="success" onClick={confirmAddSection}>
            Add
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}
