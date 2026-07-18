import { useEffect, useRef } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  buildSearchFilterParams,
  hasAnySearchFilterParams,
  onlyTextFilterDiffers,
  parseSearchFilterParams,
  SEARCH_FILTER_PARAM_KEYS,
} from './searchFilterParams'
import { buildPathWithSearch } from './routeSyncUtils'

function serializeParams(params) {
  return SEARCH_FILTER_PARAM_KEYS.map(function(key) {
    return key + '=' + (params[key] == null ? '' : params[key])
  }).join('&')
}

export function isSearchListRoute(pathname) {
  return pathname === '/tunes' || pathname === '/tunes/check'
}

/**
 * Keeps the tune list search criteria (book, tags, genres, artists, text filter,
 * groupBy) in sync with the URL query string on /tunes so browser history
 * restores the list that was on screen.
 *
 * - Filter state changes push a history entry (text filter changes use replace
 *   so typing does not flood history).
 * - Back/forward (URL changes) are applied back onto the filter state.
 * - Arriving on /tunes without filter params writes the current state into the
 *   URL with replace, so the URL always describes the visible list.
 */
export default function useSearchFilterRouteSync(props) {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const onListRoute = isSearchListRoute(location.pathname)

  // Last URL param set observed/applied while on the list route.
  const lastUrlKeyRef = useRef(null)
  // URL param set applied to state, until state catches up.
  const pendingApplyRef = useRef(null)
  // State param set written to the URL, until the location catches up.
  const pendingWriteRef = useRef(null)

  const currentTuneBook = props.currentTuneBook
  const filter = props.filter
  const tagFilter = props.tagFilter
  const genreFilter = props.genreFilter
  const artistFilter = props.artistFilter
  const groupBy = props.groupBy
  const setCurrentTuneBook = props.setCurrentTuneBook
  const setFilter = props.setFilter
  const setTagFilter = props.setTagFilter
  const setGenreFilter = props.setGenreFilter
  const setArtistFilter = props.setArtistFilter
  const setGroupBy = props.setGroupBy

  useEffect(function() {
    if (!onListRoute) {
      lastUrlKeyRef.current = null
      pendingApplyRef.current = null
      pendingWriteRef.current = null
      return
    }

    const parsed = parseSearchFilterParams(searchParams)
    const urlParams = buildSearchFilterParams({
      currentTuneBook: parsed.book,
      tagFilter: parsed.tags,
      genreFilter: parsed.genres,
      artistFilter: parsed.artists,
      filter: parsed.q,
      groupBy: parsed.group,
    })
    const stateParams = buildSearchFilterParams({
      currentTuneBook: currentTuneBook,
      tagFilter: tagFilter,
      genreFilter: genreFilter,
      artistFilter: artistFilter,
      filter: filter,
      groupBy: groupBy,
    })
    const urlKey = serializeParams(urlParams)
    const stateKey = serializeParams(stateParams)

    function applyUrlToState() {
      if (urlParams.book !== stateParams.book) setCurrentTuneBook(parsed.book)
      if (urlParams.q !== stateParams.q) setFilter(parsed.q)
      if (urlParams.tags !== stateParams.tags) setTagFilter(parsed.tags)
      if (urlParams.genres !== stateParams.genres) setGenreFilter(parsed.genres)
      if (urlParams.artists !== stateParams.artists) setArtistFilter(parsed.artists)
      if (urlParams.group !== stateParams.group) setGroupBy(parsed.group)
      pendingApplyRef.current = urlKey
      lastUrlKeyRef.current = urlKey
    }

    function writeStateToUrl(replace) {
      pendingWriteRef.current = stateKey
      navigate(buildPathWithSearch(location.pathname, searchParams, stateParams), { replace: !!replace })
    }

    if (urlKey === stateKey) {
      lastUrlKeyRef.current = urlKey
      pendingApplyRef.current = null
      pendingWriteRef.current = null
      return
    }

    // A URL->state apply is in flight; wait for state to catch up.
    if (pendingApplyRef.current === urlKey) return

    if (lastUrlKeyRef.current === null) {
      // First render on the list route.
      if (hasAnySearchFilterParams(searchParams)) {
        applyUrlToState()
      } else {
        // Normalize the URL to describe current state (eg book from localStorage).
        writeStateToUrl(true)
      }
      return
    }

    if (urlKey !== lastUrlKeyRef.current) {
      // URL changed underneath us (back/forward navigation).
      applyUrlToState()
      return
    }

    // Filter state changed while on the route; reflect it in the URL.
    if (pendingWriteRef.current === stateKey) return
    writeStateToUrl(onlyTextFilterDiffers(urlParams, stateParams))
  }, [
    onListRoute,
    location.pathname,
    searchParams,
    navigate,
    currentTuneBook,
    filter,
    tagFilter,
    genreFilter,
    artistFilter,
    groupBy,
    setCurrentTuneBook,
    setFilter,
    setTagFilter,
    setGenreFilter,
    setArtistFilter,
    setGroupBy,
  ])
}
