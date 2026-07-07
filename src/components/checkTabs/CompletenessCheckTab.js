import { Button } from 'react-bootstrap'

export default function CompletenessCheckTab(props) {
  const issues = props.issues || []

  if (issues.length === 0) {
    return (
      <p style={{ color: '#555', marginBottom: 0 }}>
        {props.hasRun
          ? 'All selected tunes pass record completeness (lyric/chord layout or melody with embedded chords).'
          : 'Run checks to analyze record completeness.'}
      </p>
    )
  }

  return (
    <div>
      <p style={{ marginBottom: '0.75em', color: '#555' }}>
        These tunes are missing lyrics, chords, melody, or structural markers. Edit each tune in the
        full editor to fix lyrics, chords, meter, and notation.
      </p>
      {issues.map(function(item) {
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
              background: '#f8f4ff',
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
                <span style={{ marginLeft: '0.5em', fontSize: '0.85em', color: '#666' }}>
                  Suggested path {item.suggestedPath}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.5em' }}>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={function() { props.onEditTune(item.tuneId) }}
                >
                  Edit tune
                </Button>
                {props.onRecheckTune && (
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={function() { props.onRecheckTune(item.tuneId) }}
                  >
                    Re-check
                  </Button>
                )}
              </div>
            </div>
            <ul style={{ margin: 0, padding: '0.5em 0.75em 0.75em 2em' }}>
              {item.issues.map(function(issueItem, index) {
                return (
                  <li key={item.tuneId + '-' + issueItem.code + '-' + index}>
                    {issueItem.message}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
