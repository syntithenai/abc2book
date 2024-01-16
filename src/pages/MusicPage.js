import {Link, Outlet , useParams, useNavigate } from 'react-router-dom'
import {Button} from 'react-bootstrap'
import MusicLayout from '../components/MusicLayout'
import IndexLayout from '../components/IndexLayout'
import {useEffect, useState} from 'react'
export default function MusicPage(props) {
    const params = useParams()
    const navigate = useNavigate()
    useEffect(function() {
        var currentTuneKey = props.mediaPlaylist && props.mediaPlaylist.currentTune > props.mediaPlaylist.currentTune ? parseInt(props.mediaPlaylist.currentTune) : 0
        // if param doesn't match playlist, navigate to tune from playlist current item
        if (props.mediaPlaylist && props.mediaPlaylist.tunes && props.mediaPlaylist.tunes.length > currentTuneKey && props.mediaPlaylist.tunes[currentTuneKey]) {
            var shouldBe = props.mediaPlaylist.tunes[currentTuneKey].id
            if (shouldBe && params.tuneId != shouldBe) {
                navigate('/tunes/'+shouldBe+"/playMedia/0")
            }
        }
    }, [props.mediaPlaylist])
    
    return <div className="music-page">
       <Outlet/>
       <IndexLayout googleDocumentId={props.googleDocumentId} token={props.token} tunes={props.tunes}  setCurrentTune={props.setCurrentTune} tunesHash={props.tunesHash}  tunebook={props.tunebook} forceRefresh={props.forceRefresh} currentTuneBook={props.currentTuneBook} setCurrentTuneBook={props.setCurrentTuneBook}  blockKeyboardShortcuts={props.blockKeyboardShortcuts} setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}  mediaPlaylist={props.mediaPlaylist} setMediaPlaylist={props.setMediaPlaylist} scrollOffset={props.scrollOffset} setScrollOffset={props.setScrollOffset}  abcPlaylist={props.abcPlaylist} setAbcPlaylist={props.setAbcPlaylist} filter={props.filter} setFilter={props.setFilter} groupBy={props.groupBy} setGroupBy={props.setGroupBy} tagFilter={props.tagFilter} setTagFilter={props.setTagFilter}   selected={props.selected} setSelected={props.setSelected} lastSelected={props.lastSelected} setLastSelected={props.setLastSelected} selectedCount={props.selectedCount} setSelectedCount={props.setSelectedCount} filtered={props.filtered} setFiltered={props.setFiltered} grouped={props.grouped} setGrouped={props.setGrouped}  tuneStatus={props.tuneStatus} setTuneStatus={props.setTuneStatus}  listHash={props.listHash} setListHash={props.setListHash} startWaiting={props.startWaiting} stopWaiting={props.stopWaiting} searchIndex={props.searchIndex} loadTuneTexts={props.loadTuneTexts}  showPreviewInList={props.showPreviewInList} setShowPreviewInList={props.setShowPreviewInList}  tagCollation={props.tagCollation} setTagCollation={props.setTagCollation} />
    </div>
}
