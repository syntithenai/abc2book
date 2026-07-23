import {Outlet, useLocation} from 'react-router-dom'
import IndexLayout from '../components/IndexLayout'
import { PRACTICE_PAGE_TITLE_BASE, SEARCH_PAGE_TITLE_BASE } from '../pageTitle'

export default function MusicPage(props) {
    const location = useLocation()
    const searchTitleBase = location.pathname.startsWith('/practice')
      ? PRACTICE_PAGE_TITLE_BASE
      : SEARCH_PAGE_TITLE_BASE
    return <div className="music-page">
       <Outlet/>
       <IndexLayout mediaController={props.mediaController} googleDocumentId={props.googleDocumentId} token={props.token} tunes={props.tunes}  setCurrentTune={props.setCurrentTune} tunesHash={props.tunesHash} tunesContentRevision={props.tunesContentRevision} tunebook={props.tunebook} forceRefresh={props.forceRefresh} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  blockKeyboardShortcuts={props.blockKeyboardShortcuts} setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}  nowPlayingQueue={props.nowPlayingQueue} setNowPlayingQueue={props.setNowPlayingQueue} scrollOffset={props.scrollOffset} setScrollOffset={props.setScrollOffset} filter={props.filter} setFilter={props.setFilter} groupBy={props.groupBy} setGroupBy={props.setGroupBy} tagFilter={props.tagFilter} setTagFilter={props.setTagFilter} genreFilter={props.genreFilter} setGenreFilter={props.setGenreFilter} artistFilter={props.artistFilter} setArtistFilter={props.setArtistFilter} starredFilter={props.starredFilter} setStarredFilter={props.setStarredFilter}   selected={props.selected} setSelected={props.setSelected} lastSelected={props.lastSelected} setLastSelected={props.setLastSelected} selectedCount={props.selectedCount} setSelectedCount={props.setSelectedCount} filtered={props.filtered} setFiltered={props.setFiltered} grouped={props.grouped} setGrouped={props.setGrouped}  tuneStatus={props.tuneStatus} setTuneStatus={props.setTuneStatus}  listHash={props.listHash} setListHash={props.setListHash} startWaiting={props.startWaiting} stopWaiting={props.stopWaiting} waiting={props.waiting} searchIndex={props.searchIndex} loadTuneTexts={props.loadTuneTexts}  listDisplayMode={props.listDisplayMode} setListDisplayMode={props.setListDisplayMode}  tagCollation={props.tagCollation} setTagCollation={props.setTagCollation} searchTitleBase={searchTitleBase} />
    </div>
}
