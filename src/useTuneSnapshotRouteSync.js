import { useEffect, useRef } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { findTuneFileMeta, setActiveTuneFile, updateTuneFileMeta } from './tuneFiles'
import { replaceSearchParam } from './routeSyncUtils'

export function applyTuneSnapshotFromSearchParams(tune, searchParams) {
  if (!tune || !tune.id) return tune
  const fileId = String(searchParams.get('file') || '').trim()
  const page = parseInt(searchParams.get('page'), 10)
  if (!fileId) return tune
  const meta = findTuneFileMeta(tune, fileId)
  if (!meta) return tune
  let next = setActiveTuneFile(tune, fileId)
  if (page > 0) {
    next = updateTuneFileMeta(next, fileId, { pdfPage: page })
  }
  return next
}

export default function useTuneSnapshotRouteSync(tune, onTuneChange) {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const appliedRef = useRef('')
  const onTunePage = location.pathname.startsWith('/tunes/')
    && location.pathname !== '/tunes'
    && location.pathname !== '/tunes/check'

  useEffect(function() {
    appliedRef.current = ''
  }, [tune && tune.id])

  useEffect(function() {
    if (!onTunePage || !tune || !tune.id || !onTuneChange) return
    const fileId = String(searchParams.get('file') || '').trim()
    const pageRaw = searchParams.get('page')
    const page = parseInt(pageRaw, 10)
    if (!fileId) return
    const key = tune.id + ':' + fileId + ':' + String(pageRaw || '')
    if (appliedRef.current === key) return
    const meta = findTuneFileMeta(tune, fileId)
    if (!meta) return
    appliedRef.current = key
    const next = applyTuneSnapshotFromSearchParams(tune, searchParams)
    onTuneChange(next)
    replaceSearchParam(navigate, location.pathname, searchParams, {
      file: null,
      page: null,
    })
  }, [
    onTunePage,
    tune,
    tune && tune.id,
    searchParams,
    onTuneChange,
    navigate,
    location.pathname,
  ])
}
