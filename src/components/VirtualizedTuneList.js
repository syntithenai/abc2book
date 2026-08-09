import { useRef, useCallback, forwardRef, memo, useMemo } from 'react'
import { ListGroup } from 'react-bootstrap'
import { FixedSizeList } from 'react-window'
import AutoSizer from 'react-virtualized-auto-sizer'
import TuneListRow from './TuneListRow'
import MediaListRow from './MediaListRow'
import SearchListSectionHeader from './SearchListSectionHeader'
import { getSearchRowKey, isMediaSearchRow, isSearchSectionHeaderRow } from '../searchListRows'

export const COMPACT_ROW_HEIGHT = 48
export const DETAILED_ROW_HEIGHT = 96

const TuneListScrollOuter = forwardRef(function TuneListScrollOuter({ style, ...rest }, ref) {
  return <div ref={ref} style={style} className="tune-list-scroll-root" {...rest} />
})

function VirtualizedRow({ index, style, data }) {
  const row = data.rows[index]
  const rowKey = getSearchRowKey(row, index)
  if (isSearchSectionHeaderRow(row)) {
    return (
      <div style={style} className="virtualized-tune-list-row">
        <SearchListSectionHeader label={row.label} />
      </div>
    )
  }
  if (isMediaSearchRow(row)) {
    return (
      <div style={style} className="virtualized-tune-list-row">
        <MediaListRow
          row={row}
          rowKey={rowKey}
          index={index}
          isCompact={data.isCompact}
          showRowExtras={data.showRowExtras}
          tunebook={data.tunebook}
          mediaControllerRef={data.mediaControllerRef}
          mediaController={data.mediaControllerRef && data.mediaControllerRef.current}
          tunes={data.tunes}
          setCurrentTune={data.setCurrentTune}
          nowPlayingTuneId={data.nowPlayingTuneId}
          nowPlayingQueue={data.nowPlayingQueue}
          setNowPlayingQueue={data.setNowPlayingQueue}
          onAddToTunebook={data.onAddToTunebook}
          onMediaError={data.onMediaError}
          onBrowseArtist={data.onBrowseArtist}
          accessToken={data.accessToken}
          resolverAvailable={data.resolverAvailable}
          searchIndex={data.searchIndex}
          loadTuneTexts={data.loadTuneTexts}
          forceRefresh={data.forceRefresh}
        />
      </div>
    )
  }
  return (
    <div style={style} className="virtualized-tune-list-row">
      <TuneListRow
        row={row}
        index={index}
        isCompact={data.isCompact}
        isPreview={data.isPreview}
        showRowExtras={data.showRowExtras}
        showStarToggle={data.showStarToggle}
        showFilterChips={data.showFilterChips}
        selected={data.selected}
        tuneStatus={data.tuneStatus}
        tunebook={data.tunebook}
        setCurrentTune={data.setCurrentTune}
        currentTuneBook={data.currentTuneBook}
        tagFilter={data.tagFilter}
        onBookClick={data.onBookClick}
        onTagClick={data.onTagClick}
        onSelect={data.onSelect}
        forceRefresh={data.forceRefresh}
        mediaControllerRef={data.mediaControllerRef}
        tunes={data.tunes}
        nowPlayingQueue={data.nowPlayingQueue}
        setNowPlayingQueue={data.setNowPlayingQueue}
        setQueuePlayConfirm={data.setQueuePlayConfirm}
        nowPlayingTuneId={data.nowPlayingTuneId}
      />
    </div>
  )
}

function VirtualizedTuneList(props) {
  const rows = props.rows || []
  const listRef = useRef(null)
  const rowHeight = props.rowHeight > 0 ? props.rowHeight : COMPACT_ROW_HEIGHT

  const itemData = useMemo(function() {
    return {
      rows: rows,
      isCompact: props.isCompact,
      isPreview: props.isPreview,
      showRowExtras: props.showRowExtras,
      showStarToggle: props.showStarToggle,
      showFilterChips: props.showFilterChips,
      selected: props.selected,
      tuneStatus: props.tuneStatus,
      tunebook: props.tunebook,
      setCurrentTune: props.setCurrentTune,
      currentTuneBook: props.currentTuneBook,
      tagFilter: props.tagFilter,
      onBookClick: props.onBookClick,
      onTagClick: props.onTagClick,
      onSelect: props.onSelect,
      forceRefresh: props.forceRefresh,
      mediaControllerRef: props.mediaControllerRef,
      tunes: props.tunes,
      nowPlayingQueue: props.nowPlayingQueue,
      setNowPlayingQueue: props.setNowPlayingQueue,
      setQueuePlayConfirm: props.setQueuePlayConfirm,
      nowPlayingTuneId: props.nowPlayingTuneId,
      onAddToTunebook: props.onAddToTunebook,
      onMediaError: props.onMediaError,
      onBrowseArtist: props.onBrowseArtist,
      accessToken: props.accessToken,
      resolverAvailable: props.resolverAvailable,
      searchIndex: props.searchIndex,
      loadTuneTexts: props.loadTuneTexts,
    }
  }, [
    rows,
    props.isCompact,
    props.isPreview,
    props.showRowExtras,
    props.showStarToggle,
    props.showFilterChips,
    props.selected,
    props.tuneStatus,
    props.tunebook,
    props.setCurrentTune,
    props.currentTuneBook,
    props.tagFilter,
    props.onBookClick,
    props.onTagClick,
    props.onSelect,
    props.forceRefresh,
    props.mediaControllerRef,
    props.tunes,
    props.nowPlayingQueue,
    props.setNowPlayingQueue,
    props.setQueuePlayConfirm,
    props.nowPlayingTuneId,
    props.onAddToTunebook,
    props.onMediaError,
    props.onBrowseArtist,
    props.accessToken,
    props.resolverAvailable,
    props.searchIndex,
    props.loadTuneTexts,
  ])

  const rowRenderer = useCallback(function(rendererProps) {
    return <VirtualizedRow index={rendererProps.index} style={rendererProps.style} data={rendererProps.data} />
  }, [])

  if (rows.length === 0) {
    return <div style={{ clear: 'both', width: '100%', marginTop: '1em' }} />
  }

  const listHeight = Math.min(
    rows.length * rowHeight,
    typeof props.maxHeight === 'number' && props.maxHeight > 0 ? props.maxHeight : 720
  )

  return (
    <ListGroup id={props.listId || 'tune-index'} style={{ clear: 'both', width: '100%' }} className="virtualized-tune-list">
      <div style={{ height: listHeight, width: '100%' }}>
        <AutoSizer disableHeight>
          {function({ width }) {
            return (
              <FixedSizeList
                ref={listRef}
                height={listHeight}
                width={width}
                itemCount={rows.length}
                itemSize={rowHeight}
                itemData={itemData}
                overscanCount={8}
                outerElementType={TuneListScrollOuter}
              >
                {rowRenderer}
              </FixedSizeList>
            )
          }}
        </AutoSizer>
      </div>
    </ListGroup>
  )
}

export default memo(VirtualizedTuneList)
