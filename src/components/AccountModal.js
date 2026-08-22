import { useEffect, useState } from 'react'
import { Modal, Button } from 'react-bootstrap'
import {
  PLAYALONG_TOP_SCORES_CHANGED_EVENT,
  averagePlayalongTopScores,
  resolvePlayalongTopScores,
} from '../playalongTopScores'

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
  const { show, onHide, user, token, logout, icons, imageError, onImageError, tunes } = props
  const photoUrl = profilePhotoUrl(user, token, imageError)
  const name = displayName(user)
  const email = user && user.email ? user.email : ''
  const [topScores, setTopScores] = useState(function() {
    return resolvePlayalongTopScores(tunes)
  })

  useEffect(function() {
    if (!show) return undefined
    function refresh() {
      setTopScores(resolvePlayalongTopScores(tunes))
    }
    refresh()
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
      return undefined
    }
    window.addEventListener(PLAYALONG_TOP_SCORES_CHANGED_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return function() {
      window.removeEventListener(PLAYALONG_TOP_SCORES_CHANGED_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [show, tunes])

  const averagePct = averagePlayalongTopScores(topScores)

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
          <div
            className="account-modal-playalong-stats"
            data-testid="account-playalong-top-scores"
          >
            <div className="account-modal-playalong-stats-label">Play along top 10</div>
            {averagePct != null ? (
              <>
                <div className="account-modal-playalong-average">
                  <span className="account-modal-playalong-average-value">{averagePct}%</span>
                  <span className="account-modal-playalong-average-caption">average</span>
                </div>
                <ol className="account-modal-playalong-score-list">
                  {topScores.map(function(row) {
                    return (
                      <li key={row.recordingId}>
                        <span className="account-modal-playalong-score-pct">{row.pitchPct}%</span>
                        {row.title ? (
                          <span className="account-modal-playalong-score-title">{row.title}</span>
                        ) : null}
                      </li>
                    )
                  })}
                </ol>
              </>
            ) : (
              <div className="account-modal-playalong-empty">
                No scored play-along takes yet
              </div>
            )}
          </div>
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
