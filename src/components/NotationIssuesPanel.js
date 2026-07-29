import { useMemo, useState } from 'react'
import { Badge, Button, Modal } from 'react-bootstrap'
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

function issueMatchesSeverity(issueItem, severityMode) {
  const severity = issueItem && issueItem.severity ? issueItem.severity : 'error'
  if (severityMode === 'error') return severity === 'error'
  return severity === 'warning' || severity === 'info'
}

function filterGroupsForSeverity(groups, severityMode) {
  return groups.map(function(group) {
    const filteredIssues = group.issues.filter(function(issueItem) {
      return issueMatchesSeverity(issueItem, severityMode)
    })
    if (!filteredIssues.length) return null
    return {
      id: group.id,
      title: group.title,
      issues: filteredIssues,
      actions: group.actions,
    }
  }).filter(Boolean)
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

function SeverityIssuesModal(props) {
  const {
    show,
    onHide,
    title,
    severityMode,
    groups,
    fixingAction,
    onNavigateIssue,
    onApplyFix,
  } = props

  return (
    <Modal show={show} onHide={onHide} size="lg" scrollable className="notation-issues-modal">
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body className="notation-issues-modal-body">
        {groups.map(function(group) {
          return (
            <div key={group.id} className="notation-issues-modal-group">
              <h6 className="notation-issues-modal-group-title">{group.title}</h6>
              <ul className="notation-issues-list">
                {group.issues.map(function(issueItem, index) {
                  return (
                    <li key={group.id + '-' + issueItem.code + '-' + index} className="notation-issues-item">
                      <button
                        type="button"
                        className="notation-issues-item-button"
                        onClick={function() {
                          if (onNavigateIssue) onNavigateIssue(issueItem)
                          onHide()
                        }}
                      >
                        <Badge bg={severityVariant(issueItem.severity)} className="notation-issues-severity">
                          {issueItem.severity || severityMode}
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
                        key={action.id + (action.linkIndex != null ? ':' + action.linkIndex : '')}
                        size="sm"
                        variant="outline-secondary"
                        disabled={fixingAction === action.id}
                        onClick={function() { onApplyFix(action.id) }}
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
      </Modal.Body>
    </Modal>
  )
}

export default function NotationIssuesPanel(props) {
  const tune = props.tune
  const tunebook = props.tunebook
  const issues = props.issues || []
  const checkResults = props.checkResults || {}
  const onNavigateIssue = props.onNavigateIssue
  const onTuneSaved = props.onTuneSaved
  const parseAndRender = props.parseAndRender

  const [activeDialog, setActiveDialog] = useState(null)
  const [previewState, setPreviewState] = useState(null)
  const [fixingAction, setFixingAction] = useState(null)

  const report = useMemo(function() {
    return buildEditorReport(tune, issues, checkResults)
  }, [tune, issues, checkResults])

  const groups = useMemo(function() {
    if (!tune || !issues.length) return []
    return buildBulkCheckIssueGroups(report, tune, tunebook, parseAndRender)
  }, [report, tune, tunebook, parseAndRender, issues.length])

  const errorGroups = useMemo(function() {
    return filterGroupsForSeverity(groups, 'error')
  }, [groups])

  const warningGroups = useMemo(function() {
    return filterGroupsForSeverity(groups, 'warning')
  }, [groups])

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
  const warningCount = issues.filter(function(item) {
    return item.severity === 'warning' || item.severity === 'info'
  }).length

  return (
    <>
      <div className="notation-issues-toolbar">
        <div className="notation-issues-toolbar-block">
          <span className="notation-issues-toolbar-title">Notation checks</span>
          <div className="notation-issues-toolbar-buttons">
            {errorCount > 0 ? (
              <Button
                variant="outline-danger"
                size="sm"
                className="notation-issues-severity-toggle"
                aria-label={'Errors: ' + errorCount}
                onClick={function() { setActiveDialog('error') }}
              >
                <Badge bg="danger" className="notation-issues-badge">{errorCount}</Badge>
                <span className="notation-issues-severity-label">Errors</span>
                <span className="notation-issues-caret" aria-hidden="true">▾</span>
              </Button>
            ) : null}
            {warningCount > 0 ? (
              <Button
                variant="outline-warning"
                size="sm"
                className="notation-issues-severity-toggle"
                aria-label={'Warnings: ' + warningCount}
                onClick={function() { setActiveDialog('warning') }}
              >
                <Badge bg="warning" text="dark" className="notation-issues-badge">{warningCount}</Badge>
                <span className="notation-issues-severity-label">Warnings</span>
                <span className="notation-issues-caret" aria-hidden="true">▾</span>
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <SeverityIssuesModal
        show={activeDialog === 'error'}
        onHide={function() { setActiveDialog(null) }}
        title="Notation errors"
        severityMode="error"
        groups={errorGroups}
        fixingAction={fixingAction}
        onNavigateIssue={onNavigateIssue}
        onApplyFix={applyFix}
      />
      <SeverityIssuesModal
        show={activeDialog === 'warning'}
        onHide={function() { setActiveDialog(null) }}
        title="Notation warnings"
        severityMode="warning"
        groups={warningGroups}
        fixingAction={fixingAction}
        onNavigateIssue={onNavigateIssue}
        onApplyFix={applyFix}
      />

      <BulkCheckFixPreviewModal
        show={!!previewState}
        onHide={function() { setPreviewState(null) }}
        preview={previewState && previewState.preview}
        fieldDiffs={previewState && previewState.fieldDiffs}
        actionLabel={previewState && previewState.actionLabel}
        onConfirm={applyPreview}
      />
    </>
  )
}
