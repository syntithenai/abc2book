import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Nav, Tab } from 'react-bootstrap'
import { fetchMusicCollectionRegistry } from '../musicCollectionCuratorClient'
import { fetchMusicCollectionStats } from '../musicCollectionAdminClient'
import CollectionCuratorHelpModal from '../components/CollectionCuratorHelpModal'
import CollectionCuratorOverview from '../components/collectionCurator/CollectionCuratorOverview'
import CollectionCuratorPhaseBar from '../components/collectionCurator/CollectionCuratorPhaseBar'
import CollectionCuratorArtistShelf from '../components/collectionCurator/CollectionCuratorArtistShelf'
import CollectionCuratorFolderShelf from '../components/collectionCurator/CollectionCuratorFolderShelf'
import CollectionCuratorTrackList from '../components/collectionCurator/CollectionCuratorTrackList'
import CollectionCuratorDuplicates from '../components/collectionCurator/CollectionCuratorDuplicates'
import useMediaResolverHealth from '../useMediaResolverHealth'
import { CURATOR_TABS } from '../collectionCuratorUtils'
import { icons } from '../Icons'

export default function CollectionCuratorPage(props) {
  const token = props.token
  const { status, checked, available } = useMediaResolverHealth()
  const resolverBase = status && status.activeBase ? status.activeBase : ''
  const [activeTab, setActiveTab] = useState(CURATOR_TABS.overview)
  const [phase, setPhase] = useState('folk-world')
  const [query, setQuery] = useState('')
  const [triageFilter, setTriageFilter] = useState('')
  const [unplayedOnly, setUnplayedOnly] = useState(false)
  const [stats, setStats] = useState(null)
  const [registry, setRegistry] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [showHelp, setShowHelp] = useState(false)
  const [overviewBusy, setOverviewBusy] = useState(false)

  const loadOverview = useCallback(async function() {
    if (!checked || !available) return
    setOverviewBusy(true)
    setError('')
    try {
      const [statsResult, reg] = await Promise.all([
        fetchMusicCollectionStats({ accessToken: token }),
        fetchMusicCollectionRegistry({ accessToken: token }),
      ])
      setStats(statsResult.stats || null)
      setRegistry(reg || null)
    } catch (e) {
      setError(e && e.message ? e.message : 'Could not load overview')
    } finally {
      setOverviewBusy(false)
    }
  }, [checked, available, token])

  useEffect(function() {
    loadOverview()
  }, [loadOverview])

  function onError(msg) {
    setError(msg)
  }

  function onMessage(msg) {
    setMessage(msg)
    loadOverview()
  }

  const sharedShelfProps = {
    phase: phase,
    query: query,
    token: token,
    resolverBase: resolverBase,
    onError: onError,
    onMessage: onMessage,
  }

  return (
    <div className="collection-curator-page p-3">
      <div className="d-flex align-items-start justify-content-between gap-2 mb-2">
        <div>
          <h1 className="mb-1">Music collection curator</h1>
          <p className="text-muted mb-0">
            Decide at folder or artist level, spot-check tracks when needed, handle duplicates separately.
          </p>
        </div>
        <Button
          variant="outline-secondary"
          size="sm"
          title="How to use the collection curator"
          aria-label="How to use the collection curator"
          onClick={function() { setShowHelp(true) }}
          className="flex-shrink-0 mt-1"
        >
          {icons.question}
        </Button>
      </div>

      {error ? <Alert variant="danger" onClose={function() { setError('') }} dismissible>{error}</Alert> : null}
      {!checked ? (
        <Alert variant="info">Connecting to media resolver…</Alert>
      ) : !available ? (
        <Alert variant="warning">
          Media resolver is not available. Open Settings → Music collection and confirm your home resolver is running.
        </Alert>
      ) : null}
      {message ? <Alert variant="success" onClose={function() { setMessage('') }} dismissible>{message}</Alert> : null}

      {available ? (
        <>
          <CollectionCuratorPhaseBar
            phase={phase}
            query={query}
            onPhaseChange={setPhase}
            onQueryChange={setQuery}
            showTriageFilter={activeTab === CURATOR_TABS.tracks}
            triageFilter={triageFilter}
            onTriageFilterChange={setTriageFilter}
            showUnplayed={activeTab === CURATOR_TABS.tracks}
            unplayedOnly={unplayedOnly}
            onUnplayedOnlyChange={setUnplayedOnly}
            onRefresh={loadOverview}
          />

          <Tab.Container activeKey={activeTab} onSelect={function(key) { if (key) setActiveTab(key) }}>
            <Nav variant="tabs" className="mb-3">
              <Nav.Item><Nav.Link eventKey={CURATOR_TABS.overview}>Overview</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey={CURATOR_TABS.folders}>By folder</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey={CURATOR_TABS.artists}>By artist</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey={CURATOR_TABS.tracks}>Tracks</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey={CURATOR_TABS.duplicates}>Duplicates</Nav.Link></Nav.Item>
            </Nav>
            <Tab.Content>
              <Tab.Pane eventKey={CURATOR_TABS.overview}>
                {overviewBusy ? <div className="small text-muted">Loading…</div> : null}
                <CollectionCuratorOverview
                  stats={stats}
                  registry={registry}
                  phase={phase}
                  token={token}
                  onError={onError}
                  onMessage={onMessage}
                  onRefresh={loadOverview}
                />
              </Tab.Pane>
              <Tab.Pane eventKey={CURATOR_TABS.folders}>
                <CollectionCuratorFolderShelf {...sharedShelfProps} />
              </Tab.Pane>
              <Tab.Pane eventKey={CURATOR_TABS.artists}>
                <CollectionCuratorArtistShelf {...sharedShelfProps} />
              </Tab.Pane>
              <Tab.Pane eventKey={CURATOR_TABS.tracks}>
                <CollectionCuratorTrackList
                  {...sharedShelfProps}
                  triageFilter={triageFilter}
                  unplayedOnly={unplayedOnly}
                />
              </Tab.Pane>
              <Tab.Pane eventKey={CURATOR_TABS.duplicates}>
                <CollectionCuratorDuplicates
                  phase={phase}
                  token={token}
                  onError={onError}
                  onMessage={onMessage}
                />
              </Tab.Pane>
            </Tab.Content>
          </Tab.Container>
        </>
      ) : null}

      <CollectionCuratorHelpModal show={showHelp} onHide={function() { setShowHelp(false) }} />
    </div>
  )
}
