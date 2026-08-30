/**
 * Admin Review Projects: Milliner–Koken + Old Time Fiddle (tabbed).
 * Requires local resolver with Documents review root mounted.
 */
import { useEffect, useState } from 'react'
import { Alert, Button, Modal, Nav, Spinner } from 'react-bootstrap'
import { toast } from 'react-toastify'
import BookImportReviewPanel from './BookImportReviewPanel'
import OldtimeEnrichReviewPanel from './OldtimeEnrichReviewPanel'
import {
  fetchReviewProjectsCatalog,
  findReviewProject,
  fetchReviewProjectsJson,
  reviewProjectsAvailableFromStatus,
} from '../reviewProjectsClient'
import { ensureMillinerReviewSet } from '../reviewProjectsMilliner'
import {
  importEnrichPackage,
  listOldtimeEnrichSets,
  getOldtimeEnrichSet,
  deleteOldtimeEnrichSet,
} from '../oldtimeEnrichReviewStore'

const TAB_MILLINER = 'milliner-koken'
const TAB_OLDTIME = 'oldtimefiddletunes'

export default function ReviewProjectsModal(props) {
  const show = !!props.show
  const onHide = props.onHide
  const tunebook = props.tunebook
  const token = props.token
  const accessToken = token && token.access_token ? token.access_token : token
  const resolverStatus = props.resolverStatus
  const reviewReady = reviewProjectsAvailableFromStatus(resolverStatus)

  const [tab, setTab] = useState(TAB_MILLINER)
  const [catalog, setCatalog] = useState(null)
  const [catalogError, setCatalogError] = useState('')
  const [busy, setBusy] = useState(false)

  const [millinerSetId, setMillinerSetId] = useState('')
  const [oldtimeSetId, setOldtimeSetId] = useState('')
  const [oldtimeSets, setOldtimeSets] = useState([])

  async function refreshOldtimeSets() {
    const list = await listOldtimeEnrichSets()
    setOldtimeSets(list)
    return list
  }

  async function loadCatalog() {
    setCatalogError('')
    setBusy(true)
    try {
      const cat = await fetchReviewProjectsCatalog(accessToken)
      setCatalog(cat)
      return cat
    } catch (err) {
      setCatalogError((err && err.message) || String(err))
      setCatalog(null)
      return null
    } finally {
      setBusy(false)
    }
  }

  async function ensureMilliner(cat) {
    const project = findReviewProject(cat, TAB_MILLINER)
    if (!project) {
      throw new Error('Milliner–Koken package not found on resolver')
    }
    setBusy(true)
    try {
      const set = await ensureMillinerReviewSet(project, accessToken)
      setMillinerSetId(set.id)
      toast.success('Loaded Milliner–Koken (' + (set.tunes || []).length + ' tunes)')
    } finally {
      setBusy(false)
    }
  }

  async function loadOldtimePackage(relativePath, name) {
    setBusy(true)
    try {
      const pkg = await fetchReviewProjectsJson(relativePath, accessToken)
      const set = await importEnrichPackage(pkg, {
        name: name || (pkg.proof ? 'oldtime proof (10 tunes)' : 'oldtimefiddletunes enrich'),
      })
      await refreshOldtimeSets()
      setOldtimeSetId(set.id)
      toast.success('Loaded ' + (set.tunes || []).length + ' tunes')
    } catch (err) {
      toast.error((err && err.message) || String(err))
    } finally {
      setBusy(false)
    }
  }

  useEffect(function() {
    if (!show || !reviewReady) return undefined
    let cancelled = false
    loadCatalog().then(function(cat) {
      if (cancelled || !cat) return
      refreshOldtimeSets().then(function(list) {
        if (cancelled) return
        if (list.length && !oldtimeSetId) setOldtimeSetId(list[0].id)
      })
    })
    return function() { cancelled = true }
  }, [show, reviewReady]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(function() {
    if (!show || !reviewReady || !catalog || tab !== TAB_MILLINER) return
    if (millinerSetId) return
    ensureMilliner(catalog).catch(function(err) {
      toast.error((err && err.message) || String(err))
    })
  }, [show, reviewReady, catalog, tab, millinerSetId]) // eslint-disable-line react-hooks/exhaustive-deps

  const oldtimeProject = findReviewProject(catalog, TAB_OLDTIME)

  return (
    <Modal
      show={show}
      onHide={onHide}
      fullscreen
      dialogClassName="review-projects-modal"
      data-testid="review-projects-modal"
    >
      <Modal.Header closeButton>
        <Modal.Title>Review Projects</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {!reviewReady ? (
          <Alert variant="warning" data-testid="review-projects-resolver-required">
            Connect to a local resolver that has access to
            {' '}<code>~/Documents/oldtime sources review</code>
            {' '}to open these collections.
          </Alert>
        ) : null}

        {catalogError ? <Alert variant="danger">{catalogError}</Alert> : null}

        <Nav
          variant="tabs"
          activeKey={tab}
          onSelect={function(key) { if (key) setTab(key) }}
          className="mb-3"
          data-testid="review-projects-tabs"
        >
          <Nav.Item>
            <Nav.Link eventKey={TAB_MILLINER} data-testid="review-projects-tab-milliner">
              Milliner–Koken
            </Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey={TAB_OLDTIME} data-testid="review-projects-tab-oldtime">
              Old Time Fiddle
            </Nav.Link>
          </Nav.Item>
        </Nav>

        {busy && !millinerSetId && !oldtimeSetId ? (
          <div className="d-flex align-items-center gap-2 mb-3">
            <Spinner animation="border" size="sm" />
            <span>Loading…</span>
          </div>
        ) : null}

        {tab === TAB_MILLINER ? (
          millinerSetId ? (
            <BookImportReviewPanel
              setId={millinerSetId}
              tunebook={tunebook}
              tunes={props.tunes}
              accessToken={accessToken}
            />
          ) : (
            <Alert variant="info">
              Loading Milliner–Koken from the resolver Documents root…
              {catalog && !findReviewProject(catalog, TAB_MILLINER) ? (
                <div className="mt-2">Package not found in catalog.</div>
              ) : null}
            </Alert>
          )
        ) : null}

        {tab === TAB_OLDTIME ? (
          !oldtimeSetId ? (
            <div>
              <Alert variant="info">
                Source-only workflow: convert each tune from its MIDI (preferred) or PDF via OMR.
                Packages load from the local resolver Documents root.
              </Alert>
              <div className="d-flex flex-wrap gap-2 mb-3">
                <Button
                  variant="primary"
                  disabled={busy || !oldtimeProject}
                  onClick={function() {
                    const path = oldtimeProject && (
                      oldtimeProject.proofPackagePath
                      || oldtimeProject.fullPackagePath
                      || oldtimeProject.dataPackagePath
                    )
                    if (path) loadOldtimePackage(path, 'oldtime proof / package')
                  }}
                >
                  {busy ? 'Loading…' : 'Load package from resolver'}
                </Button>
                {oldtimeProject && oldtimeProject.proofPackagePath ? (
                  <Button
                    variant="outline-secondary"
                    disabled={busy}
                    onClick={function() {
                      loadOldtimePackage(oldtimeProject.proofPackagePath, 'oldtime proof (10 tunes)')
                    }}
                  >
                    Load proof (10)
                  </Button>
                ) : null}
                {oldtimeProject && oldtimeProject.fullPackagePath ? (
                  <Button
                    variant="outline-secondary"
                    disabled={busy}
                    onClick={function() {
                      loadOldtimePackage(oldtimeProject.fullPackagePath, 'oldtimefiddletunes full')
                    }}
                  >
                    Load full package
                  </Button>
                ) : null}
              </div>
              {oldtimeSets.length > 0 ? (
                <div>
                  <h6>Saved sessions</h6>
                  {oldtimeSets.map(function(s) {
                    return (
                      <div key={s.id} className="d-flex justify-content-between align-items-center mb-2">
                        <Button
                          variant="link"
                          className="p-0"
                          onClick={async function() {
                            await getOldtimeEnrichSet(s.id)
                            setOldtimeSetId(s.id)
                          }}
                        >
                          {s.name || s.id} ({(s.tunes && s.tunes.length) || 0})
                        </Button>
                        <Button
                          size="sm"
                          variant="outline-danger"
                          onClick={async function() {
                            await deleteOldtimeEnrichSet(s.id)
                            const list = await refreshOldtimeSets()
                            if (oldtimeSetId === s.id) setOldtimeSetId(list[0] ? list[0].id : '')
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
                <Button size="sm" variant="outline-secondary" onClick={function() { setOldtimeSetId('') }}>
                  Sessions / reload
                </Button>
              </div>
              <OldtimeEnrichReviewPanel
                setId={oldtimeSetId}
                tunebook={tunebook}
                token={token}
              />
            </>
          )
        ) : null}
      </Modal.Body>
    </Modal>
  )
}
