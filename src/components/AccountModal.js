import { useEffect, useState } from 'react'
import { Modal, Button, Table } from 'react-bootstrap'
import {
  PLAYALONG_TOP_SCORES_CHANGED_EVENT,
  averagePlayalongTopScores,
  clearPlayalongScorePitchPctFromTunes,
  clearPlayalongTopScores,
  removePlayalongTopScoresForTune,
  resolvePlayalongTopScores,
  summarizePlayalongScoresByTune,
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
  const { show, onHide, user, token, logout, icons, imageError, onImageError, tunes, tunebook } = props
  const photoUrl = profilePhotoUrl(user, token, imageError)
  const name = displayName(user)
  const email = user && user.email ? user.email : ''
  const [topScores, setTopScores] = useState(function() {
    return resolvePlayalongTopScores(tunes)
  })
  const [showDetails, setShowDetails] = useState(false)

  useEffect(function() {
    if (!show && !showDetails) return undefined
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
  }, [show, showDetails, tunes])

  const averagePct = averagePlayalongTopScores(topScores)
  const tuneSummaries = summarizePlayalongScoresByTune(topScores)

  function handleLogout() {
    setShowDetails(false)
    onHide()
    if (typeof logout === 'function') logout()
  }

  function handleOpenDetails() {
    onHide()
    setShowDetails(true)
  }

  function handleCloseDetails() {
    setShowDetails(false)
  }

  function handleResetAllScores() {
    if (typeof window === 'undefined' || typeof window.confirm !== 'function') return
    if (!window.confirm('Reset all play along scores? This cannot be undone.')) return
    clearPlayalongScorePitchPctFromTunes(tunes, tunebook)
    setTopScores(clearPlayalongTopScores())
  }

  function handleResetTuneScores(row) {
    if (!row) return
    if (typeof window === 'undefined' || typeof window.confirm !== 'function') return
    const label = row.title || 'this tune'
    if (!window.confirm('Reset play along scores for "' + label + '"? This cannot be undone.')) return
    clearPlayalongScorePitchPctFromTunes(tunes, tunebook, {
      tuneId: row.tuneId,
      title: row.title,
    })
    setTopScores(removePlayalongTopScoresForTune(row.tuneId, row.title))
  }

  return (
    <>
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
              <div className="account-modal-playalong-stats-label">Play along</div>
              {averagePct != null ? (
                <>
                  <div className="account-modal-playalong-average">
                    <span className="account-modal-playalong-average-value">{averagePct}%</span>
                    <span className="account-modal-playalong-average-caption">average</span>
                  </div>
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={handleOpenDetails}
                    data-testid="account-playalong-details-button"
                  >
                    Details
                  </Button>
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

      <Modal
        show={showDetails}
        onHide={handleCloseDetails}
        centered
        scrollable
        size="xl"
        className="account-playalong-details-modal"
        dialogClassName="account-playalong-details-dialog"
      >
        <Modal.Header closeButton>
          <Modal.Title>Play Along Details</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {tuneSummaries.length ? (
            <>
              <div className="account-playalong-details-toolbar">
                <Button
                  variant="outline-danger"
                  size="sm"
                  onClick={handleResetAllScores}
                  data-testid="account-playalong-reset-all-button"
                >
                  Reset all
                </Button>
              </div>
              <Table
                size="sm"
                hover
                className="account-playalong-tune-table"
                data-testid="account-playalong-tune-summaries"
              >
                <thead>
                  <tr>
                    <th scope="col" className="account-playalong-tune-col-title">Tune</th>
                    <th scope="col" className="account-playalong-tune-col-num">Takes</th>
                    <th scope="col" className="account-playalong-tune-col-num">Min</th>
                    <th scope="col" className="account-playalong-tune-col-num">Max</th>
                    <th scope="col" className="account-playalong-tune-col-num">Average</th>
                    <th scope="col" className="account-playalong-tune-col-action" />
                  </tr>
                </thead>
                <tbody>
                  {tuneSummaries.map(function(row) {
                    return (
                      <tr key={row.key || row.tuneId || row.title}>
                        <td className="account-playalong-tune-col-title" title={row.title}>
                          {row.title}
                        </td>
                        <td className="account-playalong-tune-col-num">{row.count}</td>
                        <td className="account-playalong-tune-col-num">{row.min}%</td>
                        <td className="account-playalong-tune-col-num">{row.max}%</td>
                        <td className="account-playalong-tune-col-num">{row.average}%</td>
                        <td className="account-playalong-tune-col-action">
                          <Button
                            variant="outline-danger"
                            size="sm"
                            onClick={function() { handleResetTuneScores(row) }}
                            data-testid="account-playalong-reset-tune-button"
                          >
                            Reset
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            </>
          ) : (
            <div className="account-modal-playalong-empty">
              No scored play-along takes yet
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleCloseDetails}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}
