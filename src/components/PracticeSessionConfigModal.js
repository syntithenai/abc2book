import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSearchParams } from 'react-router-dom'
import { Button, Modal, Form, ButtonGroup, Alert } from 'react-bootstrap'
import VocalRangePickerModal from './VocalRangePickerModal'
import { useResponsiveModalProps } from '../useResponsiveModalProps'
import {
  getPracticeList,
  listPracticeLists,
  MIN_RECOMMENDED_PRACTICE_LIST_TUNES,
  allPracticeListTuneCount,
  practiceListTuneCount,
  subscribePracticeLists,
} from '../practiceListStore'
import {
  DURATION_OPTIONS,
  PRACTICE_INSTRUMENTS,
  loadPracticeSettings,
  mergePracticeSettings,
  getSkillTempoRange,
  normalizePracticeInstrument,
  pushRecentInstrument,
  getPracticeInstrumentLabel,
  resolveVocalRange,
} from '../practiceSessionSettings'
import '../PracticeSessionConfigModal.css'

export default function PracticeSessionConfigModal(props) {
  const responsiveModalProps = useResponsiveModalProps()
  const [searchParams] = useSearchParams()
  const [instrument, setInstrument] = useState('mandolin')
  const [recentInstruments, setRecentInstruments] = useState([])
  const [totalMinutes, setTotalMinutes] = useState(10)
  const [practiceListId, setPracticeListId] = useState('')
  const [practiceLists, setPracticeLists] = useState([])
  const [includeWarmups, setIncludeWarmups] = useState(true)
  const [skillLevel, setSkillLevel] = useState(5)
  const [accuracyCheckingEnabled, setAccuracyCheckingEnabled] = useState(false)
  const [vocalRangeLow, setVocalRangeLow] = useState('')
  const [vocalRangeHigh, setVocalRangeHigh] = useState('')
  const [vocalRangeOpen, setVocalRangeOpen] = useState(false)

  function refreshPracticeLists() {
    setPracticeLists(listPracticeLists())
  }

  useEffect(function() {
    if (!props.show) return
    refreshPracticeLists()
    const unsubscribe = subscribePracticeLists(refreshPracticeLists)
    return function() { unsubscribe() }
  }, [props.show])

  useEffect(function() {
    if (props.show) {
      const saved = loadPracticeSettings()
      setInstrument(saved.instrument)
      setRecentInstruments(saved.recentInstruments || [])
      setTotalMinutes(saved.totalMinutes)
      setIncludeWarmups(saved.includeWarmups)
      setSkillLevel(saved.skillLevel)
      setAccuracyCheckingEnabled(saved.accuracyCheckingEnabled === true)
      setVocalRangeLow(saved.vocalRangeLow || '')
      setVocalRangeHigh(saved.vocalRangeHigh || '')

      const lists = listPracticeLists()
      const listParam = searchParams.get('list')
      const savedListId = saved.lastPracticeListId || ''
      const initialListId = listParam != null && listParam !== ''
        ? listParam
        : (savedListId || '')
      setPracticeListId(initialListId)

      const minutes = searchParams.get('minutes')
      if (minutes) setTotalMinutes(parseInt(minutes, 10))

      const instrumentParam = searchParams.get('instrument')
      if (instrumentParam) setInstrument(normalizePracticeInstrument(instrumentParam))

      const skill = searchParams.get('skill')
      if (skill) setSkillLevel(parseInt(skill, 10))

      const warmups = searchParams.get('warmups')
      if (warmups != null) setIncludeWarmups(warmups !== '0' && warmups !== 'false')
    }
  }, [props.show, searchParams])

  useEffect(function() {
    if (props.setBlockKeyboardShortcuts) {
      props.setBlockKeyboardShortcuts(!!props.show)
    }
    return function() {
      if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(false)
    }
  }, [props.show, props.setBlockKeyboardShortcuts])

  const selectedList = useMemo(function() {
    return practiceListId ? getPracticeList(practiceListId) : null
  }, [practiceListId, practiceLists])

  const selectedListTuneCount = practiceListTuneCount(selectedList)
  const allListsTuneCount = useMemo(function() {
    return allPracticeListTuneCount()
  }, [practiceLists])
  const effectiveTuneCount = practiceListId ? selectedListTuneCount : allListsTuneCount
  const hasPracticeLists = practiceLists.length > 0
  const canStart = hasPracticeLists && effectiveTuneCount > 0
  const showEmptyListWarning = !!practiceListId && selectedListTuneCount === 0
  const showNoTunesAnywhereWarning = !practiceListId && hasPracticeLists && allListsTuneCount === 0
  const showLowCountWarning = effectiveTuneCount > 0
    && effectiveTuneCount < MIN_RECOMMENDED_PRACTICE_LIST_TUNES

  function persistSettings(next) {
    mergePracticeSettings({
      instrument: next.instrument != null ? next.instrument : instrument,
      recentInstruments: next.recentInstruments != null ? next.recentInstruments : recentInstruments,
      totalMinutes: next.totalMinutes != null ? next.totalMinutes : totalMinutes,
      includeWarmups: next.includeWarmups != null ? next.includeWarmups : includeWarmups,
      skillLevel: next.skillLevel != null ? next.skillLevel : skillLevel,
      accuracyCheckingEnabled: next.accuracyCheckingEnabled != null
        ? next.accuracyCheckingEnabled
        : accuracyCheckingEnabled,
      vocalRangeLow: next.vocalRangeLow != null ? next.vocalRangeLow : vocalRangeLow,
      vocalRangeHigh: next.vocalRangeHigh != null ? next.vocalRangeHigh : vocalRangeHigh,
      lastPracticeListId: next.lastPracticeListId != null ? next.lastPracticeListId : practiceListId,
    })
  }

  function handleInstrumentChange(nextInstrument) {
    const next = normalizePracticeInstrument(nextInstrument)
    if (next === instrument) return
    const nextRecent = pushRecentInstrument(recentInstruments, instrument, next)
    setInstrument(next)
    setRecentInstruments(nextRecent)
    persistSettings({ instrument: next, recentInstruments: nextRecent })
  }

  function handleDurationChange(minutes) {
    setTotalMinutes(minutes)
    persistSettings({ totalMinutes: minutes })
  }

  function handleWarmupsChange(checked) {
    setIncludeWarmups(checked)
    if (!checked) {
      setAccuracyCheckingEnabled(false)
      persistSettings({ includeWarmups: false, accuracyCheckingEnabled: false })
    } else {
      persistSettings({ includeWarmups: true })
    }
  }

  function handleSkillChange(level) {
    setSkillLevel(level)
    persistSettings({ skillLevel: level })
  }

  function handleAccuracyChange(checked) {
    if (!includeWarmups) return
    setAccuracyCheckingEnabled(checked)
    persistSettings({ accuracyCheckingEnabled: checked })
  }

  function handleVocalRangeSave(range) {
    setVocalRangeLow(range.vocalRangeLow || '')
    setVocalRangeHigh(range.vocalRangeHigh || '')
    persistSettings({
      vocalRangeLow: range.vocalRangeLow || '',
      vocalRangeHigh: range.vocalRangeHigh || '',
    })
    setVocalRangeOpen(false)
  }

  function handlePracticeListChange(nextListId) {
    setPracticeListId(nextListId)
    persistSettings({ lastPracticeListId: nextListId })
  }

  const tempoPreview = getSkillTempoRange(skillLevel)
  const tempoPreviewStart = Math.round(tempoPreview.tempoStart * 100)
  const tempoPreviewEnd = Math.round(tempoPreview.tempoEnd * 100)
  const resolvedVocal = resolveVocalRange(vocalRangeLow, vocalRangeHigh)

  function handleStart() {
    if (!canStart) return
    const accuracy = includeWarmups ? accuracyCheckingEnabled : false
    mergePracticeSettings({
      instrument,
      recentInstruments,
      totalMinutes,
      includeWarmups,
      skillLevel,
      accuracyCheckingEnabled: accuracy,
      vocalRangeLow,
      vocalRangeHigh,
      lastPracticeListId: practiceListId,
    })
    if (props.onStart) {
      props.onStart({
        instrument,
        recentInstruments,
        totalMinutes,
        practiceListId,
        includeWarmups,
        skillLevel,
        accuracyCheckingEnabled: accuracy,
        vocalRangeLow,
        vocalRangeHigh,
      })
    }
  }

  return (
    <>
      <Modal
        show={!!props.show}
        onHide={props.onHide}
        {...responsiveModalProps}
        dialogClassName="practice-config-modal"
        size="lg"
      >
        <Modal.Header closeButton>
          <Modal.Title>Practice session</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="practice-config-instrument-duration mb-3">
            <div className="practice-config-label-row">
              <Form.Label className="mb-0">Instrument</Form.Label>
              <div className="practice-config-recent-instruments">
                {recentInstruments.map(function(id) {
                  return (
                    <Button
                      key={id}
                      size="sm"
                      variant="outline-secondary"
                      className="practice-config-recent-chip"
                      onClick={function() { handleInstrumentChange(id) }}
                    >
                      {getPracticeInstrumentLabel(id)}
                    </Button>
                  )
                })}
              </div>
            </div>
            <div className="practice-config-instrument-duration-inputs">
              <Form.Select
                className="practice-config-instrument-select"
                value={instrument}
                onChange={function(e) { handleInstrumentChange(e.target.value) }}
                aria-label="Instrument"
              >
                {PRACTICE_INSTRUMENTS.map(function(item) {
                  return (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  )
                })}
              </Form.Select>
              <Form.Label className="practice-config-duration-label mb-0">Duration</Form.Label>
              <ButtonGroup className="practice-duration-buttons">
                {DURATION_OPTIONS.map(function(minutes) {
                  return (
                    <Button
                      key={minutes}
                      variant={totalMinutes === minutes ? 'primary' : 'outline-primary'}
                      size="lg"
                      onClick={function() { handleDurationChange(minutes) }}
                    >
                      {minutes} min
                    </Button>
                  )
                })}
              </ButtonGroup>
            </div>
          </div>

          <hr className="practice-config-section-divider" />

          {instrument === 'voice' ? (
            <>
              <Form.Group className="mb-3 practice-config-vocal-range-row">
                <Form.Label className="mb-0">Vocal Range</Form.Label>
                <span className="practice-config-vocal-range-value text-muted">
                  {resolvedVocal.lowName} – {resolvedVocal.highName}
                  {!vocalRangeLow && !vocalRangeHigh ? ' (default)' : ''}
                </span>
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={function() { setVocalRangeOpen(true) }}
                >
                  Edit
                </Button>
              </Form.Group>
              <hr className="practice-config-section-divider" />
            </>
          ) : null}

          <Form.Group className="mb-3 practice-config-skill-field practice-config-skill-row">
            <Form.Label>Skill level ({skillLevel})</Form.Label>
            <Form.Range
              min={1}
              max={10}
              step={1}
              value={skillLevel}
              onChange={function(e) { handleSkillChange(parseInt(e.target.value, 10)) }}
            />
            <Form.Text className="text-muted">
              Tune tempo {tempoPreviewStart}%
              {tempoPreviewEnd !== tempoPreviewStart
                ? (' → ' + tempoPreviewEnd + '% during each tune')
                : (' throughout')}
              . Higher levels use longer, faster warmups.
            </Form.Text>
          </Form.Group>

          <hr className="practice-config-section-divider" />

          <Form.Group className="mb-3 practice-config-filter-field">
            <Form.Label>Practice list</Form.Label>
            {hasPracticeLists ? (
              <Form.Select
                value={practiceListId}
                onChange={function(e) { handlePracticeListChange(e.target.value) }}
                aria-label="Practice list"
              >
                <option value="">All practice lists</option>
                {practiceLists.map(function(list) {
                  const count = practiceListTuneCount(list)
                  const label = list.name + (count ? (' (' + count + ' tune' + (count === 1 ? '' : 's') + ')') : ' (empty)')
                  return (
                    <option key={list.id} value={list.id}>{label}</option>
                  )
                })}
              </Form.Select>
            ) : (
              <Alert variant="info" className="mb-0">
                You do not have any practice lists yet.{' '}
                <Link to="/practice-lists" onClick={props.onHide}>Create a practice list</Link>
                {' '}and add tunes before starting a session.
              </Alert>
            )}
            {hasPracticeLists ? (
              <Form.Text className="text-muted d-block mt-1">
                <Link to="/practice-lists" onClick={props.onHide}>Manage practice lists</Link>
                {practiceListId
                  ? (selectedListTuneCount > 0
                    ? (' · ' + selectedListTuneCount + ' tune' + (selectedListTuneCount === 1 ? '' : 's') + ' in list')
                    : '')
                  : (allListsTuneCount > 0
                    ? (' · ' + allListsTuneCount + ' tune' + (allListsTuneCount === 1 ? '' : 's') + ' across all lists')
                    : '')}
              </Form.Text>
            ) : null}
          </Form.Group>

          {showNoTunesAnywhereWarning ? (
            <Alert variant="warning">
              Your practice lists have no tunes yet.{' '}
              <Link to="/practice-lists" onClick={props.onHide}>
                Add tunes to a practice list
              </Link>
              {' '}before starting.
            </Alert>
          ) : null}

          {showEmptyListWarning ? (
            <Alert variant="warning">
              This practice list has no tunes yet.{' '}
              <Link to={'/practice-lists/' + encodeURIComponent(practiceListId)} onClick={props.onHide}>
                Add tunes to this list
              </Link>
              {' '}before starting.
            </Alert>
          ) : null}

          {showLowCountWarning ? (
            <Alert variant="warning">
              {practiceListId
                ? ('This list only has ' + effectiveTuneCount + ' tune' + (effectiveTuneCount === 1 ? '' : 's') + '.')
                : ('You only have ' + effectiveTuneCount + ' tune' + (effectiveTuneCount === 1 ? '' : 's') + ' across all practice lists.')}
              {' '}Consider adding more to {MIN_RECOMMENDED_PRACTICE_LIST_TUNES}+ for a fuller session.
            </Alert>
          ) : null}

          <hr className="practice-config-section-divider" />

          <Form.Group className="mb-2">
            <Form.Check
              type="switch"
              id="practice-include-warmups"
              label="Include warmups (scales and arpeggios)"
              checked={includeWarmups}
              onChange={function(e) { handleWarmupsChange(e.target.checked) }}
            />
          </Form.Group>

          <Form.Group className="mb-2">
            <Form.Check
              type="switch"
              id="practice-accuracy-checking"
              label="Pitch accuracy checking during warmups (microphone)"
              checked={accuracyCheckingEnabled}
              disabled={!includeWarmups}
              onChange={function(e) { handleAccuracyChange(e.target.checked) }}
            />
          </Form.Group>

          {props.error ? <Alert variant="danger" className="mt-3">{String(props.error)}</Alert> : null}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={props.onHide}>Cancel</Button>
          <Button variant="success" onClick={handleStart} disabled={!canStart}>Start</Button>
        </Modal.Footer>
      </Modal>

      <VocalRangePickerModal
        show={vocalRangeOpen}
        onHide={function() { setVocalRangeOpen(false) }}
        vocalRangeLow={vocalRangeLow}
        vocalRangeHigh={vocalRangeHigh}
        onSave={handleVocalRangeSave}
      />
    </>
  )
}
