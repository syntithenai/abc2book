/**
 * Admin-only modal: loads source-only proof package (or full enrich) for review.
 */
import { useEffect, useState } from 'react'
import { Alert, Button, Modal, Spinner } from 'react-bootstrap'
import { toast } from 'react-toastify'
import OldtimeEnrichReviewPanel from './OldtimeEnrichReviewPanel'
import {
  importEnrichPackage,
  listOldtimeEnrichSets,
  getOldtimeEnrichSet,
  deleteOldtimeEnrichSet,
} from '../oldtimeEnrichReviewStore'

const PROOF_PACKAGE_URL = '/oldtimefiddletunes/enrich_package_proof.json'
const FULL_PACKAGE_URL = '/oldtimefiddletunes/enrich_package.json'

export default function OldtimeEnrichReviewModal(props) {
  const show = !!props.show
  const onHide = props.onHide
  const tunebook = props.tunebook
  const token = props.token
  const [sets, setSets] = useState([])
  const [activeSetId, setActiveSetId] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState('')

  async function refreshSets() {
    const list = await listOldtimeEnrichSets()
    setSets(list)
    return list
  }

  async function loadPackage(url, name) {
    setBusy(true)
    setLoadError('')
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) {
        throw new Error(
          'Could not load ' + url + ' (HTTP ' + res.status + ').'
        )
      }
      const pkg = await res.json()
      const set = await importEnrichPackage(pkg, {
        name: name || (pkg.proof ? 'oldtime proof (10 tunes)' : 'oldtimefiddletunes enrich'),
      })
      await refreshSets()
      setActiveSetId(set.id)
      toast.success('Loaded ' + (set.tunes || []).length + ' tunes')
    } catch (err) {
      setLoadError((err && err.message) || String(err))
      toast.error((err && err.message) || String(err))
    } finally {
      setBusy(false)
    }
  }

  useEffect(function() {
    if (!show) return
    let cancelled = false
    refreshSets().then(function(list) {
      if (cancelled) return
      if (list.length) {
        setActiveSetId(list[0].id)
      } else {
        loadPackage(PROOF_PACKAGE_URL, 'oldtime proof (10 tunes)')
      }
    })
    return function() { cancelled = true }
  }, [show]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal show={show} onHide={onHide} size="xl" fullscreen="lg-down" dialogClassName="oldtime-enrich-modal">
      <Modal.Header closeButton>
        <Modal.Title>Old Time Fiddle Tunes — source convert review (admin)</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {!activeSetId ? (
          <div>
            <Alert variant="info">
              Source-only workflow: convert each tune from its MIDI (preferred) or PDF via OMR.
              No library/internet search. Proof package is 5 MIDI + 5 PDF tunes.
            </Alert>
            {loadError ? <Alert variant="danger">{loadError}</Alert> : null}
            <div className="d-flex flex-wrap gap-2 mb-3">
              <Button
                variant="primary"
                disabled={busy}
                onClick={function() { loadPackage(PROOF_PACKAGE_URL, 'oldtime proof (10 tunes)') }}
              >
                {busy ? 'Loading…' : 'Load proof package (10)'}
              </Button>
              <Button
                variant="outline-secondary"
                disabled={busy}
                onClick={function() { loadPackage(FULL_PACKAGE_URL, 'oldtimefiddletunes full') }}
              >
                Load full package
              </Button>
              {busy ? <Spinner animation="border" size="sm" /> : null}
            </div>
            {sets.length > 0 ? (
              <div>
                <h6>Saved sessions</h6>
                {sets.map(function(s) {
                  return (
                    <div key={s.id} className="d-flex justify-content-between align-items-center mb-2">
                      <Button
                        variant="link"
                        className="p-0"
                        onClick={async function() {
                          await getOldtimeEnrichSet(s.id)
                          setActiveSetId(s.id)
                        }}
                      >
                        {s.name || s.id} ({(s.tunes && s.tunes.length) || 0})
                      </Button>
                      <Button
                        size="sm"
                        variant="outline-danger"
                        onClick={async function() {
                          await deleteOldtimeEnrichSet(s.id)
                          const list = await refreshSets()
                          if (activeSetId === s.id) setActiveSetId(list[0] ? list[0].id : '')
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <div className="d-flex flex-wrap gap-2 mb-2">
              <Button size="sm" variant="outline-secondary" onClick={function() { setActiveSetId('') }}>
                Sessions / reload
              </Button>
            </div>
            <OldtimeEnrichReviewPanel
              setId={activeSetId}
              tunebook={tunebook}
              token={token}
            />
          </>
        )}
      </Modal.Body>
    </Modal>
  )
}
