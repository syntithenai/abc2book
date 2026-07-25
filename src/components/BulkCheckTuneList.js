import { useMemo } from 'react'
import { Button } from 'react-bootstrap'
import { SEVERITY_BLUE, SEVERITY_GREEN, SEVERITY_ORANGE, SEVERITY_RED, collectReportIssuesForFixes } from '../tuneBulkCheckReport'
import { buildBulkCheckIssueGroups, canRunFixAll } from '../bulkCheckIssueGroups'
import { formatBulkCheckIssueMessage } from '../bulkCheckIssueMessages'
import { isBulkCheckResolverGatedAction, isBulkCheckSearchAction } from '../bulkCheckSearchAccess'
import useBulkCheckFixRunner from '../useBulkCheckFixRunner'
import useAbcjsParser from '../useAbcjsParser'
import BulkCheckFixPreviewModal from './BulkCheckFixPreviewModal'
import SearchProgressBar from './SearchProgressBar'
import { useBulkCheckSearchJobRefresh, useBulkCheckSearchJobStatus } from '../useBulkCheckSearchJobStatus'
import { useBulkCheckSearchActionAccess } from '../useBulkCheckSearchAccess'

const SEVERITY_CLASS = {
  [SEVERITY_RED]: 'bulk-check-item--red',
  [SEVERITY_ORANGE]: 'bulk-check-item--orange',
  [SEVERITY_BLUE]: 'bulk-check-item--blue',
  [SEVERITY_GREEN]: 'bulk-check-item--green',
}

function BulkCheckSearchActionButton(props) {
  const action = props.action
  const access = useBulkCheckSearchActionAccess(
    action.id,
    props.tune,
    props.tunebook,
    props.token && props.token.access_token ? props.token.access_token : props.token
  )
  const jobStatus = useBulkCheckSearchJobStatus(props.tuneId, action.id)
  const showProgress = !!(jobStatus && (jobStatus.busy || jobStatus.percent > 0))
  const externalLinkIcon = props.tunebook && props.tunebook.icons ? props.tunebook.icons.externallink : null
  const label = showProgress && jobStatus.busy ? 'Searching…' : action.label
  const searchDisabled = props.disabled || !access || access.searchDisabled

  if (access && access.showExternalOnly && access.externalUrl) {
    return (
      <Button
        as="a"
        href={access.externalUrl}
        target="_blank"
        rel="noreferrer"
        variant="outline-primary"
        size="sm"
        title={action.label}
      >
        {externalLinkIcon ? <span className="bulk-check-external-link-icon">{externalLinkIcon}</span> : null}
        {action.label}
      </Button>
    )
  }

  return (
    <div className="bulk-check-action-button">
      <Button
        variant="outline-primary"
        size="sm"
        disabled={searchDisabled || (jobStatus && jobStatus.busy)}
        onClick={props.onClick}
        title={access && access.needsLogin && access.loginWarning ? access.loginWarning.message : undefined}
      >
        {label}
      </Button>
      {access && access.externalUrl && access.needsLogin ? (
        <Button
          as="a"
          href={access.externalUrl}
          target="_blank"
          rel="noreferrer"
          variant="outline-secondary"
          size="sm"
          className="bulk-check-external-fallback-btn"
          title={'Open web search for ' + action.label.toLowerCase()}
        >
          {externalLinkIcon ? <span className="bulk-check-external-link-icon">{externalLinkIcon}</span> : null}
          Web
        </Button>
      ) : null}
      {showProgress ? (
        <SearchProgressBar
          visible={true}
          message={jobStatus.message}
          percent={jobStatus.percent}
        />
      ) : null}
    </div>
  )
}

function BulkCheckIssueGroup(props) {
  const group = props.group
  const fixRunner = props.fixRunner
  const isDisabled = fixRunner.isDisabled
  const tuneId = props.tuneId
  const tune = props.tune

  if (!group || (group.issues.length === 0 && group.actions.length === 0)) {
    return null
  }

  return (
    <div className="bulk-check-item-group">
      <div className="bulk-check-item-group-header">
        <h6 className="bulk-check-item-group-title">{group.title}</h6>
        {group.actions.length > 0 ? (
          <div className="bulk-check-item-group-actions">
            {group.actions.map(function(action) {
              if (isBulkCheckSearchAction(action.id)) {
                return (
                  <BulkCheckSearchActionButton
                    key={action.id + (action.linkIndex != null ? '-' + action.linkIndex : '')}
                    action={action}
                    tuneId={tuneId}
                    tune={props.tune}
                    tunebook={props.tunebook}
                    token={props.token}
                    disabled={isDisabled}
                    onClick={function() { fixRunner.runAction(action) }}
                  />
                )
              }
              if (action.id === 'scanLinkRegion') {
                const access = props.getSearchAccess
                  ? props.getSearchAccess(action.id, props.tune)
                  : null
                const resolverDisabled = !access || !access.canRunAutomatic
                return (
                  <Button
                    key={action.id + (action.linkIndex != null ? '-' + action.linkIndex : '')}
                    variant="outline-primary"
                    size="sm"
                    disabled={isDisabled || resolverDisabled}
                    title={access && access.unavailableReason ? access.unavailableReason : undefined}
                    onClick={function() { fixRunner.runAction(action) }}
                  >
                    {action.label}
                  </Button>
                )
              }
              return (
                <Button
                  key={action.id + (action.linkIndex != null ? '-' + action.linkIndex : '')}
                  variant="outline-primary"
                  size="sm"
                  disabled={isDisabled}
                  onClick={function() { fixRunner.runAction(action) }}
                >
                  {action.label}
                </Button>
              )
            })}
          </div>
        ) : null}
      </div>
      {group.issues.length > 0 ? (
        <ul className="bulk-check-item-issues bulk-check-item-group-issues">
          {group.issues.map(function(issueItem, index) {
            return (
                <li key={group.id + '-' + issueItem.code + '-' + index}>
                  {formatBulkCheckIssueMessage(issueItem)}
                </li>
            )
          })}
        </ul>
      ) : null}
      {group.issues.length > 0 && group.actions.length === 0 && group.id !== 'links' ? (
        <p className="bulk-check-item-group-hint text-muted">No automatic fix — use Edit tune.</p>
      ) : null}
    </div>
  )
}

function BulkCheckReportCard(props) {
  const report = props.report
  const isIgnored = !!props.ignoredTuneIds[report.tuneId]
  const severityClass = isIgnored ? 'bulk-check-item--ignored' : (SEVERITY_CLASS[report.severity] || '')
  const tune = props.tunesById
    ? (props.tunesById[report.tuneId] || props.tunesById[String(report.tuneId)])
    : null
  const abcjsParser = useAbcjsParser({ tunebook: props.tunebook })

  const parseAndRender = useMemo(function() {
    return function(abc) {
      const parsed = abcjsParser.parse(abc)
      return abcjsParser.render(parsed, abc)
    }
  }, [abcjsParser])

  const fixIssues = useMemo(function() {
    return collectReportIssuesForFixes(report)
  }, [report])

  const fixRunner = useBulkCheckFixRunner({
    tune: tune,
    tunebook: props.tunebook,
    token: props.token,
    issues: fixIssues,
    report: report,
    busy: props.fixBusyTuneId === report.tuneId,
    onEditTune: props.onEditTune,
    onIgnoreTune: props.onIgnoreTune,
    onFixComplete: function(updatedTune) { props.onRecheckTune(report.tuneId, updatedTune) },
    forceRefresh: props.forceRefresh,
    getSearchAccess: props.getSearchAccess,
  })

  useBulkCheckSearchJobRefresh(report.tuneId, function() {
    props.onRecheckTune(report.tuneId, null)
  })

  const issueGroups = useMemo(function() {
    return buildBulkCheckIssueGroups(report, tune, props.tunebook, parseAndRender)
  }, [report, tune, props.tunebook, parseAndRender])

  const showFixAll = useMemo(function() {
    return canRunFixAll(tune, report, props.tunebook, parseAndRender)
  }, [tune, report, props.tunebook, parseAndRender])

  return (
    <div className={'bulk-check-item ' + severityClass}>
      <div className="bulk-check-item-header">
        <div className="bulk-check-item-title">
          <strong>{report.tuneName}</strong>
          {report.composer ? <span className="bulk-check-item-artist"> — {report.composer}</span> : null}
          {isIgnored ? <span className="bulk-check-item-ignored-label">Ignored</span> : null}
        </div>
        <div className="bulk-check-item-actions">
          {showFixAll ? (
            <Button
              variant="outline-primary"
              size="sm"
              disabled={fixRunner.isDisabled}
              onClick={function() { fixRunner.runAction('searchAll') }}
            >
              {fixRunner.busy ? 'Fixing…' : 'Fix all'}
            </Button>
          ) : null}
          <Button variant="primary" size="sm" onClick={function() { props.onEditTune(report.tuneId) }}>
            Edit tune
          </Button>
          {isIgnored ? (
            <Button variant="outline-secondary" size="sm" onClick={function() { props.onUnignoreTune(report.tuneId) }}>
              Unignore
            </Button>
          ) : (
            <Button variant="outline-secondary" size="sm" onClick={function() { props.onIgnoreTune(report.tuneId) }}>
              Ignore
            </Button>
          )}
        </div>
      </div>

      {issueGroups.map(function(group) {
        return (
          <BulkCheckIssueGroup
            key={group.id}
            group={group}
            fixRunner={fixRunner}
            tuneId={report.tuneId}
            tune={tune}
            tunebook={props.tunebook}
            token={props.token}
            getSearchAccess={props.getSearchAccess}
          />
        )
      })}

      {report.severity === SEVERITY_GREEN && !isIgnored && issueGroups.length === 0 ? (
        <p className="bulk-check-item-ok">All checks passed.</p>
      ) : null}

      <BulkCheckFixPreviewModal
        show={!!fixRunner.previewState}
        onHide={fixRunner.clearPreview}
        onConfirm={fixRunner.handlePreviewConfirm}
        preview={fixRunner.previewState ? fixRunner.previewState.preview : null}
        actionLabel={fixRunner.previewState ? fixRunner.previewState.actionLabel : 'Apply fix'}
        fieldDiffs={fixRunner.previewState ? fixRunner.previewState.fieldDiffs : []}
      />
    </div>
  )
}

export default function BulkCheckTuneList(props) {
  const ignoredTuneIds = props.ignoredTuneIds || {}
  const showIgnored = !!props.showIgnored

  const visibleReports = useMemo(function() {
    const seen = new Set()
    return (props.reports || []).filter(function(report) {
      if (!report || report.tuneId == null) return false
      const tuneId = String(report.tuneId)
      if (seen.has(tuneId)) return false
      seen.add(tuneId)
      if (!ignoredTuneIds[report.tuneId] && !ignoredTuneIds[tuneId]) return true
      return showIgnored
    })
  }, [props.reports, ignoredTuneIds, showIgnored])

  if (visibleReports.length === 0) {
    return (
      <p style={{ color: '#555', marginBottom: 0 }}>
        {props.hasRun
          ? (showIgnored ? 'No tunes to display.' : 'No active tunes — enable Show ignored to review hidden items.')
          : 'Run check to analyze selected tunes.'}
      </p>
    )
  }

  return (
    <div className="bulk-check-tune-list">
      {visibleReports.map(function(report) {
        return (
          <BulkCheckReportCard
            key={String(report.tuneId)}
            report={report}
            ignoredTuneIds={ignoredTuneIds}
            tunesById={props.tunesById}
            tunebook={props.tunebook}
            token={props.token}
            fixBusyTuneId={props.fixBusyTuneId}
            onEditTune={props.onEditTune}
            onIgnoreTune={props.onIgnoreTune}
            onUnignoreTune={props.onUnignoreTune}
            onRecheckTune={props.onRecheckTune}
            forceRefresh={props.forceRefresh}
            getSearchAccess={props.getSearchAccess}
          />
        )
      })}
    </div>
  )
}

export { SEVERITY_CLASS }
