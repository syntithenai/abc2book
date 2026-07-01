import { useEffect, useState } from 'react'
import { Button, Modal, Form, ButtonGroup, Alert } from 'react-bootstrap'
import BookSelectorModal from './BookSelectorModal'
import TagsSearchSelectorModal from './TagsSearchSelectorModal'
import { useResponsiveModalProps } from '../useResponsiveModalProps'
import {
  DURATION_OPTIONS,
  loadPracticeSettings,
  savePracticeSettings,
  getSkillTempoRange,
} from '../practiceSessionSettings'

export default function PracticeSessionConfigModal(props) {
  const responsiveModalProps = useResponsiveModalProps()
  const [totalMinutes, setTotalMinutes] = useState(10)
  const [bookFilter, setBookFilter] = useState('')
  const [tagFilter, setTagFilter] = useState([])
  const [includeWarmups, setIncludeWarmups] = useState(true)
  const [skillLevel, setSkillLevel] = useState(5)

  useEffect(function() {
    if (props.show) {
      const saved = loadPracticeSettings()
      setTotalMinutes(saved.totalMinutes)
      setIncludeWarmups(saved.includeWarmups)
      setSkillLevel(saved.skillLevel)
      setBookFilter('')
      setTagFilter([])
    }
  }, [props.show])

  useEffect(function() {
    if (props.setBlockKeyboardShortcuts) {
      props.setBlockKeyboardShortcuts(!!props.show)
    }
    return function() {
      if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(false)
    }
  }, [props.show, props.setBlockKeyboardShortcuts])

  function persistSettings(next) {
    savePracticeSettings({
      totalMinutes: next.totalMinutes != null ? next.totalMinutes : totalMinutes,
      includeWarmups: next.includeWarmups != null ? next.includeWarmups : includeWarmups,
      skillLevel: next.skillLevel != null ? next.skillLevel : skillLevel,
    })
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

  const tempoPreview = getSkillTempoRange(skillLevel)
  const tempoPreviewStart = Math.round(tempoPreview.tempoStart * 100)
  const tempoPreviewEnd = Math.round(tempoPreview.tempoEnd * 100)

  function handleStart() {
    savePracticeSettings({ totalMinutes, includeWarmups, skillLevel })
    if (props.onStart) {
      props.onStart({
        totalMinutes,
        bookFilter,
        tagFilter,
        includeWarmups,
        skillLevel,
      })
    }
  }

  return (
    <Modal show={!!props.show} onHide={props.onHide} {...responsiveModalProps}>
      <Modal.Header closeButton>
        <Modal.Title>Practice session</Modal.Title>
      </Modal.Header>
      <Modal.Body>
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

        <Form.Group className="mb-3">
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

        <Form.Group className="mb-3">
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
