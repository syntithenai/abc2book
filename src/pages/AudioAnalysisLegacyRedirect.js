import { Navigate, useLocation } from 'react-router-dom'

/** Legacy `/tuner/audioanalysis` → dedicated `/audioanalysis` page. */
export default function AudioAnalysisLegacyRedirect() {
  const location = useLocation()
  return <Navigate to={'/audioanalysis' + (location.search || '')} replace />
}
