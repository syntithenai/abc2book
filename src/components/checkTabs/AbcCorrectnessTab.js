import { useState } from 'react'
import { Alert, Button } from 'react-bootstrap'
import {
  fixTuneAbcHeaders,
  normalizeTuneAbc,
} from '../../tuneAbcCorrectnessCheck'

export default function AbcCorrectnessTab(props) {
  const issues = props.issues || []
  const [busyTuneId, setBusyTuneId] = useState(null)

  if (issues.length === 0) {
    return (
      <p style={{ color: '#555', marginBottom: 0 }}>
        {props.hasRun
          ? 'All selected tunes have technically valid ABC notation.'
          : 'Run checks to analyze ABC correctness.'}
      </p>
    )
  }

  function runFix(tuneId, action) {
    if (!props.tunebook || !props.onIssuesUpdated) return
    const item = issues.find(function(row) { return row.tuneId === tuneId })
    if (!item) return
    const tune = props.selectedTunes.find(function(t) { return t.id === tuneId })
    if (!tune) return

    setBusyTuneId(tuneId)
    try {
      let saved = null
      if (action === 'headers') {
        saved = fixTuneAbcHeaders(tune, props.tunebook.abcTools)
      } else if (action === 'normalize' && props.parseAndRender) {
        saved = normalizeTuneAbc(tune, props.tunebook.abcTools, props.parseAndRender)
      }
      if (saved) {
        props.tunebook.saveTune(saved, false, { historyLabel: 'Bulk ABC fix', immediate: true })
        if (props.forceRefresh) props.forceRefresh()
        props.onIssuesUpdated(tuneId)
      }
    } finally {
      setBusyTuneId(null)
    }
  }

  return (
    <div>
      <p style={{ marginBottom: '0.75em', color: '#555' }}>
        Parse errors, missing headers, and normalization issues. Quick fixes run here; use Edit tune
        for deeper changes in the notation editor.
      </p>
      {issues.map(function(item) {
        const canFixHeaders = item.issues.some(function(i) {
          return i.code === 'missing_meter_header' || i.code === 'missing_key_header'
        })
        const canNormalize = item.issues.some(function(i) { return i.code === 'round_trip_drift' })
        const isBusy = busyTuneId === item.tuneId

        return (
          <div
            key={item.tuneId}
            style={{
              marginBottom: '1em',
              border: '1px solid #ccc',
              borderRadius: '4px',
              overflow: 'hidden',
            }}
          >
            <div style={{
              background: '#fff8f0',
              padding: '0.5em 0.75em',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.5em',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
            >
              <div>
                <strong>{item.tuneName}</strong>
                {item.composer ? <span> — {item.composer}</span> : null}
              </div>
              <div style={{ display: 'flex', gap: '0.5em', flexWrap: 'wrap' }}>
                {canFixHeaders && (
                  <Button
                    variant="outline-primary"
                    size="sm"
                    disabled={isBusy}
                    onClick={function() { runFix(item.tuneId, 'headers') }}
                  >
                    Fix headers
                  </Button>
                )}
                {canNormalize && props.parseAndRender && (
                  <Button
                    variant="outline-warning"
                    size="sm"
                    disabled={isBusy}
                    onClick={function() { runFix(item.tuneId, 'normalize') }}
                  >
                    Normalize
                  </Button>
                )}
                <Button
                  variant="primary"
                  size="sm"
                  onClick={function() { props.onEditTune(item.tuneId) }}
                >
                  Edit tune
                </Button>
              </div>
            </div>
            {item.abcSnippet && (
              <pre style={{
                margin: 0,
                padding: '0.5em 0.75em',
                fontSize: '0.85em',
                background: '#fafafa',
                borderTop: '1px solid #eee',
                whiteSpace: 'pre-wrap',
              }}
              >
                {item.abcSnippet}
              </pre>
            )}
            <div style={{ padding: '0.5em 0.75em 0.75em' }}>
              {item.issues.map(function(issueItem, index) {
                return (
                  <Alert
                    key={item.tuneId + '-' + issueItem.code + '-' + index}
                    variant={issueItem.severity === 'warning' ? 'warning' : 'danger'}
                    style={{ padding: '0.35em 0.6em', marginBottom: '0.35em' }}
                  >
                    {issueItem.message}
                  </Alert>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
