import { Button } from 'react-bootstrap'

export default function ScratchpadStemActions(props) {
  return (
    <Button
      size="sm"
      variant="outline-warning"
      disabled={props.busy || !props.canSeparate}
      onClick={props.onSeparate}
      title="Separate stems with Demucs (requires resolver)"
    >
      {props.busy ? 'Separating…' : 'Separate stems'}
    </Button>
  )
}
