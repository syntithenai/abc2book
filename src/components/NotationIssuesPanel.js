import { useMemo, useState, useEffect } from 'react'
import { Badge, Button, Modal } from 'react-bootstrap'
import { toast } from 'react-toastify'
import { buildBulkCheckIssueGroups } from '../bulkCheckIssueGroups'
import { FIX_ALL_PREVIEW_ACTIONS } from '../bulkCheckFixAll'
import BulkCheckFixPreviewModal from './BulkCheckFixPreviewModal'
import { previewStructureFix, STRUCTURE_FIX_ACTIONS } from '../tuneAbcStructureFix'
import { diffTuneFields } from '../bulkCheckIssueGroups'
import { runBulkCheckFixAction } from '../bulkCheckFixActions'

function formatIssueCopyLine(issueItem, groupTitle) {
  const severity = issueItem && issueItem.severity ? issueItem.severity : 'warning'
  const code = issueItem && issueItem.code ? issueItem.code : 'unknown'
  const message = issueItem && issueItem.message ? issueItem.message : ''
  const field = issueItem && issueItem.field ? issueItem.field : null
  const parts = []
  if (groupTitle) parts.push('[' + groupTitle + ']')
  parts.push(code + ' (' + severity + '): ' + message)
  if (field) parts.push('field=' + field)
  return parts.join(' ')
}

function formatIssuesCopyText(tune, groups, abcText) {
  const lines = []
  const tuneName = tune && tune.name ? tune.name : 'Untitled tune'
  const tuneId = tune && tune.id ? tune.id : null
  lines.push('Tune: ' + tuneName + (tuneId ? ' (id: ' + tuneId + ')' : ''))
  lines.push('')
  lines.push('Issues:')
  groups.forEach(function(group) {
    group.issues.forEach(function(issueItem) {
      lines.push(formatIssueCopyLine(issueItem, group.title))
    })
  })
  if (abcText) {
    lines.push('')
    lines.push('ABC:')
    lines.push(abcText)
  }
  return lines.join('\n')
}

async function copyTextToClipboard(text) {
  if (!text) return false
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
    return true
  } catch (err) {
    toast.warning('Could not copy to clipboard')
    return false
  }
}

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
    extendedResult: checkResults && checkResults.extendedResult,
  }
}

function readinessGroup(id, title, issues) {
  if (!issues || !issues.length) return null
  return {
    id: id,
    title: title,
    issues: issues,
    actions: [],
  }
}

function IssuesModal(props) {
  const {
    show,
    onHide,
    title,
    groups,
    fixingAction,
    onNavigateIssue,
    onApplyFix,
    onCopyReport,
    copyIcon,
  } = props

  return (
    <Modal show={show} onHide={onHide} size="lg" scrollable className="notation-issues-modal">
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body className={'notation-issues-modal-body' + (onCopyReport ? ' notation-issues-modal-body-has-copy' : '')}>
        {onCopyReport ? (
          <Button
            type="button"
            size="sm"
            variant="outline-secondary"
            className="notation-issues-copy-btn"
            title="Copy issues and ABC"
            aria-label="Copy issues and ABC"
            onClick={onCopyReport}
          >
            {copyIcon || '⧉'}
          </Button>
        ) : null}
        {groups.length === 0 ? (
          <p className="text-muted mb-0">No notation issues found.</p>
        ) : null}
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
                          {issueItem.severity || 'issue'}
                        </Badge>
                        <span>{issueItem.message}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
              {group.actions && group.actions.length > 0 ? (
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
  const completenessIssues = checkResults.completenessIssues || []
  const metadataIssues = checkResults.metadataIssues || []
  const onNavigateIssue = props.onNavigateIssue
  const onTuneSaved = props.onTuneSaved
  const parseAndRender = props.parseAndRender
  const initialOpenDialog = props.initialOpenDialog
  const inline = !!props.inline

  const [dialogOpen, setDialogOpen] = useState(false)
  const [previewState, setPreviewState] = useState(null)
  const [fixingAction, setFixingAction] = useState(null)

  const report = useMemo(function() {
    return buildEditorReport(tune, issues, checkResults)
  }, [tune, issues, checkResults])

  const notationGroups = useMemo(function() {
    if (!tune || !issues.length) return []
    return buildBulkCheckIssueGroups(report, tune, tunebook, parseAndRender)
  }, [report, tune, tunebook, parseAndRender, issues.length])

  const groups = useMemo(function() {
    const next = notationGroups.slice()
    const completeness = readinessGroup('completeness', 'Completeness', completenessIssues)
    const metadata = readinessGroup('metadata', 'Metadata', metadataIssues)
    if (completeness) next.push(completeness)
    if (metadata) next.push(metadata)
    return next
  }, [notationGroups, completenessIssues, metadataIssues])

  const allIssues = useMemo(function() {
    return issues.concat(completenessIssues, metadataIssues)
  }, [issues, completenessIssues, metadataIssues])

  const errorCount = allIssues.filter(function(item) { return item.severity === 'error' }).length
  const warningCount = allIssues.filter(function(item) {
    return item.severity === 'warning' || item.severity === 'info' || !item.severity
  }).length
  const totalCount = allIssues.length

  useEffect(function() {
    if (!initialOpenDialog || !totalCount) return
    setDialogOpen(true)
  }, [initialOpenDialog, totalCount])

  if (!totalCount) return null

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

  function tuneAbcText() {
    const abcTools = tunebook && tunebook.abcTools
    if (!abcTools || typeof abcTools.json2abc !== 'function' || !tune) return ''
    return abcTools.json2abc(tune) || ''
  }

  async function copyIssuesReport() {
    const text = formatIssuesCopyText(tune, groups, tuneAbcText())
    await copyTextToClipboard(text)
  }

  const copyIcon = (tunebook && tunebook.icons && tunebook.icons.filecopyline) || '⧉'
  const toggleLabel = errorCount > 0 ? 'Errors' : 'Warnings'
  const toggleVariant = errorCount > 0 ? 'outline-danger' : 'outline-warning'
  const ariaParts = []
  if (errorCount > 0) ariaParts.push('Errors: ' + errorCount)
  if (warningCount > 0) ariaParts.push('Warnings: ' + warningCount)

  const issuesToggle = (
    <Button
      variant={toggleVariant}
      size={inline ? 'lg' : 'sm'}
      className="notation-issues-severity-toggle"
      aria-label={ariaParts.join(', ')}
      onClick={function() { setDialogOpen(true) }}
    >
      <span className="notation-issues-badges">
        {errorCount > 0 ? (
          <Badge bg="danger" className="notation-issues-badge">{errorCount}</Badge>
        ) : null}
        {warningCount > 0 ? (
          <Badge bg="warning" text="dark" className="notation-issues-badge">{warningCount}</Badge>
        ) : null}
      </span>
      <span className="notation-issues-severity-label">{toggleLabel}</span>
      <span className="notation-issues-caret" aria-hidden="true">▾</span>
    </Button>
  )

  return (
    <>
      {inline ? (
        <div className="notation-issues-inline">
          {issuesToggle}
        </div>
      ) : (
        <div className="notation-issues-toolbar">
          <div className="notation-issues-toolbar-block">
            <span className="notation-issues-toolbar-title">Notation checks</span>
            <div className="notation-issues-toolbar-buttons">
              {issuesToggle}
            </div>
          </div>
        </div>
      )}

      <IssuesModal
        show={dialogOpen}
        onHide={function() { setDialogOpen(false) }}
        title="Notation checks"
        groups={groups}
        fixingAction={fixingAction}
        onNavigateIssue={onNavigateIssue}
        onApplyFix={applyFix}
        onCopyReport={copyIssuesReport}
        copyIcon={copyIcon}
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
