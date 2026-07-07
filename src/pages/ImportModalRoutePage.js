import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import ImportSheetImageModal from '../components/ImportSheetImageModal'
import ImportChordSheetModal from '../components/ImportChordSheetModal'
import ImportChordUrlModal from '../components/ImportChordUrlModal'

const SUPPORTED_TYPES = new Set(['sheet-image', 'chord-sheet', 'chord-url'])

export default function ImportModalRoutePage(props) {
  const navigate = useNavigate()
  const modalType = props.modalType

  useEffect(function() {
    if (!SUPPORTED_TYPES.has(modalType)) {
      navigate('/import', { replace: true })
    }
  }, [modalType, navigate])

  function handleRouteClose() {
    navigate('/tunes', { replace: true })
  }

  const sharedProps = {
    forceRefresh: props.forceRefresh,
    tunebook: props.tunebook,
    currentTuneBook: props.currentTuneBook,
    setCurrentTuneBook: props.setCurrentTuneBook,
    token: props.token,
    requestGoogleScopes: props.requestGoogleScopes,
    login: props.login,
    mediaController: props.mediaController,
    routeMode: true,
    onRouteClose: handleRouteClose,
  }

  if (modalType === 'sheet-image') {
    return <ImportSheetImageModal {...sharedProps} />
  }
  if (modalType === 'chord-sheet') {
    return <ImportChordSheetModal {...sharedProps} />
  }
  if (modalType === 'chord-url') {
    return <ImportChordUrlModal {...sharedProps} />
  }

  return null
}
