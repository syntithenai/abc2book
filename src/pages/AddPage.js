import { useNavigate, useLocation } from 'react-router-dom'
import AddSongModal from '../components/AddSongModal'
import { useDocumentTitle } from '../pageTitle'

export default function AddPage(props) {
  useDocumentTitle('Add')
  const navigate = useNavigate()
  const location = useLocation()
  const defaultTab = location.pathname.endsWith('/bulk') ? 'bulk' : 'add'

  function handleRouteClose() {
    navigate('/tunes', { replace: true })
  }

  return (
    <AddSongModal
      forceRefresh={props.forceRefresh}
      tunebook={props.tunebook}
      tunes={props.tunes}
      token={props.token}
      requestGoogleScopes={props.requestGoogleScopes}
      login={props.login}
      tunesHash={props.tunesHash}
      filter={props.filter}
      setFilter={props.setFilter}
      currentTuneBook={props.currentTuneBook}
      setCurrentTuneBook={props.setCurrentTuneBook}
      tagFilter={props.tagFilter}
      setTagFilter={props.setTagFilter}
      searchIndex={props.searchIndex}
      loadTuneTexts={props.loadTuneTexts}
      mediaController={props.mediaController}
      setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
      routeMode
      defaultTab={defaultTab}
      onRouteClose={handleRouteClose}
    />
  )
}
