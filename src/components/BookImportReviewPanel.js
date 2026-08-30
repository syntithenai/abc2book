/**
 * Review panel for an Import Book review set: 3-col crop | staff | ABC tools.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Badge, Button, ButtonGroup, Form, ListGroup, ProgressBar, Spinner } from 'react-bootstrap'
import { toast } from 'react-toastify'
import Abc from './Abc'
import BookImportStaffWithChords from './BookImportStaffWithChords'
import NotationIssuesPanel from './NotationIssuesPanel'
import './BookImportReviewPanel.css'
import {
  getReviewBlob,
  getReviewSet,
  updateReviewSet,
  updateTuneInReviewSet,
  putReviewBlob,
  deleteReviewBlob,
} from '../bookImportReviewStore'
import { fetchReviewProjectsBlob } from '../reviewProjectsClient'
import {
  deleteTuneFromList,
  planMergeWithNext,
  planMergeWithPrevious,
  planMergeTunes,
  planSplitTune,
  mergeCropBlobs,
  splitCropBlob,
  addCropZone,
  removeCropZone,
  getTuneCropZones,
  buildZonesOnlyBlob,
  rehydrateCropBlobFromPdf,
} from '../bookImportCropOps'
import { applyCropPrep } from '../bookImportCropPrep'
import { reprocessReviewTune } from '../bookImportPipeline'
import {
  convertMidiForTune,
  omrPdfForTune,
  convertSourceForTune,
  tuneHasMidiSource,
  tuneHasPdfSource,
} from '../oldtimeEnrichActions'
import {
  sortCandidatesForDisplay,
  pickPreferChordedCandidate,
  chordCount,
  isOmrSource,
} from '../bookImportAbcLookup'
import {
  filterReviewTunes,
  reviewProgressTallies,
} from '../bookImportReviewFilters'
import { normalizeSheetFormat, sheetFormatIsTextOnly, sheetFormatLabel } from '../sheetImageFormats'
import {
  transposeAbcText,
  scaleAbcNoteLengths,
  setAbcMeter,
  readAbcMeter,
} from '../bookImportAbcTransforms'
import { runNotationChecks } from '../useNotationCheck'
import { buildNotationCheckTune } from '../notationCheckSnapshot'
import {
  importBookReviewPackage,
  BOOK_IMPORT_CROP_SOURCE,
} from '../eurosessionTunebookImport'
import { scoreFileToImportCandidate } from '../bookImportReviewScoreUpload'
import {
  downloadReviewSetImportJson,
  mergeImportPackageIntoReviewSet,
  readReviewSetImportFile,
} from '../bookImportReviewExport'

const METER_OPTIONS = ['2/4', '3/4', '4/4', '6/8', '9/8', '12/8', '3/8', '2/2', 'C', 'C|']
const MIN_ZONE = 0.015

function sortTunes(tunes) {
  return (Array.isArray(tunes) ? tunes.slice() : []).sort(function(a, b) {
    const page = (Number(a.page) || 0) - (Number(b.page) || 0)
    if (page !== 0) return page
    return (Number(a.tuneIndex) || 0) - (Number(b.tuneIndex) || 0)
  })
}

function selectedCandidate(tune) {
  if (!tune) return null
  const list = Array.isArray(tune.candidates) ? tune.candidates : []
  if (tune.selectedCandidateId) {
    const hit = list.find(function(c) { return c && c.id === tune.selectedCandidateId })
    if (hit) return hit
  }
  if (tune.abc) {
    return { id: 'current', source: tune.abcSource || 'selected', abc: tune.abc }
  }
  return list[0] || null
}

export default function BookImportReviewPanel(props) {
  const setId = props.setId
  const tunebook = props.tunebook
  const tunesMap = props.tunes || {}
  const abcTools = tunebook && tunebook.abcTools
  const accessToken = props.accessToken
    || (props.token && props.token.access_token)
    || props.token
    || ''
  const [reviewSet, setReviewSet] = useState(null)
  const [activeId, setActiveId] = useState('')
  const [cropUrl, setCropUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [importProgress, setImportProgress] = useState(null)
  const [splitMode, setSplitMode] = useState(false)
  const [dragStart, setDragStart] = useState(null)
  const [dragCurrent, setDragCurrent] = useState(null)
  const [nameQuery, setNameQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState(function() {
    return String(props.initialStatusFilter || '').trim() || 'all'
  })
  const [selectedTuneIds, setSelectedTuneIds] = useState([])
  const [splitGuideY, setSplitGuideY] = useState(null)
  const [prepContrast, setPrepContrast] = useState(1)
  const [prepBrightness, setPrepBrightness] = useState(0)
  const [preferChords, setPreferChords] = useState(true)
  const [abcDraft, setAbcDraft] = useState('')
  const [undoStack, setUndoStack] = useState([])
  const [playOn, setPlayOn] = useState(false)
  const [chordEditOn, setChordEditOn] = useState(true)
  const cropImgRef = useRef(null)
  const cropColRef = useRef(null)
  const staffColRef = useRef(null)
  const abcPersistTimer = useRef(null)
  const scoreFileRef = useRef(null)
  const importJsonRef = useRef(null)
  const [scoreUploadHint, setScoreUploadHint] = useState('')
  const [scoreUploadAllParts, setScoreUploadAllParts] = useState(false)
  const [scoreUploadBusy, setScoreUploadBusy] = useState(false)

  useEffect(function() {
    const hint = String(props.initialStatusFilter || '').trim()
    if (hint) setStatusFilter(hint)
  }, [props.initialStatusFilter, setId])

  const loadSet = useCallback(async function() {
    const set = await getReviewSet(setId)
    setReviewSet(set)
    if (set && Array.isArray(set.tunes) && set.tunes.length && !activeId) {
      const sorted = sortTunes(set.tunes)
      setActiveId(sorted[0].id)
    }
    return set
  }, [setId, activeId])

  useEffect(function() {
    let cancelled = false
    loadSet().then(function() {
      if (cancelled) return
    })
    return function() { cancelled = true }
  }, [setId]) // eslint-disable-line react-hooks/exhaustive-deps

  const tunes = useMemo(function() {
    return sortTunes(reviewSet && reviewSet.tunes)
  }, [reviewSet])

  const tallies = useMemo(function() {
    return reviewProgressTallies(tunes)
  }, [tunes])

  const visibleTunes = useMemo(function() {
    return filterReviewTunes(tunes, { nameQuery: nameQuery, statusFilter: statusFilter })
  }, [tunes, nameQuery, statusFilter])

  const activeTune = useMemo(function() {
    const fromVisible = visibleTunes.find(function(t) { return t && t.id === activeId })
    if (fromVisible) return fromVisible
    return visibleTunes[0] || null
  }, [visibleTunes, activeId])

  useEffect(function() {
    if (!activeTune) {
      if (visibleTunes.length) setActiveId(visibleTunes[0].id)
      return
    }
    if (activeId !== activeTune.id) setActiveId(activeTune.id)
  }, [activeTune, visibleTunes, activeId])

  useEffect(function() {
    let revoked = ''
    let cancelled = false
    async function loadCrop() {
      if (!activeTune) {
        setCropUrl('')
        return
      }
      let blob = null
      if (activeTune.cropBlobKey) {
        blob = await getReviewBlob(activeTune.cropBlobKey)
      }
      // Lazy-fetch from resolver Documents review root (Milliner–Koken etc.).
      if (!blob && activeTune.cropRemotePath && accessToken != null) {
        try {
          blob = await fetchReviewProjectsBlob(activeTune.cropRemotePath, accessToken)
          if (blob) {
            const key = activeTune.cropBlobKey
              || ('crop-remote-' + activeTune.id + '-' + Date.now())
            await putReviewBlob(key, blob)
            if (!activeTune.cropBlobKey) {
              await patchActive({ cropBlobKey: key })
            }
          }
        } catch (e) {
          blob = null
        }
      }
      // Rehydrate from source PDF + bbox when crop blob is missing (hard-reload recovery).
      if (!blob && activeTune.sourcePdfBlobKey) {
        try {
          const pdfBlob = await getReviewBlob(activeTune.sourcePdfBlobKey)
          if (pdfBlob) {
            blob = await rehydrateCropBlobFromPdf(activeTune, pdfBlob)
            if (blob) {
              const key = activeTune.cropBlobKey
                || ('crop-rehydrated-' + activeTune.id + '-' + Date.now())
              await putReviewBlob(key, blob)
              if (!activeTune.cropBlobKey) {
                await patchActive({ cropBlobKey: key })
              }
            }
          }
        } catch (e) {
          blob = null
        }
      }
      if (cancelled || !blob) {
        setCropUrl('')
        return
      }
      const url = URL.createObjectURL(blob)
      revoked = url
      setCropUrl(url)
    }
    loadCrop()
    return function() {
      cancelled = true
      if (revoked) URL.revokeObjectURL(revoked)
    }
  }, [activeTune && activeTune.id, activeTune && activeTune.cropBlobKey, activeTune && activeTune.cropRemotePath, activeTune && activeTune.sourcePdfBlobKey, accessToken]) // eslint-disable-line react-hooks/exhaustive-deps

  const candidate = selectedCandidate(activeTune)
  const cropZones = getTuneCropZones(activeTune)
  const activeFormat = normalizeSheetFormat(
    (activeTune && (activeTune.sheetFormat || activeTune.pageType)) || ''
  )
  const textOnlyFormat = sheetFormatIsTextOnly(activeFormat)

  useEffect(function() {
    setAbcDraft(candidate ? String(candidate.abc || '') : '')
    setUndoStack([])
    setPlayOn(false)
  }, [activeTune && activeTune.id, candidate && candidate.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const abcText = abcDraft

  const checkTune = useMemo(function() {
    if (!abcText || !abcTools) return null
    try {
      const parsed = abcTools.abc2json(abcText)
      if (!parsed) return null
      parsed.id = (activeTune && activeTune.id) || 'book-import-preview'
      parsed.name = (activeTune && activeTune.title) || 'Untitled'
      return buildNotationCheckTune(parsed)
    } catch (e) {
      return null
    }
  }, [abcText, abcTools, activeTune])

  const checkResults = useMemo(function() {
    if (!checkTune) {
      return { issues: [], completenessIssues: [], metadataIssues: [] }
    }
    return runNotationChecks(checkTune, {
      abcTools: abcTools,
      abcText: abcText,
      skipRenderAbc: true,
    })
  }, [checkTune, abcTools, abcText])

  const issues = useMemo(function() {
    if (activeTune && Array.isArray(activeTune.notationIssues) && activeTune.notationIssues.length) {
      return activeTune.notationIssues
    }
    return checkResults.issues || []
  }, [activeTune, checkResults])

  const displayCandidates = useMemo(function() {
    return sortCandidatesForDisplay(activeTune && activeTune.candidates)
  }, [activeTune])

  useEffect(function() {
    function syncHeights() {
      if (!cropColRef.current || !staffColRef.current) return
      const h = Math.max(cropColRef.current.offsetHeight, 120)
      staffColRef.current.style.minHeight = Math.min(h, window.innerHeight * 0.7) + 'px'
    }
    syncHeights()
    window.addEventListener('resize', syncHeights)
    return function() { window.removeEventListener('resize', syncHeights) }
  }, [cropUrl, abcText, activeTune && activeTune.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function patchActive(patch) {
    if (!activeTune) return
    const updated = await updateTuneInReviewSet(setId, activeTune.id, patch)
    setReviewSet(updated)
  }

  async function persistAbc(nextAbc, extraPatch) {
    if (!activeTune) return
    const abc = String(nextAbc || '')
    const candidates = Array.isArray(activeTune.candidates) ? activeTune.candidates.slice() : []
    const selId = activeTune.selectedCandidateId
    let nextCandidates = candidates
    if (selId) {
      nextCandidates = candidates.map(function(c) {
        if (c && c.id === selId) return Object.assign({}, c, { abc: abc })
        return c
      })
    } else if (candidates.length) {
      nextCandidates = candidates.map(function(c, i) {
        if (i === 0) return Object.assign({}, c, { abc: abc })
        return c
      })
    }
    const report = abcTools
      ? runNotationChecks(
        buildNotationCheckTune(Object.assign(
          {},
          abcTools.abc2json(abc) || {},
          { id: activeTune.id, name: activeTune.title }
        )),
        { abcTools: abcTools, abcText: abc, skipRenderAbc: true }
      )
      : { issues: [] }
    await patchActive(Object.assign({
      abc: abc,
      candidates: nextCandidates,
      notationIssues: report.issues || [],
    }, extraPatch || {}))
  }

  function schedulePersistAbc(nextAbc) {
    if (abcPersistTimer.current) clearTimeout(abcPersistTimer.current)
    abcPersistTimer.current = setTimeout(function() {
      persistAbc(nextAbc).catch(function(e) {
        toast.error(e && e.message ? e.message : String(e))
      })
    }, 400)
  }

  function pushUndo(prev) {
    setUndoStack(function(stack) {
      const next = stack.concat([String(prev || '')])
      return next.length > 40 ? next.slice(next.length - 40) : next
    })
  }

  function applyAbcTransform(transformFn) {
    const prev = abcDraft
    const next = transformFn(prev)
    if (next == null || next === prev) {
      toast.info('Could not transform ABC')
      return
    }
    pushUndo(prev)
    setAbcDraft(next)
    persistAbc(next).catch(function(e) {
      toast.error(e && e.message ? e.message : String(e))
    })
  }

  function handleUndoAbc() {
    if (!undoStack.length) return
    const prev = undoStack[undoStack.length - 1]
    setUndoStack(undoStack.slice(0, -1))
    setAbcDraft(prev)
    persistAbc(prev).catch(function(e) {
      toast.error(e && e.message ? e.message : String(e))
    })
  }

  async function handleAddScoreFile(file) {
    if (!file || !activeTune) return
    setScoreUploadBusy(true)
    setScoreUploadHint('Converting…')
    try {
      const result = await scoreFileToImportCandidate(file, { allParts: scoreUploadAllParts })
      const candidates = Array.isArray(activeTune.candidates) ? activeTune.candidates.slice() : []
      const filtered = candidates.filter(function(c) {
        return c && String(c.source || '') !== result.candidate.source
      })
      filtered.push(result.candidate)
      await patchActive({
        candidates: filtered,
        selectedCandidateId: result.candidate.id,
        abc: result.candidate.abc,
        abcSource: result.candidate.source,
        status: 'ready',
      })
      setAbcDraft(result.candidate.abc)
      setScoreUploadHint(result.hint)
    } catch (e) {
      setScoreUploadHint('')
      toast.error(e && e.message ? e.message : String(e))
    } finally {
      setScoreUploadBusy(false)
    }
  }

  async function handleSelectCandidate(candidateId) {
    const list = activeTune && Array.isArray(activeTune.candidates) ? activeTune.candidates : []
    const hit = list.find(function(c) { return c && c.id === candidateId })
    if (!hit) return
    const nextIssues = abcTools
      ? (runNotationChecks(
        buildNotationCheckTune(Object.assign(
          {},
          abcTools.abc2json(hit.abc) || {},
          { id: activeTune.id, name: activeTune.title }
        )),
        { abcTools: abcTools, abcText: hit.abc, skipRenderAbc: true }
      ).issues || [])
      : []
    setAbcDraft(String(hit.abc || ''))
    setUndoStack([])
    await patchActive({
      selectedCandidateId: hit.id,
      abc: hit.abc,
      abcSource: hit.source,
      notationIssues: nextIssues,
    })
  }

  async function handlePreferChordsToggle(checked) {
    setPreferChords(checked)
    if (!checked || !activeTune) return
    const preferred = pickPreferChordedCandidate(activeTune.candidates)
    if (preferred && preferred.id !== activeTune.selectedCandidateId) {
      await handleSelectCandidate(preferred.id)
    }
  }

  async function resolveCropBlob(tune) {
    if (!tune) return null
    if (tune.cropBlobKey) {
      const blob = await getReviewBlob(tune.cropBlobKey)
      if (blob) return blob
    }
    if (tune.cropRemotePath) {
      const blob = await fetchReviewProjectsBlob(tune.cropRemotePath, accessToken)
      if (blob) {
        const key = tune.cropBlobKey || ('crop-remote-' + tune.id + '-' + Date.now())
        await putReviewBlob(key, blob)
        if (!tune.cropBlobKey) {
          await updateTuneInReviewSet(setId, tune.id, { cropBlobKey: key })
        }
        return blob
      }
    }
    return null
  }

  async function handleTitleBlur(event) {
    const title = String(event.target.value || '').trim()
    if (!activeTune || title === activeTune.title) return
    await patchActive({ title: title || activeTune.title })
  }

  async function handleToggleComplete() {
    if (!activeTune) return
    const errorCount = (issues || []).filter(function(i) { return i && i.severity === 'error' }).length
    if (!activeTune.complete && errorCount > 0) {
      toast.warn('Marking complete with ' + errorCount + ' notation error' + (errorCount === 1 ? '' : 's'))
    }
    await patchActive({ complete: !activeTune.complete })
  }

  async function handleDeleteTune() {
    if (!activeTune || !window.confirm('Delete this tune from the review set?')) return
    const result = deleteTuneFromList(tunes, activeTune.id)
    if (result.removedCropBlobKey) await deleteReviewBlob(result.removedCropBlobKey)
    const updated = await updateReviewSet(setId, { tunes: result.tunes })
    setReviewSet(updated)
    const next = sortTunes(result.tunes)[0]
    setActiveId(next ? next.id : '')
  }

  async function handleMergeNext() {
    if (!activeTune) return
    const plan = planMergeWithNext(tunes, activeTune.id)
    if (!plan) {
      toast.info('No next tune on this page to join')
      return
    }
    await applyMergePlan(plan, activeTune, plan.removed)
  }

  async function handleMergePrevious() {
    if (!activeTune) return
    const plan = planMergeWithPrevious(tunes, activeTune.id)
    if (!plan) {
      toast.info('No previous tune on this page to join')
      return
    }
    const top = tunes.find(function(t) { return t && t.id === plan.mergeTarget.id })
    await applyMergePlan(plan, top || plan.mergeTarget, plan.removed)
  }

  async function applyMergePlan(plan, topTune, bottomTune) {
    setBusy(true)
    try {
      const blobA = await resolveCropBlob(topTune)
      const blobB = await resolveCropBlob(bottomTune)
      if (!blobA || !blobB) throw new Error('Could not load crop images to join')
      const mergedBlob = await mergeCropBlobs(blobA, blobB)
      const newKey = 'crop-merge-' + setId + '-' + Date.now()
      await putReviewBlob(newKey, mergedBlob)
      if (bottomTune.cropBlobKey) await deleteReviewBlob(bottomTune.cropBlobKey)
      plan.mergeTarget.cropBlobKey = newKey
      plan.mergeTarget.cropRemotePath = ''
      await updateReviewSet(setId, { tunes: plan.tunes.map(function(t) {
        return t.id === plan.mergeTarget.id ? plan.mergeTarget : t
      }) })
      await reprocessReviewTune(setId, plan.mergeTarget.id, {
        accessToken: accessToken,
        resolverAvailable: props.resolverAvailable,
        abcTools: abcTools,
      })
      await loadSet()
      setActiveId(plan.mergeTarget.id)
      setSelectedTuneIds([])
      toast.success('Joined crops and re-ran OMR')
    } catch (e) {
      toast.error(e && e.message ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleJoinSelection() {
    if (selectedTuneIds.length < 2) {
      toast.info('Select two or more consecutive same-page tunes to join')
      return
    }
    const plan = planMergeTunes(tunes, selectedTuneIds)
    if (!plan) {
      toast.warn('Selection must be consecutive tunes on the same page')
      return
    }
    setBusy(true)
    try {
      const ordered = selectedTuneIds
        .map(function(id) { return tunes.find(function(t) { return t && String(t.id) === String(id) }) })
        .filter(Boolean)
        .sort(function(a, b) { return (Number(a.tuneIndex) || 0) - (Number(b.tuneIndex) || 0) })
      let mergedBlob = await resolveCropBlob(ordered[0])
      if (!mergedBlob) throw new Error('Could not load first crop')
      for (let i = 1; i < ordered.length; i += 1) {
        const nextBlob = await resolveCropBlob(ordered[i])
        if (!nextBlob) throw new Error('Could not load crop for ' + (ordered[i].title || ordered[i].id))
        mergedBlob = await mergeCropBlobs(mergedBlob, nextBlob)
        if (ordered[i].cropBlobKey) await deleteReviewBlob(ordered[i].cropBlobKey)
      }
      const newKey = 'crop-merge-multi-' + setId + '-' + Date.now()
      await putReviewBlob(newKey, mergedBlob)
      plan.mergeTarget.cropBlobKey = newKey
      plan.mergeTarget.cropRemotePath = ''
      await updateReviewSet(setId, {
        tunes: plan.tunes.map(function(t) {
          return t.id === plan.mergeTarget.id ? plan.mergeTarget : t
        }),
      })
      await reprocessReviewTune(setId, plan.mergeTarget.id, {
        accessToken: accessToken,
        resolverAvailable: props.resolverAvailable,
        abcTools: abcTools,
      })
      await loadSet()
      setActiveId(plan.mergeTarget.id)
      setSelectedTuneIds([])
      toast.success('Joined ' + ordered.length + ' crops and re-ran OMR')
    } catch (e) {
      toast.error(e && e.message ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleSplitAt(clientY) {
    if (!activeTune || !cropImgRef.current) return
    const rect = cropImgRef.current.getBoundingClientRect()
    const ratio = (clientY - rect.top) / Math.max(1, rect.height)
    setBusy(true)
    setSplitMode(false)
    setSplitGuideY(null)
    try {
      const blob = await resolveCropBlob(activeTune)
      if (!blob) throw new Error('No crop image to split')
      const split = await splitCropBlob(blob, ratio, { normalized: true })
      const plan = planSplitTune(tunes, activeTune.id, {})
      if (!plan) return
      const topKey = 'crop-split-a-' + setId + '-' + Date.now()
      const bottomKey = 'crop-split-b-' + setId + '-' + Date.now()
      await putReviewBlob(topKey, split.topBlob)
      await putReviewBlob(bottomKey, split.bottomBlob)
      if (activeTune.cropBlobKey) await deleteReviewBlob(activeTune.cropBlobKey)
      plan.topTune.cropBlobKey = topKey
      plan.topTune.cropRemotePath = ''
      plan.bottomTune.cropBlobKey = bottomKey
      plan.bottomTune.cropRemotePath = ''
      const nextTunes = plan.tunes.map(function(t) {
        if (t.id === plan.topTune.id) return plan.topTune
        if (t.id === plan.bottomTune.id) return plan.bottomTune
        return t
      })
      await updateReviewSet(setId, { tunes: nextTunes })
      await reprocessReviewTune(setId, plan.topTune.id, {
        accessToken: accessToken,
        resolverAvailable: props.resolverAvailable,
        abcTools: abcTools,
      })
      await reprocessReviewTune(setId, plan.bottomTune.id, {
        accessToken: accessToken,
        resolverAvailable: props.resolverAvailable,
        abcTools: abcTools,
      })
      await loadSet()
      toast.success('Split at ' + Math.round(ratio * 100) + '% and re-ran OMR')
    } catch (e) {
      toast.error(e && e.message ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleReOmr() {
    if (!activeTune) return
    setBusy(true)
    try {
      await resolveCropBlob(activeTune)
      await reprocessReviewTune(setId, activeTune.id, {
        accessToken: accessToken,
        resolverAvailable: props.resolverAvailable,
        abcTools: abcTools,
      })
      await loadSet()
      toast.success('Re-ran OMR on crop')
    } catch (e) {
      toast.error(e && e.message ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleApplyCropPrep(extraOps) {
    if (!activeTune) return
    setBusy(true)
    try {
      const blob = await resolveCropBlob(activeTune)
      if (!blob) throw new Error('No crop image to prep')
      const next = await applyCropPrep(blob, Object.assign({
        contrast: prepContrast,
        brightness: prepBrightness,
      }, extraOps || {}))
      const key = 'crop-prep-' + activeTune.id + '-' + Date.now()
      await putReviewBlob(key, next)
      if (activeTune.cropBlobKey && activeTune.cropBlobKey !== key) {
        await deleteReviewBlob(activeTune.cropBlobKey)
      }
      await patchActive({ cropBlobKey: key, cropRemotePath: '' })
      await loadSet()
      toast.success('Crop updated — use Re-OMR when ready')
    } catch (e) {
      toast.error(e && e.message ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function runSourceConvert(label, fn) {
    if (!activeTune) return
    setBusy(true)
    try {
      const patch = await fn(activeTune)
      await patchActive(Object.assign({}, patch, {
        status: patch.status || 'has_candidates',
        complete: false,
      }))
      toast.success(label + ' added as candidate')
    } catch (e) {
      toast.error(e && e.message ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleRegenerateFromZones() {
    if (!activeTune || !cropZones.length) return
    setBusy(true)
    try {
      const cropBlob = await resolveCropBlob(activeTune)
      if (!cropBlob) throw new Error('No crop image')
      const zonesBlob = await buildZonesOnlyBlob(cropBlob, cropZones)
      await reprocessReviewTune(setId, activeTune.id, {
        accessToken: accessToken,
        resolverAvailable: props.resolverAvailable,
        abcTools: abcTools,
        omrBlob: zonesBlob,
      })
      await loadSet()
      toast.success('Regenerated OMR from crop zones')
    } catch (e) {
      toast.error(e && e.message ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function pctFromEvent(event) {
    if (!cropImgRef.current) return null
    const rect = cropImgRef.current.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height))),
    }
  }

  function handleCropMouseDown(event) {
    if (splitMode || !cropImgRef.current || event.button !== 0) return
    const p = pctFromEvent(event)
    if (!p) return
    event.preventDefault()
    setDragStart(p)
    setDragCurrent(p)
  }

  function handleCropMouseMove(event) {
    if (!dragStart) return
    const p = pctFromEvent(event)
    if (!p) return
    setDragCurrent(p)
  }

  async function handleCropMouseUp(event) {
    if (splitMode) {
      await handleSplitAt(event.clientY)
      setDragStart(null)
      setDragCurrent(null)
      return
    }
    if (!dragStart || !activeTune) {
      setDragStart(null)
      setDragCurrent(null)
      return
    }
    const p = pctFromEvent(event) || dragCurrent || dragStart
    const x = Math.min(dragStart.x, p.x)
    const y = Math.min(dragStart.y, p.y)
    const width = Math.abs(p.x - dragStart.x)
    const height = Math.abs(p.y - dragStart.y)
    setDragStart(null)
    setDragCurrent(null)
    if (width < MIN_ZONE || height < MIN_ZONE) return
    const next = addCropZone(activeTune, {
      x: x * 100,
      y: y * 100,
      width: width * 100,
      height: height * 100,
    })
    await patchActive({ cropZones: next.cropZones, badSections: [] })
  }

  function handleExportJson() {
    if (!reviewSet) return
    const incomplete = tunes.filter(function(t) { return !t.complete && t.status !== 'ready' })
    if (incomplete.length && !window.confirm(
      incomplete.length + ' tune(s) not marked complete. Export anyway?'
    )) {
      return
    }
    try {
      downloadReviewSetImportJson(reviewSet)
      toast.success('Exported import JSON')
    } catch (e) {
      toast.error(e && e.message ? e.message : String(e))
    }
  }

  async function handleImportJsonFile(file) {
    if (!file || !reviewSet) return
    try {
      const pkg = await readReviewSetImportFile(file)
      const merged = mergeImportPackageIntoReviewSet(reviewSet, pkg)
      await updateReviewSet(setId, { tunes: merged.tunes })
      setReviewSet(merged)
      toast.success('Merged import JSON into review set')
    } catch (e) {
      toast.error(e && e.message ? e.message : String(e))
    }
  }

  async function handleImport() {
    if (!reviewSet || !tunebook) return
    if (!reviewSet.book) {
      toast.error('Review set is missing a book')
      return
    }
    const incomplete = tunes.filter(function(t) { return !t.complete && t.status !== 'ready' })
    if (incomplete.length && !window.confirm(
      incomplete.length + ' tune(s) not marked complete. Import anyway?'
    )) {
      return
    }
    setImportBusy(true)
    setImportProgress({ done: 0, total: tunes.length })
    try {
      const summary = await importBookReviewPackage({
        book: reviewSet.book,
        cropSource: BOOK_IMPORT_CROP_SOURCE,
        historyLabel: 'Book import',
        tunes: tunes.map(function(t) {
          return {
            id: t.id,
            title: t.title,
            page: t.page,
            tuneIndex: t.tuneIndex,
            crop: t.cropName || (t.id + '.jpg'),
            cropBlobKey: t.cropBlobKey,
            complete: !!t.complete,
            abc: t.abc || '',
          }
        }),
        resolveCrop: async function(entry) {
          return getReviewBlob(entry.cropBlobKey)
        },
        tunebook: tunebook,
        tunesMap: tunesMap,
        onProgress: function(done, total, title) {
          setImportProgress({ done: done, total: total, title: title })
        },
      })
      await updateReviewSet(setId, { status: 'imported' })
      if (typeof props.setCurrentTuneBook === 'function') {
        props.setCurrentTuneBook(reviewSet.book)
      }
      if (typeof props.forceRefresh === 'function') props.forceRefresh()
      toast.success(
        'Imported ' + summary.inserted + ' new, updated ' + summary.updated
        + (summary.skipped ? ', skipped ' + summary.skipped : '')
      )
      if (typeof props.onImported === 'function') props.onImported(summary)
    } catch (e) {
      toast.error(e && e.message ? e.message : String(e))
    } finally {
      setImportBusy(false)
      setImportProgress(null)
    }
  }

  async function handleTuneSavedFromIssues(nextTune) {
    if (!nextTune || !abcTools || !activeTune) return
    try {
      const abc = abcTools.json2abc(nextTune)
      pushUndo(abcDraft)
      setAbcDraft(abc)
      await persistAbc(abc)
    } catch (e) {
      toast.error(e && e.message ? e.message : String(e))
    }
  }

  const draftZone = dragStart && dragCurrent ? {
    left: Math.min(dragStart.x, dragCurrent.x) * 100,
    top: Math.min(dragStart.y, dragCurrent.y) * 100,
    width: Math.abs(dragCurrent.x - dragStart.x) * 100,
    height: Math.abs(dragCurrent.y - dragStart.y) * 100,
  } : null

  const currentMeter = readAbcMeter(abcText) || '4/4'

  if (!reviewSet) {
    return (
      <div className="p-3 text-center">
        <Spinner animation="border" size="sm" /> Loading review set…
      </div>
    )
  }

  const filterChips = [
    { id: 'all', label: 'All', tally: tallies.total },
    { id: 'complete', label: 'Complete', tally: tallies.complete },
    { id: 'incomplete', label: 'Incomplete', tally: tallies.incomplete },
    { id: 'omr', label: 'OMR', tally: tallies.omr },
    { id: 'abc', label: 'ABC', tally: tallies.abc },
  ]

  return (
    <div className="book-import-review-panel" data-testid="book-import-review-panel">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
        <div>
          <strong>{reviewSet.name}</strong>
          <Badge bg="secondary" className="ms-2">{reviewSet.book}</Badge>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline-secondary"
            disabled={!tunes.length || busy || importBusy}
            onClick={handleExportJson}
          >
            Export JSON
          </Button>
          <Button
            size="sm"
            variant="outline-secondary"
            disabled={busy || importBusy}
            onClick={function() {
              if (importJsonRef.current) importJsonRef.current.click()
            }}
          >
            Import JSON
          </Button>
          <input
            ref={importJsonRef}
            type="file"
            accept=".json,application/json"
            className="d-none"
            onChange={function(e) {
              const file = e.target.files && e.target.files[0]
              e.target.value = ''
              if (file) handleImportJsonFile(file)
            }}
          />
          {typeof props.onBack === 'function' ? (
            <Button size="sm" variant="outline-secondary" onClick={props.onBack} disabled={busy || importBusy}>
              Back
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="success"
            disabled={!tunes.length || busy || importBusy}
            onClick={handleImport}
            data-testid="book-import-commit"
          >
            {importBusy ? 'Importing…' : 'Import into ' + reviewSet.book}
          </Button>
        </div>
      </div>

      <div className="bir-filter-bar">
        <Form.Control
          className="bir-name-filter"
          size="sm"
          type="search"
          placeholder="Filter tunes by name…"
          value={nameQuery}
          onChange={function(e) { setNameQuery(e.target.value) }}
          data-testid="book-import-name-filter"
        />
        <div className="bir-filter-chips">
          {filterChips.map(function(chip) {
            return (
              <Button
                key={chip.id}
                size="sm"
                variant={statusFilter === chip.id ? 'primary' : 'outline-secondary'}
                className={statusFilter === chip.id ? 'active' : ''}
                onClick={function() { setStatusFilter(chip.id) }}
              >
                {chip.label} <span className="opacity-75">{chip.tally}</span>
              </Button>
            )
          })}
        </div>
        <div className="bir-progress" data-testid="book-import-progress">
          {tallies.complete} / {tallies.total} complete ({tallies.percent}%)
          {visibleTunes.length !== tunes.length ? (
            <span className="ms-2">· showing {visibleTunes.length}</span>
          ) : null}
        </div>
        <Form.Check
          type="switch"
          id="bir-prefer-chords"
          label="Prefer chorded"
          checked={preferChords}
          onChange={function(e) { handlePreferChordsToggle(e.target.checked) }}
        />
      </div>

      {importProgress ? (
        <ProgressBar
          className="mb-2"
          now={importProgress.total ? Math.round(100 * importProgress.done / importProgress.total) : 0}
          label={(importProgress.done || 0) + '/' + (importProgress.total || 0)}
        />
      ) : null}

      <div className="bir-body">
        <div className="bir-tune-list">
          <ListGroup variant="flush">
            {visibleTunes.map(function(tune) {
              const active = activeTune && activeTune.id === tune.id
              const selected = selectedTuneIds.indexOf(String(tune.id)) >= 0
              return (
                <ListGroup.Item
                  key={tune.id}
                  action
                  active={active}
                  onClick={function(e) {
                    if (e.metaKey || e.ctrlKey || e.shiftKey) {
                      setSelectedTuneIds(function(ids) {
                        const sid = String(tune.id)
                        if (ids.indexOf(sid) >= 0) return ids.filter(function(x) { return x !== sid })
                        return ids.concat([sid])
                      })
                      return
                    }
                    setActiveId(tune.id)
                  }}
                  className={'py-2' + (tune.complete ? ' complete' : '') + (selected ? ' bir-tune-selected' : '')}
                >
                  <div className="d-flex align-items-start gap-2">
                    <Form.Check
                      type="checkbox"
                      className="mt-1"
                      checked={selected}
                      onChange={function(e) {
                        e.stopPropagation()
                        const sid = String(tune.id)
                        setSelectedTuneIds(function(ids) {
                          if (e.target.checked) return ids.indexOf(sid) >= 0 ? ids : ids.concat([sid])
                          return ids.filter(function(x) { return x !== sid })
                        })
                      }}
                      onClick={function(e) { e.stopPropagation() }}
                      aria-label={'Select ' + (tune.title || tune.id)}
                    />
                    <div className="min-w-0 flex-grow-1">
                      <div className="small text-muted">p{tune.page}.{tune.tuneIndex}</div>
                      <div>{tune.title}</div>
                      {tune.complete ? <Badge bg="success">complete</Badge> : null}
                      {(tune.notationIssues || []).some(function(i) { return i.severity === 'error' }) ? (
                        <Badge bg="danger" className="ms-1">issues</Badge>
                      ) : null}
                      {tuneHasMidiSource(tune) ? <Badge bg="info" className="ms-1">MIDI</Badge> : null}
                      {tuneHasPdfSource(tune) ? <Badge bg="dark" className="ms-1">PDF</Badge> : null}
                    </div>
                  </div>
                </ListGroup.Item>
              )
            })}
            {!visibleTunes.length ? (
              <ListGroup.Item className="small text-muted">No tunes match filters</ListGroup.Item>
            ) : null}
          </ListGroup>
        </div>

        <div className="bir-active">
          {!activeTune ? (
            <Alert variant="info">No tunes in this review set yet.</Alert>
          ) : (
            <>
              <div className="bir-title-row mb-2">
                <Form.Control
                  defaultValue={activeTune.title}
                  key={activeTune.id + '-title'}
                  onBlur={handleTitleBlur}
                />
                <div className="bir-stable-id" title="Stable tune id">{activeTune.id}</div>
              </div>

              <ButtonGroup size="sm" className="mb-2 flex-wrap">
                <Button variant={activeTune.complete ? 'success' : 'outline-success'} onClick={handleToggleComplete}>
                  {activeTune.complete ? 'Complete' : 'Mark complete'}
                </Button>
                <Button
                  variant={activeTune && activeTune.suggestedMergeWithNext ? 'warning' : 'outline-secondary'}
                  disabled={busy}
                  onClick={handleMergeNext}
                  title={activeTune && activeTune.suggestedMergeWithNext
                    ? 'Suggested: join with the next crop and re-OMR'
                    : 'Join with the next tune on this page'}
                  data-testid="book-import-join-up"
                >
                  {activeTune && activeTune.suggestedMergeWithNext ? 'Join up (suggested)' : 'Join up'}
                </Button>
                <Button
                  variant="outline-secondary"
                  disabled={busy}
                  onClick={handleMergePrevious}
                  title="Join with the previous tune on this page"
                >
                  Join previous
                </Button>
                <Button
                  variant="outline-secondary"
                  disabled={busy || selectedTuneIds.length < 2}
                  onClick={handleJoinSelection}
                  title="Join selected consecutive same-page tunes"
                  data-testid="book-import-join-selection"
                >
                  Join selection ({selectedTuneIds.length})
                </Button>
                <Button
                  variant={splitMode ? 'warning' : 'outline-secondary'}
                  disabled={busy}
                  onClick={function() {
                    setSplitMode(function(v) { return !v })
                    setSplitGuideY(null)
                  }}
                  data-testid="book-import-split-at-y"
                >
                  {splitMode ? 'Click crop to split…' : 'Split at Y'}
                </Button>
                <Button
                  variant="outline-primary"
                  disabled={busy}
                  onClick={handleReOmr}
                  data-testid="book-import-re-omr"
                  title="Re-run OMR on the current crop"
                >
                  Re-OMR
                </Button>
                <Button
                  variant="primary"
                  disabled={busy || !cropZones.length}
                  onClick={handleRegenerateFromZones}
                  data-testid="book-import-regenerate"
                  title={cropZones.length ? 'OMR only selected crop zones' : 'Draw at least one crop zone first'}
                >
                  Regenerate zones
                </Button>
                <Button variant="outline-danger" disabled={busy} onClick={handleDeleteTune}>Delete</Button>
              </ButtonGroup>

              {(tuneHasMidiSource(activeTune) || tuneHasPdfSource(activeTune)) ? (
                <ButtonGroup size="sm" className="mb-2 flex-wrap">
                  {tuneHasMidiSource(activeTune) ? (
                    <Button
                      variant="outline-info"
                      disabled={busy}
                      data-testid="book-import-from-midi"
                      onClick={function() {
                        runSourceConvert('MIDI', function(t) {
                          return convertMidiForTune(t, accessToken)
                        })
                      }}
                    >
                      From MIDI
                    </Button>
                  ) : null}
                  {tuneHasPdfSource(activeTune) ? (
                    <Button
                      variant="outline-dark"
                      disabled={busy}
                      onClick={function() {
                        runSourceConvert('OMR PDF', function(t) {
                          return omrPdfForTune(t, accessToken, { forceSelect: true })
                        })
                      }}
                    >
                      OMR PDF
                    </Button>
                  ) : null}
                  <Button
                    variant="outline-primary"
                    disabled={busy}
                    onClick={function() {
                      runSourceConvert('Convert source', function(t) {
                        return convertSourceForTune(t, accessToken)
                      })
                    }}
                  >
                    Convert source
                  </Button>
                </ButtonGroup>
              ) : null}

              {activeTune && activeTune.suggestedMergeWithNext ? (
                <Alert variant="warning" className="py-2 small d-flex align-items-center justify-content-between flex-wrap gap-2">
                  <span>This crop may continue on the next page. Accept join to stitch and re-transcribe.</span>
                  <Form.Check
                    type="checkbox"
                    id={'bir-accept-merge-' + activeTune.id}
                    label="Accept suggested join"
                    disabled={busy}
                    onChange={function(e) {
                      if (e.target.checked) {
                        handleMergeNext()
                      } else {
                        patchActive({ suggestedMergeWithNext: false })
                      }
                    }}
                  />
                </Alert>
              ) : null}

              <p className="bir-hint mb-2">
                {splitMode
                  ? 'Move over the crop to preview the split line, then click to cut, join, and re-OMR both halves.'
                  : 'Drag zones → Regenerate zones · checkbox-select consecutive tunes → Join selection · Prep crop then Re-OMR'}
              </p>

              <div className="bir-prep-bar mb-2 d-flex flex-wrap align-items-center gap-2" data-testid="book-import-crop-prep">
                <span className="small text-muted">Prep crop</span>
                <Button size="sm" variant="outline-secondary" disabled={busy} onClick={function() { handleApplyCropPrep({ rotateDeg: -90 }) }}>↺ 90°</Button>
                <Button size="sm" variant="outline-secondary" disabled={busy} onClick={function() { handleApplyCropPrep({ rotateDeg: 90 }) }}>↻ 90°</Button>
                <Button size="sm" variant="outline-secondary" disabled={busy} onClick={function() { handleApplyCropPrep({ flipH: true }) }}>Flip H</Button>
                <Button size="sm" variant="outline-secondary" disabled={busy} onClick={function() { handleApplyCropPrep({ trimPct: 0.04 }) }}>Trim 4%</Button>
                <Form.Label className="small mb-0">Contrast</Form.Label>
                <Form.Range
                  style={{ width: '6rem' }}
                  min={0.6}
                  max={1.8}
                  step={0.05}
                  value={prepContrast}
                  onChange={function(e) { setPrepContrast(Number(e.target.value)) }}
                />
                <Form.Label className="small mb-0">Bright</Form.Label>
                <Form.Range
                  style={{ width: '6rem' }}
                  min={-0.3}
                  max={0.3}
                  step={0.02}
                  value={prepBrightness}
                  onChange={function(e) { setPrepBrightness(Number(e.target.value)) }}
                />
                <Button
                  size="sm"
                  variant="outline-primary"
                  disabled={busy}
                  onClick={function() { handleApplyCropPrep({}) }}
                >
                  Apply levels
                </Button>
              </div>

              <div className="bir-cols">
                <div className="bir-col" ref={cropColRef}>
                  <div className="bir-col-label">Crop</div>
                  <div
                    className={'bir-crop-wrap' + (splitMode ? ' split-mode' : '')}
                    onMouseLeave={function() {
                      if (dragStart) {
                        setDragStart(null)
                        setDragCurrent(null)
                      }
                      if (splitMode) setSplitGuideY(null)
                    }}
                    onMouseMove={function(event) {
                      if (!splitMode || !cropImgRef.current) return
                      const rect = cropImgRef.current.getBoundingClientRect()
                      const y = event.clientY - rect.top
                      setSplitGuideY(Math.max(0, Math.min(rect.height, y)))
                    }}
                  >
                    {cropUrl ? (
                      <img
                        ref={cropImgRef}
                        src={cropUrl}
                        alt={activeTune.title}
                        draggable={false}
                        onMouseDown={handleCropMouseDown}
                        onMouseMove={handleCropMouseMove}
                        onMouseUp={handleCropMouseUp}
                      />
                    ) : (
                      <div className="text-muted p-3">No crop</div>
                    )}
                    {cropZones.map(function(zone) {
                      return (
                        <div
                          key={zone.id}
                          className="bir-zone"
                          title="Crop zone — click or right-click to remove"
                          onClick={async function(e) {
                            e.stopPropagation()
                            const next = removeCropZone(activeTune, zone.id)
                            await patchActive({ cropZones: next.cropZones, badSections: [] })
                          }}
                          onContextMenu={async function(e) {
                            e.preventDefault()
                            e.stopPropagation()
                            const next = removeCropZone(activeTune, zone.id)
                            await patchActive({ cropZones: next.cropZones, badSections: [] })
                          }}
                          style={{
                            left: zone.x + '%',
                            top: zone.y + '%',
                            width: zone.width + '%',
                            height: zone.height + '%',
                          }}
                        />
                      )
                    })}
                    {draftZone && draftZone.width > 0.5 && draftZone.height > 0.5 ? (
                      <div
                        className="bir-zone bir-zone-draft"
                        style={{
                          left: draftZone.left + '%',
                          top: draftZone.top + '%',
                          width: draftZone.width + '%',
                          height: draftZone.height + '%',
                        }}
                      />
                    ) : null}
                    {splitMode && splitGuideY != null ? (
                      <div
                        className="bir-split-guide"
                        style={{ top: splitGuideY + 'px' }}
                        data-testid="book-import-split-guide"
                      />
                    ) : null}
                  </div>
                </div>

                <div className="bir-col" ref={staffColRef}>
                  {textOnlyFormat ? (
                    <>
                      <div className="bir-col-label">{sheetFormatLabel(activeFormat)}</div>
                      <Form.Control
                        as="textarea"
                        className="bir-abc-textarea"
                        value={String((activeTune && activeTune.chordSheetText) || '')}
                        onChange={function(e) {
                          patchActive({ chordSheetText: e.target.value, status: 'ready' })
                        }}
                        spellCheck={false}
                        data-testid="book-import-chord-editor"
                      />
                    </>
                  ) : abcText && chordEditOn && !playOn ? (
                    <BookImportStaffWithChords
                      abc={abcText}
                      playOn={playOn}
                      onPlayToggle={setPlayOn}
                      onAbcChange={function(next) {
                        applyAbcTransform(function() { return next })
                      }}
                    />
                  ) : (
                    <>
                  <div className="d-flex align-items-center justify-content-between">
                    <div className="bir-col-label">
                      {textOnlyFormat ? sheetFormatLabel(activeFormat) : 'Notation'}
                    </div>
                    <ButtonGroup size="sm">
                      {!textOnlyFormat && abcText ? (
                        <Button
                          variant={chordEditOn ? 'primary' : 'outline-secondary'}
                          onClick={function() { setChordEditOn(function(v) { return !v }) }}
                          title="Edit chord symbols on the staff"
                        >
                          Chords
                        </Button>
                      ) : null}
                      <Button
                        variant={playOn ? 'danger' : 'outline-primary'}
                        disabled={!abcText || textOnlyFormat}
                        onClick={function() { setPlayOn(function(v) { return !v }) }}
                      >
                        {playOn ? 'Stop' : 'Play'}
                      </Button>
                    </ButtonGroup>
                  </div>
                  <div className="bir-staff-wrap">
                    {textOnlyFormat ? null : abcText ? (
                      <Abc
                        key={activeTune.id + '-' + (candidate && candidate.id) + (playOn ? '-play' : '-stop')}
                        abc={abcText}
                        tunebook={tunebook}
                        autoStart={playOn}
                        autoPrime={playOn}
                        hidePlayer={!playOn}
                        speakTitle={false}
                        cacheAudio={false}
                        onEnded={function() { setPlayOn(false) }}
                      />
                    ) : (
                      <Alert variant="secondary" className="small mb-0">No ABC selected</Alert>
                    )}
                  </div>
                    </>
                  )}
                </div>

                <div className="bir-col">
                  <div className="bir-col-label">{textOnlyFormat ? 'Text tools' : 'ABC tools'}</div>
                  {textOnlyFormat ? (
                    <Alert variant="info" className="small">
                      Detected as {sheetFormatLabel(activeFormat)}. Edit the chord/lyrics text in the middle column.
                      Notation OMR was skipped for this crop.
                    </Alert>
                  ) : (
                    <>
                    <div>
                    <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
                      <div className="small text-muted">Candidates</div>
                      <Form.Check
                        type="checkbox"
                        id="bir-score-all-parts"
                        className="small mb-0"
                        label="All parts"
                        checked={scoreUploadAllParts}
                        onChange={function(e) { setScoreUploadAllParts(e.target.checked) }}
                      />
                      <Button
                        size="sm"
                        variant="outline-secondary"
                        disabled={scoreUploadBusy || !activeTune}
                        onClick={function() {
                          if (scoreFileRef.current) scoreFileRef.current.click()
                        }}
                      >
                        Add score…
                      </Button>
                      <input
                        ref={scoreFileRef}
                        type="file"
                        accept=".mxl,.xml,.musicxml,.mscz"
                        className="d-none"
                        onChange={function(e) {
                          const file = e.target.files && e.target.files[0]
                          e.target.value = ''
                          if (file) handleAddScoreFile(file)
                        }}
                      />
                    </div>
                    {scoreUploadHint ? (
                      <p className="bir-hint mb-1">{scoreUploadHint}</p>
                    ) : null}
                    <ListGroup className="mb-2">
                      {displayCandidates.map(function(c) {
                        const selected = activeTune.selectedCandidateId === c.id
                        const chords = c.hasChords ? chordCount(c.abc) : 0
                        const issueN = Array.isArray(c.notationIssues) ? c.notationIssues.length : 0
                        return (
                          <ListGroup.Item
                            key={c.id}
                            action
                            active={selected}
                            onClick={function() { handleSelectCandidate(c.id) }}
                            className="py-1 small bir-candidate-item"
                          >
                            <strong>{c.source}</strong>
                            {isOmrSource(c) ? <Badge bg="secondary" className="ms-1">omr</Badge> : null}
                            {c.hasChords ? (
                              <Badge bg="success" className="ms-1">chords{chords ? ' ' + chords : ''}</Badge>
                            ) : null}
                            {issueN ? <Badge bg="warning" text="dark" className="ms-1">{issueN} issues</Badge> : null}
                            <span className="text-muted ms-1">{Math.round((c.score || 0) * 100)}%</span>
                          </ListGroup.Item>
                        )
                      })}
                      {!displayCandidates.length ? (
                        <ListGroup.Item className="small text-muted">No candidates yet</ListGroup.Item>
                      ) : null}
                    </ListGroup>
                  </div>

                  <ButtonGroup size="sm" className="flex-wrap mb-1">
                    <Button
                      variant="outline-secondary"
                      disabled={!abcText}
                      onClick={function() {
                        applyAbcTransform(function(abc) { return transposeAbcText(abc, 1) })
                      }}
                    >
                      Transpose +1
                    </Button>
                    <Button
                      variant="outline-secondary"
                      disabled={!abcText}
                      onClick={function() {
                        applyAbcTransform(function(abc) { return transposeAbcText(abc, -1) })
                      }}
                    >
                      Transpose −1
                    </Button>
                    <Button
                      variant="outline-secondary"
                      disabled={!abcText || !abcTools}
                      onClick={function() {
                        applyAbcTransform(function(abc) {
                          return scaleAbcNoteLengths(abc, 0.5, abcTools)
                        })
                      }}
                    >
                      Halve lengths
                    </Button>
                    <Button
                      variant="outline-secondary"
                      disabled={!abcText || !abcTools}
                      onClick={function() {
                        applyAbcTransform(function(abc) {
                          return scaleAbcNoteLengths(abc, 2, abcTools)
                        })
                      }}
                    >
                      Double lengths
                    </Button>
                    <Button
                      variant="outline-secondary"
                      disabled={!undoStack.length}
                      onClick={handleUndoAbc}
                    >
                      Undo
                    </Button>
                  </ButtonGroup>

                  <Form.Group className="mb-2" style={{ maxWidth: '10rem' }}>
                    <Form.Label className="small mb-0">Meter</Form.Label>
                    <Form.Select
                      size="sm"
                      value={currentMeter}
                      disabled={!abcText}
                      onChange={function(e) {
                        const meter = e.target.value
                        applyAbcTransform(function(abc) { return setAbcMeter(abc, meter) })
                      }}
                    >
                      {METER_OPTIONS.indexOf(currentMeter) < 0 ? (
                        <option value={currentMeter}>{currentMeter}</option>
                      ) : null}
                      {METER_OPTIONS.map(function(m) {
                        return <option key={m} value={m}>{m}</option>
                      })}
                    </Form.Select>
                  </Form.Group>

                  <Form.Control
                    as="textarea"
                    className="bir-abc-textarea"
                    value={abcText}
                    disabled={!activeTune}
                    onChange={function(e) {
                      const next = e.target.value
                      setAbcDraft(next)
                      schedulePersistAbc(next)
                    }}
                    spellCheck={false}
                    data-testid="book-import-abc-editor"
                  />

                  {checkTune ? (
                    <div className="mt-2">
                      <NotationIssuesPanel
                        inline
                        tune={checkTune}
                        tunebook={tunebook}
                        issues={issues}
                        checkResults={checkResults}
                        onTuneSaved={handleTuneSavedFromIssues}
                      />
                    </div>
                  ) : null}
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {busy ? (
        <div className="text-muted small mt-2">
          <Spinner animation="border" size="sm" className="me-1" /> Working…
        </div>
      ) : null}
    </div>
  )
}
