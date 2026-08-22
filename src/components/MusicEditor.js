import {useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {Button, ButtonGroup} from 'react-bootstrap'
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore, useState} from 'react'
import AbcEditor from './AbcEditor'
import NotationSearchButton from './NotationSearchButton'
import NotationSelectButton from './NotationSelectButton'
import MelodyAnalysisRefineModal from './MelodyAnalysisRefineModal'
import { applyImportedNotationToTune, importedTuneFromCandidate } from '../notationFileImport'
import ViewModeSelectorModal from './ViewModeSelectorModal'
import { trackEditorOpen } from '../analytics'
import { canRedoTuneEdit, canUndoTuneEdit, getRedoTuneEditLabel, getUndoTuneEditLabel } from '../tuneEditHistory'
import { useBulkCheckReturnToast } from '../useBulkCheckReturnToast'
import { isNotationEditorView, normalizeEditorViewMode } from '../viewModeUtils'
import { getBackgroundReviewSummary } from '../backgroundReviewQueue'
import { showBackgroundJobsContinuingNotice } from '../backgroundReviewToast'
import {buildSingleTuneTitle, DEFAULT_APP_TITLE, setDocumentTitle} from '../pageTitle'
import {
  EMPTY_MEDIA_ANALYSIS_JOB,
  getMediaAnalysisJob,
  subscribeMediaAnalysisJobs,
} from '../mediaAnalysisJobs'
import { mediaAnalysisJobHasMelodySourceNotes } from '../mediaAnalysisSuggestions'
import { allGenres, mergeBibliographicList } from '../tuneBibliographicUtils'
import { confirmLeaveChordRecord } from '../chordRecordNavigationGuard'
import { getTune as getTuneFromRepository } from '../tuneRepository'

export default function MusicEditor(props) {
    const embedded = !!props.embedded
    const notationOnly = !!props.notationOnly
    const { tunebook, forceRefresh } = props
    let params = useParams();
    var navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const routeTuneId = params.tuneId || ''
    const resolvedTuneId = embedded ? (props.tuneId || routeTuneId) : routeTuneId
    const urlView = params.view ? normalizeEditorViewMode(params.view) : 'info'
    var [editorViewMode, setEditorViewMode] = useState(
      notationOnly
        ? (props.initialView || 'music')
        : (embedded ? (props.initialView || 'info') : urlView)
    )
    const [repoTune, setRepoTune] = useState(null)
    const [tuneLoadState, setTuneLoadState] = useState('idle')
    const editorRootRef = useRef(null)
    const editorChromeStackRef = useRef(null)
    const [secondaryToolbarHost, setSecondaryToolbarHost] = useState(null)

    const tuneFromProps = useMemo(function() {
      if (!resolvedTuneId || !tunebook) return null
      if (embedded && typeof tunebook.fromSelection === 'function') {
        const matches = tunebook.fromSelection({ [resolvedTuneId]: true })
        if (matches && matches[0]) return matches[0]
      }
      if (props.tunes && props.tunes[resolvedTuneId]) return props.tunes[resolvedTuneId]
      if (embedded && props.tune) return props.tune
      return null
    }, [embedded, resolvedTuneId, tunebook, props.tunes, props.tunes && resolvedTuneId && props.tunes[resolvedTuneId], props.tune, props.tunesRevision])

    useEffect(function() {
      let cancelled = false
      if (!resolvedTuneId) {
        setRepoTune(null)
        setTuneLoadState('missing')
        return undefined
      }
      if (tuneFromProps) {
        setRepoTune(null)
        setTuneLoadState('ready')
        return undefined
      }
      if (embedded) {
        setRepoTune(null)
        setTuneLoadState('missing')
        return undefined
      }
      const tunesCount = props.tunes ? Object.keys(props.tunes).length : 0
      setTuneLoadState('loading')
      getTuneFromRepository(resolvedTuneId).then(function(loaded) {
        if (cancelled) return
        if (loaded) {
          setRepoTune(loaded)
          setTuneLoadState('ready')
          return
        }
        // Empty in-memory book usually means hydration is still running.
        if (tunesCount === 0) {
          setTuneLoadState('loading')
          return
        }
        setRepoTune(null)
        setTuneLoadState('missing')
      }).catch(function() {
        if (cancelled) return
        setRepoTune(null)
        setTuneLoadState(tunesCount === 0 ? 'loading' : 'missing')
      })
      return function() { cancelled = true }
    }, [embedded, resolvedTuneId, tuneFromProps, props.tunes])

    const tune = tuneFromProps || repoTune

    let abc = tune ? tunebook.abcTools.json2abc(tune) : ''
    const editHistory = props.editHistory
    const historyState = editHistory ? editHistory.historyState : null
    const tuneId = tune && tune.id
    useBulkCheckReturnToast(embedded ? null : tuneId)

    const notifyRefresh = useCallback(function() {
      if (typeof forceRefresh === 'function') forceRefresh()
      if (embedded && typeof props.onLiveSave === 'function') props.onLiveSave(tuneId)
    }, [embedded, forceRefresh, props.onLiveSave, tuneId])
    const notationFlushRef = useRef(null)
    useEffect(function() {
        if (typeof props.onRegisterActiveEditorFlush !== 'function') return undefined
        props.onRegisterActiveEditorFlush(function() {
            if (notationFlushRef.current) notationFlushRef.current()
        })
        return function() { props.onRegisterActiveEditorFlush(null) }
    }, [props.onRegisterActiveEditorFlush])
    const canUndo = tuneId && editHistory ? editHistory.canUndo(tuneId) : false
    const canRedo = tuneId && editHistory ? editHistory.canRedo(tuneId) : false
    const undoLabel = tuneId && historyState ? getUndoTuneEditLabel(historyState, tuneId) : ''
    const redoLabel = tuneId && historyState ? getRedoTuneEditLabel(historyState, tuneId) : ''
    const autoActivateChordRecord = editorViewMode === 'chords' && searchParams.get('record') === '1'
    const mediaAnalysis = useSyncExternalStore(
      subscribeMediaAnalysisJobs,
      function() { return getMediaAnalysisJob(tuneId) },
      function() { return EMPTY_MEDIA_ANALYSIS_JOB }
    )
    const [showAnalysisRefine, setShowAnalysisRefine] = useState(false)
    const canFineTuneAnalysis = mediaAnalysisJobHasMelodySourceNotes({
      melodySourceNotes: mediaAnalysis.melodySourceNotes,
    })

    useEffect(function() {
        if (embedded) return
        const nextView = params.view ? normalizeEditorViewMode(params.view) : 'info'
        setEditorViewMode(nextView)
    }, [embedded, params.tuneId, params.view])

    useEffect(function() {
        if (!embedded || !props.initialView) return
        setEditorViewMode(normalizeEditorViewMode(props.initialView))
    }, [embedded, props.initialView, resolvedTuneId])

    function handleEditorViewChange(nextView) {
        const normalized = normalizeEditorViewMode(nextView)
        if (normalized !== editorViewMode && !confirmLeaveChordRecord()) {
            return
        }
        setEditorViewMode(normalized)
        if (notationOnly || embedded || !tuneId) return
        const basePath = '/editor/' + encodeURIComponent(tuneId)
        const recordQuery = searchParams.get('record') === '1' && normalized === 'chords' ? '?record=1' : ''
        if (normalized === 'info') {
            navigate(basePath, { replace: true })
        } else {
            navigate(basePath + '/' + encodeURIComponent(normalized) + recordQuery, { replace: true })
        }
    }

    // Replace legacy sourceAbc/abc URLs with /editor/:id (normalized to info)
    useEffect(function() {
        if (embedded || !tuneId) return
        var legacyUrl = false
        if (params.view === 'sourceAbc' || params.view === 'abc') {
            legacyUrl = true
        }
        if (legacyUrl) {
            navigate('/editor/' + encodeURIComponent(tuneId), { replace: true })
        }
    }, [embedded, tuneId, params.view, navigate])

    const handleUndo = useCallback(function() {
        if (!tuneId) return
        if (editHistory && typeof editHistory.flushPendingTune === 'function') {
            editHistory.flushPendingTune(tuneId)
        }
        if (tunebook.undoTuneEdits(tuneId)) {
            notifyRefresh()
        }
    }, [tuneId, tunebook, notifyRefresh, editHistory])

    const handleRedo = useCallback(function() {
        if (!tuneId) return
        if (editHistory && typeof editHistory.flushPendingTune === 'function') {
            editHistory.flushPendingTune(tuneId)
        }
        if (tunebook.redoTuneEdits(tuneId)) {
            notifyRefresh()
        }
    }, [tuneId, tunebook, notifyRefresh, editHistory])

    // Editor does not clear the now-playing queue; follow-tune navigation is suppressed in editor.
    useEffect(function() {
      if (!embedded) trackEditorOpen()
    }, [embedded])

    useEffect(function() {
        if (embedded) return undefined
        setDocumentTitle(buildSingleTuneTitle(tune && tune.name))
        return function() {
            setDocumentTitle(DEFAULT_APP_TITLE)
        }
    }, [embedded, tune && tune.name])

    const leaveWarnedRef = useRef(false)
    function warnIfJobsContinuing() {
      if (leaveWarnedRef.current) return
      const summary = getBackgroundReviewSummary()
      if (summary && summary.processing > 0) {
        leaveWarnedRef.current = true
        showBackgroundJobsContinuingNotice({ summary: summary })
      }
    }

    useEffect(function() {
      return function() {
        warnIfJobsContinuing()
      }
    }, [])

    useEffect(function() {
        function handleHistoryShortcut(event) {
            if (!tuneId || props.blockKeyboardShortcuts) return
            const target = event.target
            const tagName = target && target.tagName ? String(target.tagName).toLowerCase() : ''
            const isEditable = target && (target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select')
            if (isEditable) return
            const modifierPressed = event.metaKey || event.ctrlKey
            if (!modifierPressed) return
            const key = String(event.key || '').toLowerCase()
            if (key === 'z' && event.shiftKey) {
                if (canRedo) {
                    event.preventDefault()
                    handleRedo()
                }
                return
            }
            if (key === 'y') {
                if (canRedo) {
                    event.preventDefault()
                    handleRedo()
                }
                return
            }
            if (key === 'z') {
                if (canUndo) {
                    event.preventDefault()
                    handleUndo()
                }
            }
        }

        window.addEventListener('keydown', handleHistoryShortcut)
        return function() {
            window.removeEventListener('keydown', handleHistoryShortcut)
        }
    }, [props.blockKeyboardShortcuts, canRedo, canUndo, tuneId, handleRedo, handleUndo])

    // Keep second-level sticky toolbars (notation etc.) parked under the measured
    // chrome stack (close bar + optional lyrics toolbar) so rows never overlap.
    useLayoutEffect(function() {
      if (notationOnly) return undefined
      const root = editorRootRef.current
      const stack = editorChromeStackRef.current
      if (!root || !stack) return undefined

      function measure() {
        const height = stack.getBoundingClientRect().height
        if (!(height > 0)) return
        root.style.setProperty('--music-editor-buttons-sticky-height', height + 'px')
        root.style.setProperty(
          '--music-editor-chrome-offset',
          'calc(var(--chrome-header-offset, calc(3.7em + 1px + env(safe-area-inset-top, 0px))) + ' + height + 'px)'
        )
      }

      measure()
      let observer = null
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(measure)
        observer.observe(stack)
      }
      window.addEventListener('resize', measure)
      return function() {
        if (observer) observer.disconnect()
        window.removeEventListener('resize', measure)
        root.style.removeProperty('--music-editor-buttons-sticky-height')
        root.style.removeProperty('--music-editor-chrome-offset')
      }
    }, [notationOnly, editorViewMode, tuneLoadState, secondaryToolbarHost])
    
    const isNotationView = isNotationEditorView(editorViewMode)
    const historyButtonGroup = (
      <span className={isNotationView ? 'notation-toolbar-history' : undefined}>
        <ButtonGroup className={'music-editor-history-group' + (isNotationView ? ' notation-toolbar-history-group' : '')} aria-label="Undo and redo">
          <Button
            size={isNotationView ? 'lg' : undefined}
            title={canUndo && undoLabel ? 'Undo ' + undoLabel : 'Undo'}
            disabled={!canUndo}
            variant={isNotationView ? 'outline-secondary' : 'secondary'}
            className={isNotationView ? undefined : 'btn-secondary'}
            onClick={handleUndo}
          >{props.tunebook.icons.arrowgoback}</Button>
          <Button
            size={isNotationView ? 'lg' : undefined}
            title={canRedo && redoLabel ? 'Redo ' + redoLabel : 'Redo'}
            disabled={!canRedo}
            variant={isNotationView ? 'outline-secondary' : 'secondary'}
            className={isNotationView ? undefined : 'btn-secondary'}
            onClick={handleRedo}
          >{props.tunebook.icons.arrowgoforward}</Button>
        </ButtonGroup>
      </span>
    )

    if (tuneLoadState === 'loading' || (tuneLoadState === 'idle' && !tune)) {
      return <div className="music-editor p-3" style={{width:'100%'}}>Loading tune…</div>
    }
    if (!tune) {
      return (
        <div className="music-editor p-3" style={{width:'100%'}}>
          <p className="mb-2">Tune not found.</p>
          {!embedded ? (
            <Button variant="secondary" onClick={function() { navigate('/tunes') }}>
              Back to tunes
            </Button>
          ) : null}
        </div>
      )
    }

    return <div ref={editorRootRef} className={'music-editor' + (embedded ? ' music-editor--embedded' : '') + (notationOnly ? ' music-editor--notation-only' : '') + (editorViewMode === 'lyrics' ? ' music-editor--lyrics' : '')} style={{width:'100%'}}>
        {!notationOnly ? (
        <div ref={editorChromeStackRef} className="music-editor-chrome-stack">
        <div className="music-editor-buttons">
            <div className="music-editor-buttons-left">
                <Button
                  className="btn-secondary music-editor-close-btn"
                  title={embedded ? 'Back to bulk check' : 'Close editor'}
                  onClick={function() {
                  warnIfJobsContinuing()
                  if (embedded) {
                    if (typeof props.onClose === 'function') props.onClose()
                    return
                  }
                  navigate('/tunes/' + tune.id)
                }}>{props.tunebook.icons.close}</Button>
                {historyButtonGroup}
                {isNotationView ? (
                  <>
                    <span className="music-editor-notation-import">
                    <NotationSearchButton
                      tuneId={tuneId}
                      tune={tune}
                      title={tune && tune.name ? tune.name : ''}
                      artist={tune && tune.composer ? tune.composer : ''}
                      rhythm={tune && tune.rhythm ? tune.rhythm : ''}
                      currentGenres={allGenres(tune)}
                      currentValue={tune && tune.notes
                        ? (Array.isArray(tune.notes) ? tune.notes.join('\n') : String(tune.notes))
                        : (typeof abc === 'string' ? abc : '')}
                      token={props.token}
                      tunebook={props.tunebook}
                      disabled={!(tune && tune.name && String(tune.name).trim())}
                      onGenreAccept={function(genre) {
                        if (!tune) return
                        if (!Array.isArray(tune.genres)) tune.genres = []
                        tune.genres = mergeBibliographicList(tune.genres, [genre])
                        tune.id = tuneId
                        props.tunebook.saveTune(tune)
                      }}
                      onNotation={function(candidate) {
                        if (!props.tunebook || !props.tunebook.abcTools || !tune) return
                        let imported = null
                        if (candidate && candidate.tune && typeof candidate.tune === 'object') {
                          imported = Object.assign({}, candidate.tune)
                        } else {
                          const abcText = candidate && candidate.abc ? String(candidate.abc) : ''
                          if (!abcText) return
                          imported = props.tunebook.abcTools.abc2json(abcText)
                        }
                        if (!imported) return
                        imported.id = tune.id
                        if (candidate && candidate.sourceUrl && !imported.srcUrl) {
                          imported.srcUrl = candidate.sourceUrl
                        }
                        props.tunebook.saveTune(imported, false, { historyLabel: 'Import from notation search' })
                        notifyRefresh()
                      }}
                    />
                    <NotationSelectButton
                      tune={tune}
                      tunebook={props.tunebook}
                      token={props.token}
                      tunes={props.tunes}
                      onNotation={function(candidate) {
                        if (!props.tunebook || !tune) return
                        const imported = importedTuneFromCandidate(candidate, props.tunebook)
                        if (!imported) return
                        if (candidate && candidate.sourceUrl && !imported.srcUrl) {
                          imported.srcUrl = candidate.sourceUrl
                        }
                        const next = applyImportedNotationToTune(tune, imported)
                        props.tunebook.saveTune(next, false, { historyLabel: 'Import notation file' })
                        notifyRefresh()
                      }}
                    />
                    </span>
                    {canFineTuneAnalysis ? (
                      <Button
                        size="lg"
                        variant="outline-secondary"
                        title="Fine-tune analysis"
                        aria-label="Fine-tune analysis"
                        style={{ marginLeft: '0.35em' }}
                        onClick={function() { setShowAnalysisRefine(true) }}
                      >
                        {props.tunebook.icons.filter}
                        <span style={{ marginLeft: '0.35em', fontSize: '0.85em' }}>Fine-tune</span>
                      </Button>
                    ) : null}
                    <MelodyAnalysisRefineModal
                      show={showAnalysisRefine}
                      onHide={function() { setShowAnalysisRefine(false) }}
                      tunebook={props.tunebook}
                      tune={tune}
                      melodySourceNotes={mediaAnalysis.melodySourceNotes}
                      timedMelody={mediaAnalysis.timedMelody}
                      chordsText={mediaAnalysis.chordsText || ''}
                      onApply={function(abcText) {
                        if (!abcText || !props.tunebook || !props.tunebook.abcTools || !tune) return
                        const imported = props.tunebook.abcTools.abc2json(abcText)
                        if (!imported) return
                        imported.id = tune.id
                        props.tunebook.saveTune(imported, false, { historyLabel: 'Fine-tune media analysis' })
                        notifyRefresh()
                      }}
                    />
                  </>
                ) : null}
            </div>
            <div className="music-editor-header-view-groups">
                <ViewModeSelectorModal
                  variant="editor"
                  viewMode={editorViewMode}
                  tunebook={props.tunebook}
                  onChange={handleEditorViewChange}
                />
            </div>
        </div>
        <div
          ref={setSecondaryToolbarHost}
          className="music-editor-secondary-toolbar-host"
          data-testid="music-editor-secondary-toolbar-host"
        />
        </div>
        ) : null}
        <AbcEditor
          logout={props.logout}
          login={props.login}
          token={props.token}
          user={props.user}
          mediaController={props.mediaController}
          audioProps={props.audioProps}
          forceRefresh={notifyRefresh}
          isMobile={props.isMobile}
          abc={abc}
          tunebook={props.tunebook}
          tunes={props.tunes}
          tune={tune}
          editorViewMode={editorViewMode}
          onEditorViewModeChange={handleEditorViewChange}
          suppressInlineViewSelector={!notationOnly}
          autoActivateChordRecord={autoActivateChordRecord}
          autoStartChordSearch={props.autoStartChordSearch}
          searchIndex={props.searchIndex}
          loadTuneTexts={props.loadTuneTexts}
          onNotationHelpModeChange={props.onNotationHelpModeChange}
          historyControls={notationOnly && !embedded ? historyButtonGroup : null}
          alignedLyricsOnly={notationOnly}
          onRegisterFlushCommit={function(fn) { notationFlushRef.current = fn; }}
          secondaryToolbarHost={secondaryToolbarHost}
        />
    </div>
}
//  <TheSessionSearchSelectorModal value={tune ? tune.name : ''} currentTune={tune}  tunebook={props.tunebook}  currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  />
