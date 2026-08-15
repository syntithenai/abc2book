import { Modal, Button } from 'react-bootstrap'
import GlobalTempoSlider from './GlobalTempoSlider'

function profilePhotoUrl(user, token, imageError) {
  if (imageError || !(user && user.picture)) return null
  if (token && token.access_token) {
    return user.picture + '?access_token=' + token.access_token + '&not-from-cache-please'
  }
  return user.picture
}

function displayName(user) {
  if (!user) return 'Signed in'
  if (user.name) return user.name
  const given = user.given_name || ''
  const family = user.family_name || ''
  const combined = (given + ' ' + family).trim()
  if (combined) return combined
  return user.email || 'Signed in'
}

export default function AccountModal(props) {
  const { show, onHide, user, token, logout, icons, imageError, onImageError, mediaController } = props
  const photoUrl = profilePhotoUrl(user, token, imageError)
  const name = displayName(user)
  const email = user && user.email ? user.email : ''

  function handleLogout() {
    onHide()
    if (typeof logout === 'function') logout()
  }

  return (
    <Modal show={show} onHide={onHide} centered className="account-modal">
      <Modal.Header closeButton>
        <Modal.Title>Account</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="account-modal-body">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt=""
              className="account-modal-photo"
              onError={function() {
                if (typeof onImageError === 'function') onImageError()
              }}
            />
          ) : (
            <div className="account-modal-photo account-modal-photo-fallback" aria-hidden="true">
              {icons && icons.login}
            </div>
          )}
          <div className="account-modal-name">{name}</div>
          {email && email !== name ? (
            <div className="account-modal-email">{email}</div>
          ) : null}
        </div>
        <div className="account-modal-tempo">
          <GlobalTempoSlider mediaController={mediaController} />
        </div>
      </Modal.Body>
      <Modal.Footer className="account-modal-footer">
        <Button variant="secondary" onClick={onHide}>
          Close
        </Button>
        <Button variant="danger" onClick={handleLogout} className="account-modal-logout-btn">
          {icons && icons.logout}
          <span>Log out</span>
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
