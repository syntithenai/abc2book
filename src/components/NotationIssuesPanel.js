import { useMemo, useState } from 'react'
import { Badge, Button, Collapse } from 'react-bootstrap'
import { buildBulkCheckIssueGroups } from '../bulkCheckIssueGroups'
import { FIX_ALL_PREVIEW_ACTIONS } from '../bulkCheckFixAll'
import BulkCheckFixPreviewModal from './BulkCheckFixPreviewModal'
import { previewStructureFix, STRUCTURE_FIX_ACTIONS } from '../tuneAbcStructureFix'
import { diffTuneFields } from '../bulkCheckIssueGroups'
import { runBulkCheckFixAction } from '../bulkCheckFixActions'

function severityVariant(severity) {
  if (severity === 'error') return 'danger'
  if (severity === 'warning') return 'warning'
  return 'info'
}

function buildEditorReport(tune, issues, checkResults) {
  return {
    tuneId: tune && tune.id,
    issues: issues || [],
    abcResult: checkResults && checkResults.abcResult,
    structureResult: checkResults && checkResults.structureResult,
    lyricsResult: checkResults && checkResults.lyricsResult,
  }
}

export default function NotationIssuesPanel(props) {
  const tune = props.tune
  const tunebook = props.tunebook
  const issues = props.issues || []
  const checkResults = props.checkResults || {}
  const onNavigateIssue = props.onNavigateIssue
  const onTuneSaved = props.onTuneSaved
  const parseAndRender = props.parseAndRender

  const [open, setOpen] = useState(true)
  const [previewState, setPreviewState] = useState(null)
  const [fixingAction, setFixingAction] = useState(null)

  const report = useMemo(function() {
    return buildEditorReport(tune, issues, checkResults)
  }, [tune, issues, checkResults])

  const groups = useMemo(function() {
    if (!tune || !issues.length) return []
    return buildBulkCheckIssueGroups(report, tune, tunebook, parseAndRender)
  }, [report, tune, tunebook, parseAndRender, issues.length])

  if (!issues.length) return null

  async function applyFix(actionId) {
    if (!tune || !tunebook) return
    const abcTools = tunebook.abcTools
    if (FIX_ALL_PREVIEW_ACTIONS.has(actionId) || actionId === 'relayoutNoteLines') {
      const preview = previewStructureFix(actionId, tune, abcTools, parseAndRender)
      if (!preview) return
      setPreviewState({
        actionId: actionId,
        preview: preview,
        fieldDiffs: diffTuneFields(tune, preview.tune, abcTools),
        actionLabel: (STRUCTURE_FIX_ACTIONS.find(function(item) { return item.id === actionId; }) || {}).label || actionId,
      })
      return
    }
    setFixingAction(actionId)
    try {
      const next = await runBulkCheckFixAction(actionId, {
        tune: tune,
        tunebook: tunebook,
        parseAndRender: parseAndRender,
      })
      if (next && onTuneSaved) onTuneSaved(next)
    } finally {
      setFixingAction(null)
    }
  }

  async function applyPreview() {
    if (!previewState || !tune || !tunebook) return
    const next = await runBulkCheckFixAction(previewState.actionId, {
      tune: tune,
      tunebook: tunebook,
      parseAndRender: parseAndRender,
    })
    setPreviewState(null)
    if (next && onTuneSaved) onTuneSaved(next)
  }

  const errorCount = issues.filter(function(item) { return item.severity === 'error' }).length
  const warningCount = issues.filter(function(item) { return item.severity === 'warning' }).length

  return (
    <div className="notation-issues-panel">
      <button
        type="button"
        className="notation-issues-panel-toggle"
        aria-expanded={open}
        onClick={function() { setOpen(function(value) { return !value }) }}
      >
        <span className="notation-issues-panel-title">Notation checks</span>
        {errorCount > 0 ? (
          <Badge bg="danger" className="notation-issues-badge">{errorCount}</Badge>
        ) : null}
        {warningCount > 0 ? (
          <Badge bg="warning" text="dark" className="notation-issues-badge">{warningCount}</Badge>
        ) : null}
        <span className="notation-issues-panel-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>

      <Collapse in={open}>
        <div className="notation-issues-panel-body">
          {groups.map(function(group) {
            return (
              <div key={group.id} className="notation-issues-group">
                <div className="notation-issues-group-title">{group.title}</div>
                <ul className="notation-issues-list">
                  {group.issues.map(function(issueItem, index) {
                    return (
                      <li key={group.id + '-' + issueItem.code + '-' + index} className="notation-issues-item">
                        <button
                          type="button"
                          className="notation-issues-item-button"
                          onClick={function() {
                            if (onNavigateIssue) onNavigateIssue(issueItem)
                          }}
                        >
                          <Badge bg={severityVariant(issueItem.severity)} className="notation-issues-severity">
                            {issueItem.severity}
                          </Badge>
                          <span>{issueItem.message}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
                {group.actions.length > 0 ? (
                  <div className="notation-issues-actions">
                    {group.actions.map(function(action) {
                      return (
                        <Button
                          key={action.id}
                          size="sm"
                          variant="outline-secondary"
                          disabled={fixingAction === action.id}
                          onClick={function() { applyFix(action.id) }}
                        >
                          {fixingAction === action.id ? 'Fixing…' : action.label}
                        </Button>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </Collapse>

      <BulkCheckFixPreviewModal
        show={!!previewState}
        onHide={function() { setPreviewState(null) }}
        preview={previewState && previewState.preview}
        fieldDiffs={previewState && previewState.fieldDiffs}
        actionLabel={previewState && previewState.actionLabel}
        onConfirm={applyPreview}
      />
    </div>
  )
}
