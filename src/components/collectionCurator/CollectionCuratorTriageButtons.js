import { Button, ButtonGroup } from 'react-bootstrap'

export default function CollectionCuratorTriageButtons(props) {
  const busy = props.busy
  const size = props.size || 'sm'
  const vertical = props.vertical !== false

  function wrap(status, variant, label) {
    return (
      <Button
        variant={variant}
        size={size}
        disabled={busy}
        onClick={function() { props.onTriage(status) }}
      >
        {label}
      </Button>
    )
  }

  const buttons = [
    wrap('keep', 'success', 'Keep'),
    wrap('maybe', 'warning', 'Review later'),
    wrap('cull', 'outline-danger', 'Cull'),
  ]
  if (props.showClear) {
    buttons.push(wrap('unset', 'outline-secondary', 'Clear'))
  }

  if (vertical) {
    return <ButtonGroup vertical size={size}>{buttons}</ButtonGroup>
  }
  return <ButtonGroup size={size}>{buttons}</ButtonGroup>
}
