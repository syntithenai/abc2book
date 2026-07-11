import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, Modal, Form, ButtonGroup, Alert } from 'react-bootstrap'
import BookSelectorModal from './BookSelectorModal'
import TagsSearchSelectorModal from './TagsSearchSelectorModal'
import { useResponsiveModalProps } from '../useResponsiveModalProps'
import {
  DURATION_OPTIONS,
  PRACTICE_INSTRUMENTS,
  loadPracticeSettings,
  mergePracticeSettings,
  getSkillTempoRange,
  normalizePracticeInstrument,
} from '../practiceSessionSettings'
import '../PracticeSessionConfigModal.css'

export default function PracticeSessionConfigModal(props) {
  const responsiveModalProps = useResponsiveModalProps()
  const [searchParams] = useSearchParams()
  const [instrument, setInstrument] = useState('mandolin')
  const [totalMinutes, setTotalMinutes] = useState(10)
  const [bookFilter, setBookFilter] = useState('')
  const [tagFilter, setTagFilter] = useState([])
  const [includeWarmups, setIncludeWarmups] = useState(true)
  const [skillLevel, setSkillLevel] = useState(5)
  const [accuracyCheckingEnabled, setAccuracyCheckingEnabled] = useState(false)
  const [headphoneMode, setHeadphoneMode] = useState(false)

  useEffect(function() {
    if (props.show) {
      const saved = loadPracticeSettings()
      setInstrument(saved.instrument)
      setTotalMinutes(saved.totalMinutes)
      setIncludeWarmups(saved.includeWarmups)
      setSkillLevel(saved.skillLevel)
      setAccuracyCheckingEnabled(saved.accuracyCheckingEnabled === true)
      setHeadphoneMode(saved.headphoneMode === true)
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
      totalMinutes: next.totalMinutes != null ? next.totalMinutes : totalMinutes,
      includeWarmups: next.includeWarmups != null ? next.includeWarmups : includeWarmups,
      skillLevel: next.skillLevel != null ? next.skillLevel : skillLevel,
      accuracyCheckingEnabled: next.accuracyCheckingEnabled != null
        ? next.accuracyCheckingEnabled
        : accuracyCheckingEnabled,
      headphoneMode: next.headphoneMode != null ? next.headphoneMode : headphoneMode,
    })
  }

  function handleInstrumentChange(nextInstrument) {
    setInstrument(nextInstrument)
    persistSettings({ instrument: nextInstrument })
  }

  function handleDurationChange(minutes) {
    setTotalMinutes(minutes)
    persistSettings({ totalMinutes: minutes })
  }

  function handleWarmupsChange(checked) {
    setIncludeWarmups(checked)
    persistSettings({ includeWarmups: checked })
  }

  function handleSkillChange(level) {
    setSkillLevel(level)
    persistSettings({ skillLevel: level })
  }

  function handleAccuracyChange(checked) {
    setAccuracyCheckingEnabled(checked)
    persistSettings({ accuracyCheckingEnabled: checked })
  }

  function handleHeadphoneModeChange(checked) {
    setHeadphoneMode(checked)
    persistSettings({ headphoneMode: checked })
  }

  const tempoPreview = getSkillTempoRange(skillLevel)
  const tempoPreviewStart = Math.round(tempoPreview.tempoStart * 100)
  const tempoPreviewEnd = Math.round(tempoPreview.tempoEnd * 100)

  function handleStart() {
    mergePracticeSettings({
      instrument,
      totalMinutes,
      includeWarmups,
      skillLevel,
      accuracyCheckingEnabled,
      headphoneMode,
    })
    if (props.onStart) {
      props.onStart({
        instrument,
        totalMinutes,
        bookFilter,
        tagFilter,
        includeWarmups,
        skillLevel,
        accuracyCheckingEnabled,
        headphoneMode,
      })
    }
  }

  return (
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
        <Form.Group className="mb-4">
          <Form.Label>Instrument</Form.Label>
          <Form.Select
            value={instrument}
            onChange={function(e) { handleInstrumentChange(e.target.value) }}
          >
            {PRACTICE_INSTRUMENTS.map(function(item) {
              return (
                <option key={item.id} value={item.id}>{item.label}</option>
              )
            })}
          </Form.Select>
        </Form.Group>

        <Form.Group className="mb-4">
          <Form.Label>Duration</Form.Label>
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
        </Form.Group>

        <Form.Group className="mb-4">
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

        <div className="practice-config-filters-row mb-3">
          <Form.Group className="practice-config-filter-field mb-0">
            <Form.Label>Book filter (optional)</Form.Label>
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
            <Form.Label>Tag filter (optional)</Form.Label>
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

        <Form.Group className="mb-2">
          <Form.Check
            type="switch"
            id="practice-accuracy-checking"
            label="Pitch accuracy checking during warmups (microphone)"
            checked={accuracyCheckingEnabled}
            onChange={function(e) { handleAccuracyChange(e.target.checked) }}
          />
          <Form.Text className="text-muted">
            Live cents feedback and per-rep pitch summary. Reference notes play quietly unless headphone mode is on.
          </Form.Text>
        </Form.Group>

        {accuracyCheckingEnabled ? (
          <Form.Group className="mb-2 ms-3">
            <Form.Check
              type="switch"
              id="practice-headphone-mode"
              label="Headphone mode (full-volume reference playback)"
              checked={headphoneMode}
              onChange={function(e) { handleHeadphoneModeChange(e.target.checked) }}
            />
          </Form.Group>
        ) : null}

        <Form.Group className="mb-2">
          <Form.Check
            type="switch"
            id="practice-include-warmups"
            label="Include warmups (scales and arpeggios)"
            checked={includeWarmups}
            onChange={function(e) { handleWarmupsChange(e.target.checked) }}
          />
        </Form.Group>

        {props.error ? <Alert variant="danger" className="mt-3">{String(props.error)}</Alert> : null}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={props.onHide}>Cancel</Button>
        <Button variant="success" onClick={handleStart}>Start</Button>
      </Modal.Footer>
    </Modal>
  )
}
