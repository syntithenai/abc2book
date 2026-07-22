import { useState } from 'react'
import { Button } from 'react-bootstrap'
import { FixedSizeList } from 'react-window'
import AutoSizer from 'react-virtualized-auto-sizer'
import { SEVERITY_BLUE, SEVERITY_GREEN, SEVERITY_ORANGE, SEVERITY_RED, collectReportIssuesForFixes } from '../tuneBulkCheckReport'
import BulkCheckFixDropdown from './BulkCheckFixDropdown'

const SEVERITY_CLASS = {
  [SEVERITY_RED]: 'bulk-check-item--red',
  [SEVERITY_ORANGE]: 'bulk-check-item--orange',
  [SEVERITY_BLUE]: 'bulk-check-item--blue',
  [SEVERITY_GREEN]: 'bulk-check-item--green',
}

const BULK_CHECK_ROW_HEIGHT = 140

function BulkCheckReportCard(props) {
  const report = props.report
  const isIgnored = !!props.ignoredTuneIds[report.tuneId]
  const severityClass = isIgnored ? 'bulk-check-item--ignored' : (SEVERITY_CLASS[report.severity] || '')
  const tune = props.tunesById ? props.tunesById[report.tuneId] : null
  const [issuesExpanded, setIssuesExpanded] = useState(false)
  const issueLimit = 5
  const visibleIssues = issuesExpanded ? report.issues : report.issues.slice(0, issueLimit)
  const hiddenIssueCount = Math.max(0, report.issues.length - issueLimit)

  return (
    <div className={'bulk-check-item ' + severityClass}>
      <div className="bulk-check-item-header">
        <div className="bulk-check-item-title">
          <strong>{report.tuneName}</strong>
          {report.composer ? <span className="bulk-check-item-artist"> — {report.composer}</span> : null}
          {isIgnored ? <span className="bulk-check-item-ignored-label">Ignored</span> : null}
        </div>
        <div className="bulk-check-item-actions">
          <Button variant="primary" size="sm" onClick={function() { props.onEditTune(report.tuneId) }}>
            Edit tune
          </Button>
          <BulkCheckFixDropdown
            tune={tune}
            issues={collectReportIssuesForFixes(report)}
            report={report}
            tunes={props.tunesById}
            tunebook={props.tunebook}
            token={props.token}
            busy={props.fixBusyTuneId === report.tuneId}
            onIgnoreTune={props.onIgnoreTune}
            onFixComplete={function() { props.onRecheckTune(report.tuneId) }}
            forceRefresh={props.forceRefresh}
          />
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
      {report.issues.length > 0 && (
        <>
          <ul className="bulk-check-item-issues">
            {visibleIssues.map(function(issueItem, index) {
              return (
                <li key={report.tuneId + '-' + issueItem.code + '-' + index}>
                  {issueItem.message}
                </li>
              )
            })}
          </ul>
          {hiddenIssueCount > 0 && !issuesExpanded && (
            <Button variant="link" size="sm" className="p-0" onClick={function() { setIssuesExpanded(true) }}>
              Show {hiddenIssueCount} more issue{hiddenIssueCount === 1 ? '' : 's'}
            </Button>
          )}
        </>
      )}
      {report.severity === SEVERITY_GREEN && !isIgnored && (
        <p className="bulk-check-item-ok">All checks passed.</p>
      )}
    </div>
  )
}

export default function BulkCheckTuneList(props) {
  const reports = props.reports || []
  const ignoredTuneIds = props.ignoredTuneIds || {}
  const showIgnored = !!props.showIgnored

  const visibleReports = reports.filter(function(report) {
    if (!ignoredTuneIds[report.tuneId]) return true
    return showIgnored
  })

  if (visibleReports.length === 0) {
    return (
      <p style={{ color: '#555', marginBottom: 0 }}>
        {props.hasRun
          ? (showIgnored ? 'No tunes to display.' : 'No active tunes — enable Show ignored to review hidden items.')
          : 'Run check to analyze selected tunes.'}
      </p>
    )
  }

  const listHeight = Math.min(visibleReports.length * BULK_CHECK_ROW_HEIGHT, 560)

  function RowRenderer({ index, style }) {
    const report = visibleReports[index]
    return (
      <div style={style} className="bulk-check-tune-list-row">
        <BulkCheckReportCard
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
        />
      </div>
    )
  }

  return (
    <div className="bulk-check-tune-list" style={{ height: listHeight, width: '100%' }}>
      <AutoSizer disableHeight>
        {function({ width }) {
          return (
            <FixedSizeList
              height={listHeight}
              width={width}
              itemCount={visibleReports.length}
              itemSize={BULK_CHECK_ROW_HEIGHT}
              overscanCount={4}
            >
              {RowRenderer}
            </FixedSizeList>
          )
        }}
      </AutoSizer>
    </div>
  )
}

export { SEVERITY_CLASS }
