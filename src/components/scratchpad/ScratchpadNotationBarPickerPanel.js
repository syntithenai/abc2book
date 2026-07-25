import { useMemo } from 'react'
import { Alert, Form } from 'react-bootstrap'
import { buildAbcFromTune, NotationPreview } from '../SuggestionPreviewDialog'
import ScratchpadNotationVoiceMapPanel from './ScratchpadNotationVoiceMapPanel'
import {
  analyzeMergeNoteMismatches,
  applyScratchpadNotationMerge,
  countVoiceBars,
  defaultEndBarForRange,
  injectAbcBarNumbers,
  maxVoiceBarCount,
} from '../../scratchpadNotationMerge'

function hasNotationPreview(tune) {
  return !!String(buildAbcFromTune(tune) || '').trim()
}

function modeDescription(mode, fromBar, toBar, sourceBarCount) {
  if (mode === 'insert') {
    return 'Insert scratchpad bars at the selected bar. Existing bars from that point shift right.'
  }
  const rangeNote = toBar != null
    ? ' Bars ' + fromBar + '–' + toBar + ' on the tune are affected.'
    : ''
  const sourceNote = toBar != null && sourceBarCount > (toBar - fromBar + 1)
    ? ' Extra scratchpad bars beyond that range are skipped.'
    : ''
  if (mode === 'replace') {
    return 'Replace tune bars with scratchpad notation.' + rangeNote + sourceNote
  }
  return 'Interleave scratchpad notes with existing notes in each bar and keep chord symbols on their slots.' + rangeNote + sourceNote
}

function modeActionLabel(mode) {
  if (mode === 'insert') return 'insert at'
  if (mode === 'replace') return 'replace from'
  return 'merge from'
}

function primarySourceBarCount(sourceTune) {
  if (!sourceTune || !sourceTune.voices) return 0
  const keys = Object.keys(sourceTune.voices)
  if (!keys.length) return 0
  return countVoiceBars(sourceTune.voices[keys[0]].notes, sourceTune)
}

const NOTATION_OPERATIONS = [
  { id: 'merge', label: 'Merge' },
  { id: 'insert', label: 'Insert' },
  { id: 'replace', label: 'Replace' },
]

const PREVIEW_MEASURES_PER_LINE = 4

function formatAffectedBarList(bars) {
  if (!bars || !bars.length) return ''
  if (bars.length === 1) return 'bar ' + bars[0]
  if (bars.length === 2) return 'bars ' + bars[0] + ' and ' + bars[1]
  return 'bars ' + bars.slice(0, -1).join(', ') + ', and ' + bars[bars.length - 1]
}

export default function ScratchpadNotationBarPickerPanel(props) {
  const tune = props.tune
  const sourceTune = props.sourceTune
  const voiceMapping = props.voiceMapping
  const mode = props.mode || 'merge'
  const onModeChange = props.onModeChange
  const onVoiceMappingChange = props.onVoiceMappingChange
  const fromBar = Math.max(1, parseInt(props.fromBar, 10) || 1)
  const toBar = props.toBar == null || props.toBar === '' ? null : Math.max(fromBar, parseInt(props.toBar, 10) || fromBar)
  const onFromBarChange = props.onFromBarChange
  const onToBarChange = props.onToBarChange
  const showEndBar = mode === 'merge' || mode === 'replace'

  const maxBar = useMemo(function() {
    if (!tune || !tune.voices) return 1
    const byKey = {}
    Object.keys(tune.voices).forEach(function(key) {
      byKey[key] = tune.voices[key].notes
    })
    return Math.max(1, maxVoiceBarCount(byKey, tune))
  }, [tune])

  const sourceBarCount = useMemo(function() {
    return primarySourceBarCount(sourceTune)
  }, [sourceTune])

  const mergedTune = useMemo(function() {
    if (!tune || !sourceTune) return null
    return applyScratchpadNotationMerge(tune, sourceTune, {
      mode: mode,
      fromBar: fromBar,
      toBar: toBar,
      voiceMapping: voiceMapping,
    })
  }, [tune, sourceTune, voiceMapping, mode, fromBar, toBar])

  const mergeMismatch = useMemo(function() {
    if (mode !== 'merge' || !tune || !sourceTune) {
      return { affectedBars: [], sourceHighlights: [], unpairedSourceHighlights: [] }
    }
    return analyzeMergeNoteMismatches(tune, sourceTune, {
      mode: mode,
      fromBar: fromBar,
      toBar: toBar,
      voiceMapping: voiceMapping,
    })
  }, [tune, sourceTune, voiceMapping, mode, fromBar, toBar])

  if (!tune || !sourceTune) return null

  const beforeAbc = injectAbcBarNumbers(buildAbcFromTune(tune))
  const afterAbc = injectAbcBarNumbers(buildAbcFromTune(mergedTune))
  const tuneName = tune.name || 'tune'
  const scratchpadTitle = props.sourceTitle || 'scratchpad notation'

  function handleFromBarChange(nextFrom) {
    const next = Math.max(1, parseInt(nextFrom, 10) || 1)
    if (typeof onFromBarChange === 'function') onFromBarChange(next)
    if (showEndBar && sourceBarCount > 0 && typeof onToBarChange === 'function') {
      onToBarChange(defaultEndBarForRange(next, sourceBarCount, maxBar))
    }
  }

  return (
    <div className="scratchpad-notation-bar-picker" data-testid="scratchpad-notation-bar-picker">
      <div className="scratchpad-notation-bar-picker__intro">
        <p className="mb-2">
          Assign <strong>{scratchpadTitle}</strong> to <strong>{tuneName}</strong>.
        </p>
        <p className="text-muted small mb-0">{modeDescription(mode, fromBar, toBar, sourceBarCount)}</p>
      </div>
      <div className="scratchpad-notation-bar-picker__controls">
        <Form.Group controlId="scratchpad-notation-operation">
          <Form.Label>Operation</Form.Label>
          <Form.Select
            size="sm"
            style={{ maxWidth: '12rem' }}
            value={mode}
            aria-label="Notation operation"
            data-testid="scratchpad-notation-operation"
            onChange={function(e) {
              if (typeof onModeChange === 'function') onModeChange(e.target.value)
            }}
          >
            {NOTATION_OPERATIONS.map(function(op) {
              return (
                <option key={op.id} value={op.id}>{op.label}</option>
              )
            })}
          </Form.Select>
        </Form.Group>
        <Form.Group controlId="scratchpad-notation-from-bar">
          <Form.Label>{showEndBar ? 'Start bar' : 'Bar number'}</Form.Label>
          <Form.Select
            size="sm"
            style={{ maxWidth: '8rem' }}
            value={String(fromBar)}
            aria-label="Start bar"
            onChange={function(e) { handleFromBarChange(e.target.value) }}
          >
            {Array.from({ length: maxBar + 1 }, function(_, index) {
              const bar = index + 1
              const suffix = bar > maxBar ? ' (after last bar)' : ''
              return (
                <option key={bar} value={String(bar)}>
                  {bar}{suffix}
                </option>
              )
            })}
          </Form.Select>
        </Form.Group>
        {showEndBar ? (
          <Form.Group controlId="scratchpad-notation-to-bar">
            <Form.Label>End bar</Form.Label>
            <Form.Select
              size="sm"
              style={{ maxWidth: '10rem' }}
              value={toBar == null ? '' : String(toBar)}
              aria-label="End bar"
              data-testid="scratchpad-notation-to-bar"
              onChange={function(e) {
                if (typeof onToBarChange !== 'function') return
                const raw = e.target.value
                if (!raw) {
                  onToBarChange(null)
                  return
                }
                onToBarChange(Math.max(fromBar, parseInt(raw, 10) || fromBar))
              }}
            >
              {Array.from({ length: maxBar - fromBar + 1 }, function(_, index) {
                const bar = fromBar + index
                return (
                  <option key={bar} value={String(bar)}>
                    {bar}
                  </option>
                )
              })}
            </Form.Select>
          </Form.Group>
        ) : null}
        {showEndBar && sourceBarCount > 0 ? (
          <p className="text-muted small mb-0 scratchpad-notation-bar-picker__source-count">
            Scratchpad has <strong>{sourceBarCount}</strong> bar{sourceBarCount === 1 ? '' : 's'}.
            {toBar != null
              ? (' Applying ' + Math.min(sourceBarCount, toBar - fromBar + 1) + ' bar(s) on the tune.')
              : null}
          </p>
        ) : null}
      </div>
      <ScratchpadNotationVoiceMapPanel
        sourceTune={sourceTune}
        targetTune={tune}
        mapping={voiceMapping}
        mode={mode}
        onChange={onVoiceMappingChange}
      />
      {mode === 'merge' && mergeMismatch.affectedBars.length ? (
        <Alert variant="warning" className="mb-3" data-testid="scratchpad-merge-mismatch-warning">
          The tune and scratchpad have different numbers of notes in {formatAffectedBarList(mergeMismatch.affectedBars)}.
          New scratchpad notes are highlighted in green; unpaired scratchpad notes in red.
        </Alert>
      ) : null}
      <div className="scratchpad-notation-bar-picker__previews">
        <div className="scratchpad-notation-bar-picker__pane">
          <div className="small text-muted mb-1">Current (bar numbers shown)</div>
          {hasNotationPreview(tune) ? (
            <NotationPreview
              abc={beforeAbc}
              fitWidth={true}
              wrapToWidth={true}
              maxHeight={null}
              className="scratchpad-notation-preview-wrap"
            />
          ) : (
            <Alert variant="secondary" className="mb-0">No notation on this tune yet.</Alert>
          )}
        </div>
        <div className="scratchpad-notation-bar-picker__pane">
          <div className="small text-muted mb-1">After {mode}</div>
          {hasNotationPreview(mergedTune) ? (
            <NotationPreview
              abc={afterAbc}
              fitWidth={true}
              wrapToWidth={true}
              maxHeight={null}
              className="scratchpad-notation-preview-wrap"
              mergePreviewHighlights={mode === 'merge' ? {
                source: mergeMismatch.sourceHighlights,
                unpairedSource: mergeMismatch.unpairedSourceHighlights,
              } : null}
              highlightTune={mergedTune}
              highlightMeasuresPerLine={PREVIEW_MEASURES_PER_LINE}
            />
          ) : (
            <Alert variant="secondary" className="mb-0">Scratchpad has no notation to apply.</Alert>
          )}
        </div>
      </div>
    </div>
  )
}
