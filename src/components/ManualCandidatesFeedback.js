import { Alert, Button } from 'react-bootstrap'

function LockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      style={{ verticalAlign: 'text-bottom', marginRight: '0.25em' }}
    >
      <path
        fill="currentColor"
        d="M12 2a5 5 0 0 1 5 5v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v3h6V7a3 3 0 0 0-3-3z"
      />
    </svg>
  )
}

export default function ManualCandidatesFeedback(props) {
  const manualCandidates = Array.isArray(props.manualCandidates) ? props.manualCandidates : []
  if (manualCandidates.length === 0) return null

  const tunebook = props.tunebook
  const icons = (props.icons) || (tunebook && tunebook.icons) || null
  const lockIcon = icons && icons.lock ? icons.lock : <LockIcon />
  const externalLinkIcon = icons && icons.externallink ? icons.externallink : null

  return (
    <Alert variant="warning" style={{ marginTop: '0.75em', clear: 'both' }}>
      <div>{props.message || 'No importable match found'}</div>
      <div style={{ marginTop: '0.35em', fontSize: '0.95em' }}>
        Matching pages were found on sites that block automated access. Open a locked source, copy the content, and paste it to import.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5em', marginTop: '0.75em' }}>
        {manualCandidates.map(function(candidate, index) {
          const label = candidate.source || candidate.host || 'External source'
          const key = (candidate.url || label) + '-' + index
          return (
            <Button
              key={key}
              variant="outline-secondary"
              size="sm"
              onClick={function() {
                if (typeof props.onSelectCandidate === 'function') {
                  props.onSelectCandidate(candidate)
                }
              }}
            >
              <span style={{ marginRight: '0.35em' }}>{lockIcon}</span>
              {externalLinkIcon ? (
                <span style={{ marginRight: '0.35em' }}>{externalLinkIcon}</span>
              ) : null}
              {label}
            </Button>
          )
        })}
      </div>
    </Alert>
  )
}
