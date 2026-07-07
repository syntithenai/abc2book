import { Form } from 'react-bootstrap'

export default function ComposerCandidateQuickPick({
  candidates,
  onSelect,
  className,
  placeholder,
  size,
}) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null

  return (
    <Form.Select
      size={size || 'sm'}
      className={className || 'composer-candidate-quick-pick'}
      aria-label="Choose discovered composer"
      defaultValue=""
      onChange={function(e) {
        const value = e.target.value
        if (!value) return
        if (typeof onSelect === 'function') onSelect(value)
        e.target.value = ''
      }}
    >
      <option value="">{placeholder || 'Choose discovered artist…'}</option>
      {candidates.map(function(candidate, index) {
        const artist = candidate && candidate.artist ? candidate.artist : ''
        const source = candidate && candidate.source ? candidate.source : ''
        return (
          <option key={artist + '-' + index} value={artist}>
            {artist}{source ? ' (' + source + ')' : ''}
          </option>
        )
      })}
    </Form.Select>
  )
}
