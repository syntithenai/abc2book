import { Button } from 'react-bootstrap'
import { useNavigate } from 'react-router-dom'

export default function PracticeSessionButton(props) {
  const practice = props.practiceSession || {}
  const navigate = useNavigate()

  function handleOpenConfig() {
    navigate('/practice')
  }

  return (
    <Button
      variant="primary"
      size={props.buttonSize}
      className={props.buttonClassName || 'header-dropdown-btn'}
      title="Practice session"
      onClick={handleOpenConfig}
    >
      <span className="header-dropdown-btn-label">
        {props.tunebook.icons.reviewsmall}
        <span>Practice</span>
      </span>
    </Button>
  )
}
