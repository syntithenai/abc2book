import { Alert, Button, Form, Modal } from 'react-bootstrap'
import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { toast } from 'react-toastify'
import useAbcjsParser from '../useAbcjsParser'
import CreatableSelect from 'react-select/creatable'
import ChordsSearchButton from './ChordsSearchButton'
import { getLyricLines, getPlainLyricLines, setPlainLyricLines } from '../wLinesUtils'
import ChordSectionsDropdown from './ChordSectionsDropdown'
import ChordSectionRecordModal from './ChordSectionRecordModal'
import ChordMergeFailureToast from './ChordMergeFailureToast'
import VoiceFillInput from './VoiceFillInput'
import KeySignatureInput from './KeySignatureInput'
import LyricsChordsHelpModal from './LyricsChordsHelpModal'
import { commitChordSearchResultToTune } from '../commitChordSearchResultToTune'
import { commitPasteChordSheetToTune } from '../commitPasteChordSheetToTune'
import {
  sectionMarkerChartLine,
  formatSectionChartForEditor,
  parseSectionChartFromEditor,
  stripChartStructureMarkers,
  normalizeChordChartRepeatMarks,
  splitChartHeaderAndBody,
  hasLyricEmbeddedChords,
  chartBlockHasChords,
} from '../chordSheetUtils'
import { applyNotationChordsToLyricChordPro } from '../applyNotationChordsToLyrics'
import { parseChordSheetText } from '../chordProFormatUtils'
import { buildChordSheetAlignmentFromLines } from '../chordSheetImportUtils'
import {
  buildTuneSectionsFromPaste,
  firstSectionMeter,
  firstSectionKey,
  firstSectionTempo,
  insertChordsEditorSectionAfter,
  listPasteChordSections,
  rebuildChordGridFromSections,
  reconcileChordSectionsFromGrid,
  removeChordsEditorSection,
  replaceSectionChart,
  replaceSectionKey,
  replaceSectionMeter,
  replaceSectionTempo,
  prepareSectionChartDraft,
  prepareChordGridDraft,
  reindexChordsEditorSectionKeys,
  chordSectionLabelsFromSections,
} from '../chordsEditorSections'
import {
  applyBlockMergeToTune,
  alignBlockChartsToMelody,
  buildUnifiedBlocks,
  chordBlockCacheMatchesMelody,
  enrichBlocksWithNotationMarkerFlags,
  hashAbcNotes,
  invalidateChordBlockCache,
  readChordBlockCache,
  reconcileBlocksFromGrid,
  reanchorEditorBlocksToMelody,
  splitChordGridAcrossMelodyStrains,
  syncChordSectionLabelsFromPrimaryVoice,
  writeChordBlockCache,
  chordNoteLinesFromTune,
} from '../chordBlockMerge'
import { resolvePrimaryVoiceKey } from '../abcVoiceUtils'
import { fillEmptyTuneFieldsFromMeta } from '../applyChordSheetToTune'
import { noteLinesHaveRealMelody } from '../timedImportFinalizer'
import { tuneHasLyricEmbeddedChords } from '../timedLyricsChordsDisplay'
import { allGenres } from '../tuneBibliographicUtils'

const AUTOSAVE_MS = 400
const WHOLE_DRAFT_WARNING_KEY = '__whole__'

function editableSectionsList(sections) {
  return (sections || []).filter(function(s) { return s && !s.chartRevisit })
}

function sectionKeyForBlockIndex(sections, blockIndex) {
  const editable = editableSectionsList(sections)
  const idx = Number(blockIndex)
  if (!Number.isFinite(idx) || idx < 0 || idx >= editable.length) return null
  return editable[idx].key
}

function warningTargetKeyForFailure(sections, failure, fallbackKey) {
  if (failure && failure.blockIndex != null) {
    const key = sectionKeyForBlockIndex(sections, failure.blockIndex)
    if (key) return key
  }
  return fallbackKey || WHOLE_DRAFT_WARNING_KEY
}

function draftSaveFailure(message, extras) {
  return Object.assign({
    code: 'chart_save_blocked',
    message: message,
    fixHint: 'Your chord chart was kept as you typed it. Fix the issue above, then try again.',
  }, extras || {})
}

function remapSectionDraftKeys(beforeSections, afterSections, drafts) {
  if (!drafts || !Object.keys(drafts).length) return {}
  const next = {}
  const beforeList = Array.isArray(beforeSections) ? beforeSections : []
  const afterList = Array.isArray(afterSections) ? afterSections : []
  afterList.forEach(function(section, index) {
    const before = beforeList[index]
    if (!section) return
    if (before && Object.prototype.hasOwnProperty.call(drafts, before.key)) {
      next[section.key] = drafts[before.key]
      return
    }
    if (Object.prototype.hasOwnProperty.call(drafts, section.key)) {
      next[section.key] = drafts[section.key]
    }
  })
  return next
}

function chartLooksComplete(text) {
  const lines = String(text || '').split(/\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    if (/^\[M:/i.test(line)) continue
    // Prefer trailing |, but allow pasted lines like "Em | Am" that already
    // have bar separators and end on a chord token.
    if (/\|\s*$/.test(line)) continue
    if (/\|/.test(line) && /[A-Ga-g][#b]?[^\s|]*\s*$/.test(line)) continue
    return false
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
  const [showOverrideFromLyricsConfirm, setShowOverrideFromLyricsConfirm] = useState(false)
  const [showApplyToLyricsConfirm, setShowApplyToLyricsConfirm] = useState(false)
  const [showLyricsChordsHelp, setShowLyricsChordsHelp] = useState(false)
  const [melodyConflict, setMelodyConflict] = useState(null)
  const [highlightKey, setHighlightKey] = useState(null)
  const [draftWarnings, setDraftWarnings] = useState({})
  const [savingLabel, setSavingLabel] = useState('')
  const [addSectionDialog, setAddSectionDialog] = useState(null)
  const [newSectionName, setNewSectionName] = useState('')
  const sectionRefs = useRef({})
  const localSectionsRef = useRef(false)
  const autoRecordOpenedRef = useRef(false)
  const sectionSaveTimers = useRef({})
  const wholeSaveTimer = useRef(null)
  const committedSectionsRef = useRef([])
  const sectionDraftsRef = useRef({})
  const wholeDraftRef = useRef(null)
  const markerNoticeShownRef = useRef(false)
  const melodyHashRef = useRef(null)
  const ownChordSaveRef = useRef(false)
  const pendingSaveRef = useRef(null)
  const flushPendingSavesRef = useRef(null)
  const [showMarkerConfirm, setShowMarkerConfirm] = useState(false)
  const warningsBanner = useRef([])

  useEffect(function() {
    sectionDraftsRef.current = sectionDrafts
  }, [sectionDrafts])

  useEffect(function() {
    wholeDraftRef.current = wholeDraft
  }, [wholeDraft])

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

  function currentAbcString() {
    if (!props.tunebook || !props.tunebook.abcTools || !tune) {
      return props.abc || ''
    }
    return props.tunebook.abcTools.json2abc(tune)
  }

  function loadSectionsFromAbc() {
    const lyricLines = getLyricLines(tune)
    const noteLines = primaryNoteLines()
    const abcHash = hashAbcNotes(noteLines)
    const cache = readChordBlockCache(tune)
    if (
      cache
      && cache.abcHash === abcHash
      && Array.isArray(cache.blocks)
      && cache.blocks.length
    ) {
      if (chordBlockCacheMatchesMelody(noteLines, cache.blocks)) {
        return enrichBlocksWithNotationMarkerFlags(
          alignBlockChartsToMelody(noteLines, cache.blocks),
          noteLines
        )
      }
      invalidateChordBlockCache(tune)
    }
    const chordChart = abcjsParser.renderChords(currentAbcString(), true)
    const displayChordChart = abcjsParser.renderChords(currentAbcString(), false)
    const extracted = buildUnifiedBlocks({
      noteLines: noteLines,
      chordChart: chordChart,
      displayChordChart: displayChordChart,
      lyricLines: lyricLines,
      title: tune.name || tune.title,
      composer: tune.composer,
      defaultMeter: tune.meter || '4/4',
      defaultKey: tune.key || 'C',
      defaultTempo: tune.tempo || 120,
      defaultNoteLength: tune.noteLength || '1/8',
    })
    warningsBanner.current = extracted.warnings || []
    writeChordBlockCache(tune, extracted.abcHash, extracted.blocks)
    tune.chordSectionLabels = chordSectionLabelsFromSections(extracted.blocks)
    return enrichBlocksWithNotationMarkerFlags(
      alignBlockChartsToMelody(noteLines, extracted.blocks),
      noteLines
    )
  }

  function refreshSectionsFromMelody() {
    invalidateChordBlockCache(tune)
    const noteLines = primaryNoteLines()
    syncChordSectionLabelsFromPrimaryVoice(tune, noteLines)
    const next = loadSectionsFromAbc()
    tune.chordSectionLabels = chordSectionLabelsFromSections(next)
    localSectionsRef.current = true
    setSections(next)
    committedSectionsRef.current = next
    setSectionDrafts({})
    setWholeDraft(null)
    setDraftWarnings({})
    setMelodyConflict(null)
    melodyHashRef.current = hashAbcNotes(noteLines)
  }

  function hasPendingChordDrafts() {
    return Object.keys(sectionDrafts).length > 0 || wholeDraft != null
  }

  function hasIncompleteChordDrafts() {
    if (wholeDraft != null && !chartLooksComplete(wholeDraft)) return true
    return Object.keys(sectionDrafts).some(function(key) {
      return !chartLooksComplete(sectionDrafts[key])
    })
  }

  function discardDraftsAndReloadFromNotation() {
    setSectionDrafts({})
    setWholeDraft(null)
    setDraftWarnings({})
    setMelodyConflict(null)
    refreshSectionsFromMelody()
    toast.info('Chord grid refreshed from notation.')
  }

  useEffect(function() {
    if (localSectionsRef.current) {
      localSectionsRef.current = false
      return
    }
    if (ownChordSaveRef.current) {
      ownChordSaveRef.current = false
      melodyHashRef.current = hashAbcNotes(primaryNoteLines())
      setMelodyConflict(null)
      return
    }
    if (!Array.isArray(props.notes) && !props.abc) return

    const noteLines = primaryNoteLines()
    const abcHash = hashAbcNotes(noteLines)
    const isFirstLoad = melodyHashRef.current == null
    const hashChanged = !isFirstLoad && melodyHashRef.current !== abcHash

    if (!isFirstLoad && !hashChanged) {
      return
    }

    if (hashChanged && hasPendingChordDrafts()) {
      setMelodyConflict({ abcHash: abcHash })
      return
    }

    setMelodyConflict(null)
    melodyHashRef.current = abcHash
    const next = loadSectionsFromAbc()
    setSections(next)
    committedSectionsRef.current = next
    setSectionDrafts({})
    setWholeDraft(null)
    setDraftWarnings({})
  }, [props.notes, props.abc])

  useEffect(function() {
    if (props.pendingChordImport && String(props.pendingChordImport).trim()) {
      toast.info('Paste chord sheets via Import → Chord sheet. Lyrics with chords can be pasted into the Lyrics editor.')
      if (typeof props.onConsumePendingChordImport === 'function') {
        props.onConsumePendingChordImport()
      }
    }
  }, [props.pendingChordImport, props.onConsumePendingChordImport])

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

  function flushPendingChordSaves() {
    const pendingSectionKeys = Object.keys(sectionSaveTimers.current)
    pendingSectionKeys.forEach(function(key) {
      window.clearTimeout(sectionSaveTimers.current[key])
      delete sectionSaveTimers.current[key]
    })
    if (wholeSaveTimer.current) {
      window.clearTimeout(wholeSaveTimer.current)
      wholeSaveTimer.current = null
    }

    const whole = wholeDraftRef.current
    if (whole != null && chartLooksComplete(whole)) {
      const noteLength = tune.noteLength || '1/8'
      const alignedText = splitChordGridAcrossMelodyStrains(whole, primaryNoteLines())
      const prep = prepareChordGridDraft(committedSectionsRef.current, alignedText, noteLength)
      if (prep.ok) {
        let baseSections = committedSectionsRef.current.slice()
        if (prep.headerPatches && prep.headerPatches.length) {
          prep.headerPatches.forEach(function(entry) {
            if (!entry || entry.index < 0 || entry.index >= baseSections.length) return
            baseSections[entry.index] = Object.assign({}, baseSections[entry.index], entry.patch)
          })
          baseSections = reindexChordsEditorSectionKeys(baseSections)
        }
        const asSections = reconcileChordSectionsFromGrid(
          baseSections,
          prep.grid,
          firstSectionMeter(baseSections, tune.meter),
          firstSectionTempo(baseSections, tune.tempo),
          firstSectionKey(baseSections, tune.key)
        )
        saveSectionsTransaction(reindexChordsEditorSectionKeys(asSections), {
          historyLabel: 'Save chords',
        })
      }
      return
    }

    const drafts = sectionDraftsRef.current || {}
    const draftKeys = Object.keys(drafts)
    if (!draftKeys.length) return
    const incomplete = draftKeys.some(function(key) {
      return !chartLooksComplete(drafts[key])
    })
    if (incomplete) return
    try {
      const prepared = sectionsWithDrafts(committedSectionsRef.current, drafts)
      saveSectionsTransaction(prepared.sections, {
        historyLabel: 'Save section chords',
        updateLyrics: prepared.updateLyrics,
        lyricLines: prepared.lyricLines,
      })
    } catch (e) {
      if (!(e && e.chartSaveBlocked)) throw e
    }
  }

  flushPendingSavesRef.current = flushPendingChordSaves

  useEffect(function() {
    return function() {
      if (typeof flushPendingSavesRef.current === 'function') {
        flushPendingSavesRef.current()
      }
    }
  }, [])

  useLayoutEffect(function() {
    const root = typeof document !== 'undefined'
      ? document.querySelector('.chords-wizard')
      : null
    if (!root) return
    root.querySelectorAll('textarea.chords-wizard-textarea').forEach(fitChordTextarea)
  }, [sections, sectionDrafts, wholeDraft, hideSections])

  function clearDraftWarning(targetKey) {
    if (!targetKey) return
    setDraftWarnings(function(prev) {
      if (!prev[targetKey]) return prev
      const next = Object.assign({}, prev)
      delete next[targetKey]
      return next
    })
  }

  function setDraftWarning(targetKey, failure) {
    if (!targetKey || !failure) return
    setDraftWarnings(function(prev) {
      return Object.assign({}, prev, { [targetKey]: failure })
    })
  }

  function mergeFailureRefreshHandler(failure) {
    if (
      failure
      && (
        failure.code === 'block_count_mismatch'
        || failure.code === 'invariant_violation'
      )
    ) {
      return refreshSectionsFromMelody
    }
    return null
  }

  function renderDraftWarning(targetKey) {
    const failure = draftWarnings[targetKey]
    if (!failure) return null
    return (
      <ChordMergeFailureToast
        failure={failure}
        onDismiss={function() { clearDraftWarning(targetKey) }}
        onRefresh={mergeFailureRefreshHandler(failure)}
      />
    )
  }

  function saveSectionsTransaction(nextSections, options) {
    const opts = options || {}
    const wouldWriteMarkers = (nextSections || []).some(function(s) {
      return s && s.header && s.writeNotationMarker && !s.notationMarkerWritten
    })
    if (wouldWriteMarkers && !markerNoticeShownRef.current) {
      pendingSaveRef.current = { nextSections: nextSections, options: opts }
      setShowMarkerConfirm(true)
      setSavingLabel('')
      return false
    }
    return commitSectionsTransaction(nextSections, opts)
  }

  function commitSectionsTransaction(nextSections, options) {
    const opts = options || {}
    const currentAbc = currentAbcString()
    const notesBefore = primaryNoteLines()
    const anchoredSections = reanchorEditorBlocksToMelody(notesBefore, nextSections)

    if (tune.timingScaffold) tune.timingScaffold = true
    fillEmptyTuneFieldsFromMeta(tune, opts.meta)
    if (opts.selectedMeterOption && opts.selectedMeterOption.meter) {
      tune.meter = opts.selectedMeterOption.meter
    }
    if (opts.chordSheetAlignment !== undefined) {
      tune.meta = Object.assign({}, tune.meta || {}, {
        chordSheetAlignment: opts.chordSheetAlignment,
      })
    }

    const firstMeter = opts.firstMeter || firstSectionMeter(nextSections, tune.meter)
    const firstKey = opts.firstKey || firstSectionKey(nextSections, tune.key)
    const firstTempo = opts.firstTempo || firstSectionTempo(nextSections, tune.tempo)
    if (opts.wouldWriteMarkers) {
      markerNoticeShownRef.current = true
      toast.info('Section labels will be written into notation. Use Undo to revert.')
    }
    const expandNotation = !!opts.expandNotation
    const wipeNotation = !!opts.wipeNotation || (
      !!opts.rebuildScaffold
      && (!noteLinesHaveRealMelody(notesBefore) || !!tune.timingScaffold)
    )
    const result = applyBlockMergeToTune(tune, {
      abc: currentAbc,
      blocks: anchoredSections,
      tunebook: props.tunebook,
      abcjsParser: abcjsParser,
      wipeNotation: wipeNotation,
      clearTransientTimed: wipeNotation,
      keepEditorBlocks: true,
      chordSheetAlignment: opts.chordSheetAlignment,
      defaultMeter: firstMeter,
      firstMeter: firstMeter,
      firstKey: firstKey,
      defaultTempo: firstTempo,
      firstTempo: firstTempo,
      updateLyrics: !!opts.updateLyrics,
      lyricLines: opts.lyricLines,
      notesBefore: notesBefore,
    })

    if (!result.ok) {
      const targetKey = warningTargetKeyForFailure(
        nextSections,
        result.error,
        opts.draftWarningKey
      )
      setDraftWarning(targetKey, result.error)
      setSavingLabel('')
      return false
    }

    setDraftWarnings({})
    melodyHashRef.current = hashAbcNotes(primaryNoteLines())
    ownChordSaveRef.current = true
    localSectionsRef.current = true
    const beforeSections = committedSectionsRef.current
    const committed = Array.isArray(nextSections) ? nextSections.slice() : (result.blocks || [])
    setSections(committed)
    committedSectionsRef.current = committed
    if (opts.clearDraftsOnSuccess) {
      setSectionDrafts({})
      setWholeDraft(null)
    } else if (opts.clearSectionDraftKey) {
      setSectionDrafts(function(prev) {
        const next = remapSectionDraftKeys(beforeSections, committed, prev)
        delete next[opts.clearSectionDraftKey]
        return next
      })
    } else {
      setSectionDrafts(function(prev) {
        return remapSectionDraftKeys(beforeSections, committed, prev)
      })
    }

    props.tunebook.saveTune(tune, false, {
      historyLabel: opts.historyLabel || 'Save chords',
      immediate: true,
    })
    setSavingLabel('')
    if (opts.successToast) {
      toast.success(opts.successToast)
    }
    return true
  }

  function confirmMarkerWrite() {
    setShowMarkerConfirm(false)
    const pending = pendingSaveRef.current
    pendingSaveRef.current = null
    if (!pending) return
    markerNoticeShownRef.current = true
    commitSectionsTransaction(pending.nextSections, Object.assign({}, pending.options, {
      wouldWriteMarkers: true,
    }))
  }

  function cancelMarkerWrite() {
    setShowMarkerConfirm(false)
    pendingSaveRef.current = null
    setSavingLabel('')
  }

  function handleSectionsChange(nextSections) {
    // Dropdown Add uses the same callback; expand onto the primary voice when
    // any section still needs an ABC strain (needsAbcExpand).
    const needsExpand = (nextSections || []).some(function(s) {
      return s && s.needsAbcExpand
    })
    saveSectionsTransaction(nextSections, {
      historyLabel: needsExpand ? 'Add chord section' : 'Reorder chord sections',
      structural: needsExpand,
      expandNotation: needsExpand,
    })
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
    const base = sectionsWithDrafts(sections, sectionDrafts).sections
    const next = insertChordsEditorSectionAfter(
      base,
      afterKey,
      name
    )
    setAddSectionDialog(null)
    setNewSectionName('')
    let addedKey = null
    if (afterKey) {
      const prevIndex = base.findIndex(function(s) { return s && s.key === afterKey })
      if (prevIndex >= 0 && next[prevIndex + 1]) addedKey = next[prevIndex + 1].key
    }
    if (!addedKey && next.length) addedKey = next[next.length - 1].key
    saveSectionsTransaction(next, {
      historyLabel: 'Add chord section',
      structural: true,
      expandNotation: true,
    })
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
      sectionsWithDrafts(sections, sectionDrafts).sections,
      section.key
    )
    setSectionDrafts(function(prev) {
      const copy = Object.assign({}, prev)
      delete copy[section.key]
      return copy
    })
    saveSectionsTransaction(next, {
      historyLabel: 'Delete chord section',
      rebuildScaffold: !noteLinesHaveRealMelody(primaryNoteLines()) || !!tune.timingScaffold,
    })
  }

  function handleRecordSave(payload) {
    if (!recordTarget) return
    if (recordTarget.mode === 'all') {
      const chartText = splitChordGridAcrossMelodyStrains(
        String(payload.chart || ''),
        primaryNoteLines()
      )
      const noteLength = tune.noteLength || '1/8'
      const prep = prepareChordGridDraft(sections, chartText, noteLength)
      const gridText = prep.ok ? prep.grid : chartText
      let baseSections = sections.slice()
      if (prep.ok && prep.headerPatches && prep.headerPatches.length) {
        // Chart # headers may set notation-marker flags only — never retitle
        // sections or rewrite lyric markers from the chords editor.
        prep.headerPatches.forEach(function(entry) {
          if (!entry || entry.index < 0 || entry.index >= baseSections.length) return
          if (!entry.patch || !entry.patch.writeNotationMarker) return
          baseSections[entry.index] = Object.assign({}, baseSections[entry.index], {
            writeNotationMarker: true,
          })
        })
      }
      if (!prep.ok) {
        toast.warning(prep.error || 'Could not save recorded chords')
        return
      }
      const reconciled = reconcileChordSectionsFromGrid(
        baseSections,
        gridText,
        payload.meter || tune.meter || '4/4',
        payload.tempo != null ? payload.tempo : tune.tempo,
        tune.key || 'C'
      )
      saveSectionsTransaction(reindexChordsEditorSectionKeys(reconciled), {
        historyLabel: 'Save recorded chords',
        firstTempo: payload.tempo,
        clearDraftsOnSuccess: true,
      })
    } else if (recordTarget.section) {
      const sectionKey = recordTarget.section.key
      const next = replaceSectionChart(
        sections,
        sectionKey,
        payload.chart,
        payload.meter || recordTarget.section.meter,
        payload.tempo != null ? payload.tempo : recordTarget.section.tempo
      )
      saveSectionsTransaction(next, {
        historyLabel: 'Save recorded section chords',
        firstTempo: firstSectionTempo(next, payload.tempo || tune.tempo),
        clearSectionDraftKey: sectionKey,
      })
    }
    setRecordTarget(null)
  }

  function handleKeyChange(section, nextKey) {
    if (!section || !nextKey) return
    const next = replaceSectionKey(
      sectionsWithDrafts(sections, sectionDrafts).sections,
      section.key,
      nextKey
    )
    setSections(next)
    committedSectionsRef.current = next
    saveSectionsTransaction(next, { historyLabel: 'Save section key' })
  }

  function handleMeterChange(section, nextMeter) {
    if (!section || !nextMeter) return
    const noteLength = tune.noteLength || '1/8'
    const result = replaceSectionMeter(
      sectionsWithDrafts(sections, sectionDrafts).sections,
      section.key,
      nextMeter,
      noteLength
    )
    if (!result.ok) {
      toast.warning(result.error || 'Meter change would drop chords')
      return
    }
    const next = result.sections
    setSections(next)
    committedSectionsRef.current = next
    saveSectionsTransaction(next, { historyLabel: 'Save section meter' })
  }

  function handleTempoChange(section, nextTempo) {
    if (!section || !(nextTempo > 0)) return
    const next = replaceSectionTempo(
      sectionsWithDrafts(sections, sectionDrafts).sections,
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

  function sectionChartValue(section) {
    if (Object.prototype.hasOwnProperty.call(sectionDrafts, section.key)) {
      return sectionDrafts[section.key]
    }
    return formatSectionChartForEditor(section)
  }

  function sectionsWithDrafts(baseSections, drafts) {
    let next = Array.isArray(baseSections) ? baseSections.slice() : []
    const d = drafts || sectionDrafts
    const noteLength = tune.noteLength || '1/8'
    Object.keys(d).forEach(function(key) {
      const sectionIndex = next.findIndex(function(s) { return s && s.key === key })
      if (sectionIndex < 0) return
      const section = next[sectionIndex]
      const parsed = parseSectionChartFromEditor(d[key])
      const prep = prepareSectionChartDraft(section, parsed.cleanChart, noteLength)
      if (!prep.ok) {
        const err = new Error(prep.error || 'Chart save blocked')
        err.chartSaveBlocked = true
        err.prep = prep
        throw err
      }
      let chart = stripChartStructureMarkers(prep.chart)
      // Do not trim the chart to the current ABC bar count here — that silently
      // dropped bars the user just added. Rest scaffolds expand on merge;
      // pitched melody fails closed with a draft warning instead.
      const draftSplit = splitChartHeaderAndBody(d[key])
      const structurePatch = {
        strainStartBarline: parsed.strainStartBarline,
        strainEndBarline: parsed.strainEndBarline,
        endingMarkers: parsed.endingMarkers,
        displayChart: normalizeChordChartRepeatMarks(draftSplit.body || ''),
      }
      if (prep.headerPatch && prep.headerPatch.writeNotationMarker) {
        next[sectionIndex] = Object.assign({}, section, {
          writeNotationMarker: true,
        })
      }
      const opts = {}
      if (prep.writeNotationMarker) opts.writeNotationMarker = true
      next = replaceSectionChart(
        next,
        key,
        chart,
        section.meter,
        undefined,
        undefined,
        opts
      )
      const typeKey = section.sourceTypeKey || section.type
      next = next.map(function(s) {
        if (!s) return s
        if (s.key === key) {
          return Object.assign({}, s, structurePatch)
        }
        if (typeKey && (s.sourceTypeKey || s.type) === typeKey) {
          return Object.assign({}, s, structurePatch)
        }
        return s
      })
    })
    return {
      sections: reindexChordsEditorSectionKeys(next),
      updateLyrics: false,
      lyricLines: null,
    }
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
        const prepared = (function() {
          try {
            return sectionsWithDrafts(committedSectionsRef.current, drafts)
          } catch (e) {
            if (e && e.chartSaveBlocked) {
              setDraftWarning(
                sectionKey,
                draftSaveFailure(e.message || 'Could not save chart')
              )
              setSavingLabel('')
              return null
            }
            throw e
          }
        })()
        if (!prepared) return drafts
        // Defer save so we return drafts synchronously from this updater
        window.setTimeout(function() {
          saveSectionsTransaction(prepared.sections, {
            historyLabel: historyLabel || 'Save chords',
            draftWarningKey: sectionKey,
          })
        }, 0)
        return drafts
      })
    }, AUTOSAVE_MS)
  }

  function handleSectionDraftChange(section, value) {
    clearDraftWarning(section.key)
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
      const noteLength = tune.noteLength || '1/8'
      const alignedText = splitChordGridAcrossMelodyStrains(text, primaryNoteLines())
      const prep = prepareChordGridDraft(sections, alignedText, noteLength)
      if (!prep.ok) {
        setDraftWarning(
          WHOLE_DRAFT_WARNING_KEY,
          draftSaveFailure(prep.error || 'Could not save chart')
        )
        setSavingLabel('')
        return
      }
      let baseSections = sections.slice()
      if (prep.headerPatches && prep.headerPatches.length) {
        prep.headerPatches.forEach(function(entry) {
          if (!entry || entry.index < 0 || entry.index >= baseSections.length) return
          if (!entry.patch || !entry.patch.writeNotationMarker) return
          baseSections[entry.index] = Object.assign({}, baseSections[entry.index], {
            writeNotationMarker: true,
          })
        })
      }
      const reconciled = reconcileBlocksFromGrid(
        baseSections,
        prep.grid,
        firstSectionMeter(baseSections, tune.meter)
      )
      const asSections = reconcileChordSectionsFromGrid(
        baseSections,
        prep.grid,
        firstSectionMeter(baseSections, tune.meter),
        firstSectionTempo(baseSections, tune.tempo),
        firstSectionKey(baseSections, tune.key)
      )
      void reconciled
      saveSectionsTransaction(reindexChordsEditorSectionKeys(asSections), {
        historyLabel: 'Save chords',
        draftWarningKey: WHOLE_DRAFT_WARNING_KEY,
      })
    }, AUTOSAVE_MS)
  }

  function handleWholeDraftChange(value) {
    clearDraftWarning(WHOLE_DRAFT_WARNING_KEY)
    setWholeDraft(value)
    scheduleWholeAutosave(value)
  }

  function applyChordsFromLyricsSheet() {
    const lyricLines = getPlainLyricLines(tune)
    if (!hasLyricEmbeddedChords(lyricLines)) {
      toast.warning('Lyrics do not contain chords to apply')
      return
    }
    // Build alignment from the lyrics field so section headers and ChordPro
    // inline chords survive ChordSheetJS round-tripping (which drops # headers).
    const alignment = buildChordSheetAlignmentFromLines(lyricLines)
    let parsedMeta = {
      title: tune.name,
      composer: tune.composer,
      key: tune.key,
      capo: tune.capo,
      tempo: tune.tempo,
      meter: tune.meter || '4/4',
      chordProSource: lyricLines.join('\n'),
      chordSheetAlignment: alignment,
    }
    try {
      const parsed = parseChordSheetText(lyricLines.join('\n'), { fallbackTitle: tune.name })
      parsedMeta = Object.assign({}, parsedMeta, {
        title: parsed.title || parsedMeta.title,
        composer: parsed.composer || parsedMeta.composer,
        key: parsed.key || parsedMeta.key,
        capo: parsed.capo != null ? parsed.capo : parsedMeta.capo,
        tempo: parsed.tempo != null ? parsed.tempo : parsedMeta.tempo,
        meter: parsed.meter || parsedMeta.meter,
        chordProSource: parsed.chordProSource || parsedMeta.chordProSource,
      })
    } catch (e) {
      // Alignment from lyrics is enough when ChordSheetJS cannot parse.
    }
    const pasteSections = listPasteChordSections({
      chordSheetAlignment: alignment,
      meter: parsedMeta.meter,
      key: parsedMeta.key,
      tempo: parsedMeta.tempo,
    })
    if (!pasteSections.length) {
      toast.error('No chord sections found in lyrics')
      return
    }
    const defaultMeter = firstSectionMeter(pasteSections, tune.meter || parsedMeta.meter || '4/4')
    const nextSections = buildTuneSectionsFromPaste(pasteSections, defaultMeter)
    const committed = commitPasteChordSheetToTune({
      result: {
        sections: nextSections,
        meta: {
          title: parsedMeta.title || tune.name,
          name: parsedMeta.title || tune.name,
          composer: parsedMeta.composer || tune.composer,
          key: parsedMeta.key || tune.key,
          capo: parsedMeta.capo != null ? parsedMeta.capo : tune.capo,
          tempo: parsedMeta.tempo != null ? parsedMeta.tempo : tune.tempo,
          meter: defaultMeter,
          chordProSource: parsedMeta.chordProSource,
        },
        chordSheetAlignment: alignment,
        chordProSource: parsedMeta.chordProSource,
        selectedMeterOption: { meter: defaultMeter, id: 'first-section' },
        updateLyrics: true,
        lyricLines: lyricLines,
      },
      tune: tune,
      abc: currentAbcString(),
      tunebook: props.tunebook,
      abcjsParser: abcjsParser,
      forceUpdateLyrics: true,
      skipAbcMerge: false,
      historyLabel: 'Apply chords from lyrics sheet',
    })
    if (!committed.ok) {
      toast.error(
        (committed.error && committed.error.message)
          ? committed.error.message
          : 'Could not apply chords from lyrics'
      )
      return
    }
    localSectionsRef.current = true
    ownChordSaveRef.current = true
    melodyHashRef.current = hashAbcNotes(primaryNoteLines())
    // Keep lyric-line structured paste charts; ABC reload can flatten bars.
    const fromAbc = loadSectionsFromAbc()
    const structured = nextSections.map(function(pasteSection, index) {
      const abcSection = fromAbc[index]
      if (!abcSection) return pasteSection
      return Object.assign({}, abcSection, {
        chart: pasteSection.chartRevisit
          ? (abcSection.chart || pasteSection.chart)
          : (pasteSection.chart || abcSection.chart),
        chartRevisit: pasteSection.chartRevisit,
        header: pasteSection.header || abcSection.header,
        title: pasteSection.title || abcSection.title,
        type: pasteSection.type || abcSection.type,
        lyricLines: pasteSection.lyricLines && pasteSection.lyricLines.length
          ? pasteSection.lyricLines
          : abcSection.lyricLines,
      })
    })
    setSections(structured.length ? structured : fromAbc)
    committedSectionsRef.current = structured.length ? structured : fromAbc
    setShowOverrideFromLyricsConfirm(false)
    toast.success('Chords and ABC updated from lyrics sheet')
    if (Array.isArray(committed.lyricLines) && typeof props.onLyricsImport === 'function') {
      props.onLyricsImport(committed.lyricLines)
    }
  }

  function requestApplyFromLyrics() {
    const lyricLines = getPlainLyricLines(tune)
    if (!hasLyricEmbeddedChords(lyricLines)) {
      toast.warning('Lyrics do not contain chords to apply')
      return
    }
    if (noteLinesHaveRealMelody(primaryNoteLines())) {
      setShowOverrideFromLyricsConfirm(true)
      return
    }
    applyChordsFromLyricsSheet()
  }

  function buildNotationChordChart() {
    const melodyNoteLines = chordNoteLinesFromTune(tune, primaryNoteLines())
    if (!melodyNoteLines.length) return { chordChart: '', melodyNoteLines: [] }
    let chordChart = ''
    try {
      const melodyAbc = props.tunebook && props.tunebook.abcTools
        ? props.tunebook.abcTools.emptyABC(tune.name) + melodyNoteLines.join('\n')
        : ''
      chordChart = melodyAbc
        ? abcjsParser.renderChords(
          melodyAbc,
          false,
          Number(tune.transpose) || 0,
          tune.key,
          tune.noteLength,
          tune.meter
        )
        : ''
    } catch (e) {
      chordChart = ''
    }
    return { chordChart: chordChart, melodyNoteLines: melodyNoteLines }
  }

  function applyChordsToLyricsSheet() {
    const lyricLines = getPlainLyricLines(tune)
    if (!lyricLines.some(function(line) { return String(line || '').trim() })) {
      toast.warning('No lyrics to apply chords onto')
      setShowApplyToLyricsConfirm(false)
      return
    }
    const built = buildNotationChordChart()
    const applied = applyNotationChordsToLyricChordPro(tune, {
      chordChart: built.chordChart,
      melodyNoteLines: built.melodyNoteLines,
      lyricLines: lyricLines,
    })
    if (!applied.ok) {
      toast.warning(applied.error || 'Could not apply notation chords to lyrics')
      setShowApplyToLyricsConfirm(false)
      return
    }
    setPlainLyricLines(tune, applied.lyricLines)
    tune.meta = Object.assign({}, tune.meta || {})
    tune.meta.chordProSource = applied.lyricLines.join('\n')
    setShowApplyToLyricsConfirm(false)
    if (typeof props.onLyricsImport === 'function') {
      props.onLyricsImport(applied.lyricLines, {
        historyLabel: 'Apply notation chords to lyrics',
      })
    } else {
      props.tunebook.saveTune(tune, false, {
        historyLabel: 'Apply notation chords to lyrics',
        immediate: true,
      })
    }
    toast.success('Notation chords applied to lyrics as ChordPro')
  }

  function requestApplyToLyrics() {
    const lyricLines = getPlainLyricLines(tune)
    if (!lyricLines.some(function(line) { return String(line || '').trim() })) {
      toast.warning('No lyrics to apply chords onto')
      return
    }
    const built = buildNotationChordChart()
    if (!String(built.chordChart || '').trim()
      || !chartBlockHasChords(built.chordChart)) {
      toast.warning('Notation has no chords to apply')
      return
    }
    if (hasLyricEmbeddedChords(lyricLines)) {
      setShowApplyToLyricsConfirm(true)
      return
    }
    applyChordsToLyricsSheet()
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
  const incompleteDrafts = hasIncompleteChordDrafts()
  const hasDraftSaveErrors = Object.keys(draftWarnings).length > 0

  return (
    <div className="chords-wizard">
      {tuneHasLyricEmbeddedChords(tune) ? (
        <Alert variant="info" className="mb-2 py-2">
          Lyric chords in the lyrics field are the singing-view source of truth.
          This editor changes ABC staff/structure chords only.
        </Alert>
      ) : null}
      {melodyConflict ? (
        <Alert variant="warning" className="mb-2 py-2 d-flex flex-wrap align-items-center gap-2">
          <span className="flex-grow-1">
            Notation changed while you have unsaved chord edits. Saving these edits
            would overwrite ABC chords from the new notation. Discard drafts to sync,
            or keep editing (cannot save safely until resolved).
          </span>
          <Button size="sm" variant="outline-secondary" onClick={discardDraftsAndReloadFromNotation}>
            Discard drafts
          </Button>
        </Alert>
      ) : null}
      {!melodyConflict && (incompleteDrafts || hasDraftSaveErrors) ? (
        <Alert variant="warning" className="mb-2 py-2">
          {incompleteDrafts
            ? 'Chord edits cannot be saved until each non-empty line ends with | (or is a complete bar line).'
            : 'Chord edits could not be saved without a destructive change. Fix the chart or discard drafts.'}
        </Alert>
      ) : null}
      <Form.Group controlId="chordwiz">
        <div className="chords-wizard-toolbar">
          <ChordSectionsDropdown
            sections={sections}
            tunebook={props.tunebook}
            defaultMeter={tune.meter || '4/4'}
            onChange={handleSectionsChange}
            onJump={jumpToSection}
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
              setDraftWarnings({})
            }}
          />
          {savingLabel ? (
            <span className="text-muted small align-self-center">{savingLabel}</span>
          ) : null}
          <div className="chords-wizard-toolbar-end">
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={function() { setShowLyricsChordsHelp(true) }}
              title="Help: lyrics formats and section mapping"
            >
              Help
            </Button>
            <Button
              variant="warning"
              size="sm"
              onClick={requestApplyFromLyrics}
              disabled={!tuneHasLyricEmbeddedChords(tune)}
              title="Override chords and ABC notation from the lyrics chord sheet"
              data-testid="chords-apply-from-lyrics"
            >
              From Lyrics
            </Button>
            <Button
              variant="outline-warning"
              size="sm"
              onClick={requestApplyToLyrics}
              title="Write notation chords into lyrics as ChordPro (lossy timing)"
              data-testid="chords-apply-to-lyrics"
            >
              To Lyrics
            </Button>
            <ChordsSearchButton
              tuneId={tune && tune.id}
              title={tune.name}
              artist={tune.composer || ''}
              rhythm={tune.rhythm || ''}
              currentGenres={allGenres(tune)}
              onGenreAccept={props.onGenreAccept}
              token={props.token}
              tunebook={props.tunebook}
              autoStartSearch={false}
              externalOnly={true}
              confirmOverwrite={true}
              existingLyrics={getLyricLines(tune).join('\n')}
              onChords={function(result) {
                const committed = commitChordSearchResultToTune({
                  result: result,
                  tune: tune,
                  abc: currentAbcString(),
                  tunebook: props.tunebook,
                  abcjsParser: abcjsParser,
                  updateLyrics: true,
                  historyLabel: 'Search chords and lyrics',
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
                ownChordSaveRef.current = true
                melodyHashRef.current = hashAbcNotes(primaryNoteLines())
                const next = loadSectionsFromAbc()
                setSections(next)
                committedSectionsRef.current = next
                setSectionDrafts({})
                setWholeDraft(null)
                if (committed.updateLyrics && Array.isArray(committed.lyricLines)
                  && typeof props.onLyricsImport === 'function') {
                  props.onLyricsImport(committed.lyricLines)
                }
                toast.success('Chords and lyrics updated from search')
              }}
              onLyrics={function() { /* lyrics applied via merge */ }}
            />
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
          {renderDraftWarning(WHOLE_DRAFT_WARNING_KEY)}
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
                      <KeySignatureInput
                        value={section.abcKey || tune.key || 'C'}
                        aria-label={'Key for ' + (section.title || 'section')}
                        onChange={function(next) { handleKeyChange(section, next) }}
                      />
                    </div>
                  ) : null}
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
                  <div
                    className="text-muted small"
                    style={{ flex: '1 1 12rem', minWidth: '10rem', maxWidth: '22rem', padding: '0.35rem 0' }}
                    title="Section name comes from lyric markers — edit it in the Lyrics tab"
                  >
                    {section.title || section.header || 'Untitled'}
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
                  <>
                    <div className="text-muted small mb-2">
                      {reuseTitle ? ('Same chords as ' + reuseTitle) : 'Uses chords from an earlier section'}
                    </div>
                    <Form.Control
                      as="textarea"
                      className="chords-wizard-textarea chords-wizard-textarea--readonly"
                      readOnly
                      value={sectionChartValue(section)}
                      ref={fitChordTextarea}
                    />
                  </>
                ) : (
                  <>
                    {renderDraftWarning(section.key)}
                    <Form.Control
                      as="textarea"
                      className="chords-wizard-textarea"
                      placeholder={"eg \nC|F# C|Cmin . . G |Cb"}
                      value={sectionChartValue(section)}
                      onChange={function(e) {
                        fitChordTextarea(e.target)
                        handleSectionDraftChange(section, e.target.value)
                      }}
                      onBlur={function() {
                        if (typeof flushPendingSavesRef.current === 'function') {
                          flushPendingSavesRef.current()
                        }
                      }}
                      ref={fitChordTextarea}
                    />
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

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

      <LyricsChordsHelpModal
        show={showLyricsChordsHelp}
        onHide={function() { setShowLyricsChordsHelp(false) }}
      />

      <Modal
        show={showOverrideFromLyricsConfirm}
        onHide={function() { setShowOverrideFromLyricsConfirm(false) }}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Apply chords from lyrics?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Alert variant="warning" className="mb-0">
            This will rebuild chord sections and <strong>replace ABC notation</strong> from the
            lyrics chord sheet. Existing pitched notes are not preserved.
          </Alert>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={function() { setShowOverrideFromLyricsConfirm(false) }}>
            Cancel
          </Button>
          <Button
            variant="warning"
            data-testid="chords-apply-from-lyrics-confirm"
            onClick={applyChordsFromLyricsSheet}
          >
            Override chords and ABC
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={showApplyToLyricsConfirm}
        onHide={function() { setShowApplyToLyricsConfirm(false) }}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Apply notation chords to lyrics?</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Alert variant="warning" className="mb-0">
            This writes notation chords into the lyrics as ChordPro (<code>[Am]word</code>).
            Timing is <strong>lossy</strong>, and any existing lyric-embedded chords will be
            <strong> replaced</strong>. ABC notation is not changed.
          </Alert>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={function() { setShowApplyToLyricsConfirm(false) }}>
            Cancel
          </Button>
          <Button
            variant="warning"
            data-testid="chords-apply-to-lyrics-confirm"
            onClick={applyChordsToLyricsSheet}
          >
            Replace lyrics chords
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={showMarkerConfirm}
        onHide={cancelMarkerWrite}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Write section labels</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Section labels will be written into notation as chord symbols. You can undo this change from the history menu.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={cancelMarkerWrite}>
            Cancel
          </Button>
          <Button variant="success" onClick={confirmMarkerWrite}>
            Write labels
          </Button>
        </Modal.Footer>
      </Modal>

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
            <VoiceFillInput
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
              fieldKind="search"
              token={props.token}
              setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
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
