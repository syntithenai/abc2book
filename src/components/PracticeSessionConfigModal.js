import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, Modal, Form, ButtonGroup, Alert } from 'react-bootstrap'
import BookSelectorModal from './BookSelectorModal'
import TagsSearchSelectorModal from './TagsSearchSelectorModal'
import VocalRangePickerModal from './VocalRangePickerModal'
import { useResponsiveModalProps } from '../useResponsiveModalProps'
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
  const [bookFilter, setBookFilter] = useState('')
  const [tagFilter, setTagFilter] = useState([])
  const [includeWarmups, setIncludeWarmups] = useState(true)
  const [skillLevel, setSkillLevel] = useState(5)
  const [accuracyCheckingEnabled, setAccuracyCheckingEnabled] = useState(false)
  const [vocalRangeLow, setVocalRangeLow] = useState('')
  const [vocalRangeHigh, setVocalRangeHigh] = useState('')
  const [vocalRangeOpen, setVocalRangeOpen] = useState(false)

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
      setBookFilter('')
      setTagFilter([])

      const minutes = searchParams.get('minutes')
      if (minutes) setTotalMinutes(parseInt(minutes, 10))

      const instrumentParam = searchParams.get('instrument')
      if (instrumentParam) setInstrument(normalizePracticeInstrument(instrumentParam))

      const skill = searchParams.get('skill')
      if (skill) setSkillLevel(parseInt(skill, 10))

      const warmups = searchParams.get('warmups')
      if (warmups != null) setIncludeWarmups(warmups !== '0' && warmups !== 'false')

      const book = searchParams.get('book')
      if (book) setBookFilter(book)

      const tags = searchParams.get('tags')
      if (tags) {
        setTagFilter(tags.split(',').map(function(t) { return t.trim() }).filter(Boolean))
      }
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

  const tempoPreview = getSkillTempoRange(skillLevel)
  const tempoPreviewStart = Math.round(tempoPreview.tempoStart * 100)
  const tempoPreviewEnd = Math.round(tempoPreview.tempoEnd * 100)
  const resolvedVocal = resolveVocalRange(vocalRangeLow, vocalRangeHigh)

  function handleStart() {
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
    })
    if (props.onStart) {
      props.onStart({
        instrument,
        recentInstruments,
        totalMinutes,
        bookFilter,
        tagFilter,
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

          <div className="practice-config-filters-row mb-3">
            <Form.Group className="practice-config-filter-field mb-0">
              <Form.Label>Book filter</Form.Label>
              <div>
                <BookSelectorModal
                  title="Filter by book"
                  currentTuneBook={bookFilter}
                  tunebook={props.tunebook}
                  forceRefresh={props.forceRefresh}
                  onChange={function(val) { setBookFilter(val || '') }}
                  defaultOptions={props.tunebook.getTuneBookOptions}
                  searchOptions={props.tunebook.getSearchTuneBookOptions}
                  triggerElement={
                    <Button variant="outline-secondary">
                      {props.tunebook.icons.book} {bookFilter || 'Any book'}
                    </Button>
                  }
                />
                {bookFilter ? (
                  <Button className="ms-2" variant="link" onClick={function() { setBookFilter('') }}>Clear</Button>
                ) : null}
              </div>
            </Form.Group>

            <Form.Group className="practice-config-filter-field mb-0">
              <Form.Label>Tag filter</Form.Label>
              <div>
                <TagsSearchSelectorModal
                  title="Filter by tags"
                  value={tagFilter}
                  tunebook={props.tunebook}
                  onChange={function(val) { setTagFilter(val || []) }}
                  defaultOptions={props.tunebook.getTuneTagOptions}
                  searchOptions={props.tunebook.getSearchTuneTagOptions}
                  triggerElement={
                    <Button variant="outline-secondary">
                      {props.tunebook.icons.tag} {tagFilter.length > 0 ? tagFilter.join(', ') : 'Any tags'}
                    </Button>
                  }
                />
                {tagFilter.length > 0 ? (
                  <Button className="ms-2" variant="link" onClick={function() { setTagFilter([]) }}>Clear</Button>
                ) : null}
              </div>
            </Form.Group>
          </div>

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
          <Button variant="success" onClick={handleStart}>Start</Button>
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
