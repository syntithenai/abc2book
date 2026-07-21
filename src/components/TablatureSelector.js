import { Form } from 'react-bootstrap'
import { TABLATURE_INSTRUMENT_OPTIONS } from '../tablatureConfig'

export default function TablatureSelector(props) {
  const { tune, tunebook, onChange, variant, stopMenuClose, className } = props
  if (!tune) return null

  const value = tune.tablature ? String(tune.tablature).trim() : ''

  function stop(e) {
    if (!stopMenuClose) return
    e.preventDefault()
    e.stopPropagation()
  }

  function handleChange(e) {
    const nextValue = e.target.value
    tune.tablature = nextValue
    if (tune.id && tunebook && tunebook.saveTune) {
      tunebook.saveTune(tune)
    }
    if (onChange) onChange(nextValue)
  }

  const blockClass = 'tablature-selector-block'
    + (variant === 'menu' ? ' tablature-selector-block--menu' : '')
    + (className ? ' ' + className : '')

  return (
    <div
      className={blockClass}
      onClick={stop}
      onMouseDown={stop}
    >
      <span className="tablature-selector-label">Tab</span>
      <Form.Select
        size="sm"
        className="tablature-selector-control"
        aria-label="Tablature"
        title="Tablature"
        value={value}
        onChange={handleChange}
      >
        {TABLATURE_INSTRUMENT_OPTIONS.map(function(opt) {
          return (
            <option key={opt.value || '__none'} value={opt.value}>
              {opt.label}
            </option>
          )
        })}
      </Form.Select>
    </div>
  )
}
