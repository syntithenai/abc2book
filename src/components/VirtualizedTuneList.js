import { useRef, useEffect, useCallback, forwardRef } from 'react'
import { ListGroup } from 'react-bootstrap'
import { FixedSizeList } from 'react-window'
import AutoSizer from 'react-virtualized-auto-sizer'
import TuneListRow from './TuneListRow'
import MediaListRow from './MediaListRow'
import { getSearchRowKey, isMediaSearchRow } from '../searchListRows'

export const COMPACT_ROW_HEIGHT = 48
export const DETAILED_ROW_HEIGHT = 96

const TuneListScrollOuter = forwardRef(function TuneListScrollOuter({ style, ...rest }, ref) {
  return <div ref={ref} style={style} className="tune-list-scroll-root" {...rest} />
})

export default function VirtualizedTuneList(props) {
  const rows = props.rows || []
  const listRef = useRef(null)
  const rowHeight = props.rowHeight > 0 ? props.rowHeight : COMPACT_ROW_HEIGHT

  const scrollToOffset = useCallback(function(offset) {
    if (!listRef.current || typeof offset !== 'number' || offset <= 0) return
    listRef.current.scrollTo(offset)
  }, [])

  useEffect(function() {
    if (props.initialScrollOffset > 0) {
      scrollToOffset(props.initialScrollOffset)
    }
  }, [props.initialScrollOffset, scrollToOffset])

  if (rows.length === 0) {
    return <div style={{ clear: 'both', width: '100%', marginTop: '1em' }} />
  }

  function RowRenderer({ index, style }) {
    const row = rows[index]
    const rowKey = getSearchRowKey(row, index)
    if (isMediaSearchRow(row)) {
      return (
        <div style={style} className="virtualized-tune-list-row">
          <MediaListRow
            row={row}
            rowKey={rowKey}
            index={index}
            isCompact={props.isCompact}
            showRowExtras={props.showRowExtras}
            tunebook={props.tunebook}
            mediaController={props.mediaController}
            nowPlayingQueue={props.nowPlayingQueue}
            setNowPlayingQueue={props.setNowPlayingQueue}
            onAddToTunebook={props.onAddToTunebook}
            onMediaError={props.onMediaError}
            accessToken={props.accessToken}
          />
        </div>
      )
    }
    return (
      <div style={style} className="virtualized-tune-list-row">
        <TuneListRow
          row={row}
          index={index}
          isCompact={props.isCompact}
          isPreview={props.isPreview}
          showRowExtras={props.showRowExtras}
          showStarToggle={props.showStarToggle}
          showFilterChips={props.showFilterChips}
          selected={props.selected}
          tuneStatus={props.tuneStatus}
          tunebook={props.tunebook}
          setCurrentTune={props.setCurrentTune}
          currentTuneBook={props.currentTuneBook}
          tagFilter={props.tagFilter}
          onBookClick={props.onBookClick}
          onTagClick={props.onTagClick}
          onSelect={props.onSelect}
          forceRefresh={props.forceRefresh}
          mediaController={props.mediaController}
          tunes={props.tunes}
          nowPlayingQueue={props.nowPlayingQueue}
          setNowPlayingQueue={props.setNowPlayingQueue}
          setQueuePlayConfirm={props.setQueuePlayConfirm}
          nowPlayingTuneId={props.nowPlayingTuneId}
        />
      </div>
    )
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
                overscanCount={8}
                outerElementType={TuneListScrollOuter}
                onScroll={function(info) {
                  if (typeof props.onScrollOffset === 'function') {
                    props.onScrollOffset(info.scrollOffset)
                  }
                }}
              >
                {RowRenderer}
              </FixedSizeList>
            )
          }}
        </AutoSizer>
      </div>
    </ListGroup>
  )
}
