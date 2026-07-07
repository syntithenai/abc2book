import { Button } from 'react-bootstrap'
import { SEVERITY_BLUE, SEVERITY_GREEN, SEVERITY_ORANGE, SEVERITY_RED } from '../tuneBulkCheckReport'
import BulkCheckFixDropdown from './BulkCheckFixDropdown'

const SEVERITY_CLASS = {
  [SEVERITY_RED]: 'bulk-check-item--red',
  [SEVERITY_ORANGE]: 'bulk-check-item--orange',
  [SEVERITY_BLUE]: 'bulk-check-item--blue',
  [SEVERITY_GREEN]: 'bulk-check-item--green',
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

  return (
    <div className="bulk-check-tune-list">
      {visibleReports.map(function(report) {
        const isIgnored = !!ignoredTuneIds[report.tuneId]
        const severityClass = isIgnored ? 'bulk-check-item--ignored' : (SEVERITY_CLASS[report.severity] || '')
        const tune = props.tunesById ? props.tunesById[report.tuneId] : null

        return (
          <div
            key={report.tuneId}
            className={'bulk-check-item ' + severityClass}
          >
            <div className="bulk-check-item-header">
              <div className="bulk-check-item-title">
                <strong>{report.tuneName}</strong>
                {report.composer ? <span className="bulk-check-item-artist"> — {report.composer}</span> : null}
                {isIgnored ? <span className="bulk-check-item-ignored-label">Ignored</span> : null}
              </div>
              <div className="bulk-check-item-actions">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={function() { props.onEditTune(report.tuneId) }}
                >
                  Edit tune
                </Button>
                <BulkCheckFixDropdown
                  tune={tune}
                  tunes={props.tunesById}
                  tunebook={props.tunebook}
                  token={props.token}
                  busy={props.fixBusyTuneId === report.tuneId}
                  onIgnoreTune={props.onIgnoreTune}
                  onFixComplete={function() { props.onRecheckTune(report.tuneId) }}
                  forceRefresh={props.forceRefresh}
                />
                {isIgnored ? (
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={function() { props.onUnignoreTune(report.tuneId) }}
                  >
                    Unignore
                  </Button>
                ) : (
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={function() { props.onIgnoreTune(report.tuneId) }}
                  >
                    Ignore
                  </Button>
                )}
              </div>
            </div>
            {report.issues.length > 0 && (
              <ul className="bulk-check-item-issues">
                {report.issues.map(function(issueItem, index) {
                  return (
                    <li key={report.tuneId + '-' + issueItem.code + '-' + index}>
                      {issueItem.message}
                    </li>
                  )
                })}
              </ul>
            )}
            {report.severity === SEVERITY_GREEN && !isIgnored && (
              <p className="bulk-check-item-ok">All checks passed.</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

export { SEVERITY_CLASS }
