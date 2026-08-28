/**
 * Review panel for an Import Book review set: 3-col crop | staff | ABC tools.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Badge, Button, ButtonGroup, Form, ListGroup, ProgressBar, Spinner } from 'react-bootstrap'
import { toast } from 'react-toastify'
import Abc from './Abc'
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
import {
  deleteTuneFromList,
  planMergeWithNext,
  planSplitTune,
  mergeCropBlobs,
  splitCropBlob,
  addCropZone,
  removeCropZone,
  getTuneCropZones,
  buildZonesOnlyBlob,
  rehydrateCropBlobFromPdf,
} from '../bookImportCropOps'
import { reprocessReviewTune } from '../bookImportPipeline'
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
  const [statusFilter, setStatusFilter] = useState('all')
  const [preferChords, setPreferChords] = useState(true)
  const [abcDraft, setAbcDraft] = useState('')
  const [undoStack, setUndoStack] = useState([])
  const [playOn, setPlayOn] = useState(false)
  const cropImgRef = useRef(null)
  const cropColRef = useRef(null)
  const staffColRef = useRef(null)
  const abcPersistTimer = useRef(null)

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
  }, [activeTune && activeTune.id, activeTune && activeTune.cropBlobKey, activeTune && activeTune.sourcePdfBlobKey]) // eslint-disable-line react-hooks/exhaustive-deps

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
      toast.info('No next tune on this page to merge')
      return
    }
    setBusy(true)
    try {
      const blobA = await getReviewBlob(activeTune.cropBlobKey)
      const blobB = await getReviewBlob(plan.removed.cropBlobKey)
      const mergedBlob = await mergeCropBlobs(blobA, blobB)
      const newKey = 'crop-merge-' + setId + '-' + Date.now()
      await putReviewBlob(newKey, mergedBlob)
      if (plan.removed.cropBlobKey) await deleteReviewBlob(plan.removed.cropBlobKey)
      plan.mergeTarget.cropBlobKey = newKey
      await updateReviewSet(setId, { tunes: plan.tunes.map(function(t) {
        return t.id === plan.mergeTarget.id ? plan.mergeTarget : t
      }) })
      await reprocessReviewTune(setId, plan.mergeTarget.id, {
        accessToken: props.accessToken,
        resolverAvailable: props.resolverAvailable,
        abcTools: abcTools,
      })
      await loadSet()
      toast.success('Merged crops')
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
    try {
      const blob = await getReviewBlob(activeTune.cropBlobKey)
      const split = await splitCropBlob(blob, ratio, { normalized: true })
      const plan = planSplitTune(tunes, activeTune.id, {})
      if (!plan) return
      const topKey = 'crop-split-a-' + setId + '-' + Date.now()
      const bottomKey = 'crop-split-b-' + setId + '-' + Date.now()
      await putReviewBlob(topKey, split.topBlob)
      await putReviewBlob(bottomKey, split.bottomBlob)
      if (activeTune.cropBlobKey) await deleteReviewBlob(activeTune.cropBlobKey)
      plan.topTune.cropBlobKey = topKey
      plan.bottomTune.cropBlobKey = bottomKey
      const nextTunes = plan.tunes.map(function(t) {
        if (t.id === plan.topTune.id) return plan.topTune
        if (t.id === plan.bottomTune.id) return plan.bottomTune
        return t
      })
      await updateReviewSet(setId, { tunes: nextTunes })
      await reprocessReviewTune(setId, plan.topTune.id, {
        accessToken: props.accessToken,
        resolverAvailable: props.resolverAvailable,
        abcTools: abcTools,
      })
      await reprocessReviewTune(setId, plan.bottomTune.id, {
        accessToken: props.accessToken,
        resolverAvailable: props.resolverAvailable,
        abcTools: abcTools,
      })
      await loadSet()
      toast.success('Split crop')
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
      const cropBlob = await getReviewBlob(activeTune.cropBlobKey)
      const zonesBlob = await buildZonesOnlyBlob(cropBlob, cropZones)
      await reprocessReviewTune(setId, activeTune.id, {
        accessToken: props.accessToken,
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

  async function handleImport() {
    if (!reviewSet || !tunebook) return
    if (!reviewSet.book) {
      toast.error('Review set is missing a book')
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
        <div className="d-flex gap-2">
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
              return (
                <ListGroup.Item
                  key={tune.id}
                  action
                  active={active}
                  onClick={function() { setActiveId(tune.id) }}
                  className={'py-2' + (tune.complete ? ' complete' : '')}
                >
                  <div className="small text-muted">p{tune.page}.{tune.tuneIndex}</div>
                  <div>{tune.title}</div>
                  {tune.complete ? <Badge bg="success">complete</Badge> : null}
                  {(tune.notationIssues || []).some(function(i) { return i.severity === 'error' }) ? (
                    <Badge bg="danger" className="ms-1">issues</Badge>
                  ) : null}
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
                    ? 'Suggested: this crop may continue on the next page'
                    : 'Merge with the next tune'}
                >
                  {activeTune && activeTune.suggestedMergeWithNext ? 'Merge next (suggested)' : 'Merge next'}
                </Button>
                <Button
                  variant={splitMode ? 'warning' : 'outline-secondary'}
                  disabled={busy}
                  onClick={function() { setSplitMode(function(v) { return !v }) }}
                >
                  Split at Y
                </Button>
                <Button
                  variant="primary"
                  disabled={busy || !cropZones.length}
                  onClick={handleRegenerateFromZones}
                  data-testid="book-import-regenerate"
                  title={cropZones.length ? 'OMR only selected crop zones' : 'Draw at least one crop zone first'}
                >
                  Regenerate
                </Button>
                <Button variant="outline-danger" disabled={busy} onClick={handleDeleteTune}>Delete</Button>
              </ButtonGroup>

              {activeTune && activeTune.suggestedMergeWithNext ? (
                <Alert variant="warning" className="py-2 small d-flex align-items-center justify-content-between flex-wrap gap-2">
                  <span>This crop may continue on the next page. Accept merge to stitch and re-transcribe.</span>
                  <Form.Check
                    type="checkbox"
                    id={'bir-accept-merge-' + activeTune.id}
                    label="Accept suggested merge"
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
                  ? 'Click on the crop image where the split should be.'
                  : 'Drag zones to regenerate · Regenerate sends only selected regions'}
              </p>

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
                  </div>
                </div>

                <div className="bir-col" ref={staffColRef}>
                  <div className="d-flex align-items-center justify-content-between">
                    <div className="bir-col-label">
                      {textOnlyFormat ? sheetFormatLabel(activeFormat) : 'Notation'}
                    </div>
                    <ButtonGroup size="sm">
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
                    {textOnlyFormat ? (
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
                    ) : abcText ? (
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
                    <div className="small text-muted mb-1">Candidates</div>
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
