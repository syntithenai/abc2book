import { ProgressBar } from 'react-bootstrap'

export default function SearchProgressBar({
  visible,
  percent = 0,
  message,
  defaultMessage = 'Searching...',
  variantThreshold = 70,
}) {
  if (!visible) return null

  const hasPercent = typeof percent === 'number' && percent > 0
  const displayPercent = hasPercent ? Math.max(0, Math.min(100, Math.round(percent))) : 100

  return (
    <div style={{ marginTop: '0.75em', maxWidth: '32em', clear: 'both', width: '100%' }}>
      <ProgressBar
        now={displayPercent}
        label={hasPercent ? displayPercent + '%' : undefined}
        animated
        striped
        variant={hasPercent && displayPercent >= variantThreshold ? 'success' : 'info'}
      />
      <div style={{ marginTop: '0.35em', fontSize: '0.9em', color: '#555' }}>
        {message || defaultMessage}
      </div>
    </div>
  )
}
