import { Form } from 'react-bootstrap'
import { aliasesToInputValue, parseAliasesInput } from '../tuneAliasesUtils'

export default function TuneAliasesField(props) {
  const value = props.value
  const onChange = props.onChange
  const controlId = props.controlId || 'aliases'
  const className = props.className || 'mb-3'
  const label = props.label != null ? props.label : 'Aliases'
  const placeholder = props.placeholder || 'Comma-separated alternate titles'

  return (
    <Form.Group className={className} controlId={controlId}>
      {label ? <Form.Label>{label}</Form.Label> : null}
      <Form.Control
        value={aliasesToInputValue(value)}
        onChange={function(e) {
          if (typeof onChange === 'function') {
            onChange(parseAliasesInput(e.target.value))
          }
        }}
        placeholder={placeholder}
      />
    </Form.Group>
  )
}
