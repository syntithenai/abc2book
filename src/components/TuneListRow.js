import { memo } from 'react'
import { Link } from 'react-router-dom'
import { Button } from 'react-bootstrap'
import { ListGroup } from 'react-bootstrap'
import Abc from './Abc'
import BoostSettingsModal from './BoostSettingsModal'
import StarToggleButton from './StarToggleButton'
import TuneListFilterChips from './TuneListFilterChips'
import { getLyricLines } from '../wLinesUtils'
import TuneListPlaybackButtons from './TuneListPlaybackButtons'
import CheckToggleButton from './CheckToggleButton'
import {
  buildSnapshotTuneLink,
  displayTitleForSearchRow,
} from '../pdfSnapshotIndex'

function TuneListRow(props) {
  const row = props.row
  const tk = props.index
  const tune = row && row.tune
  const snapshotMatch = row && row.snapshotMatch
  const displayTitle = displayTitleForSearchRow(row)
  const linkTo = buildSnapshotTuneLink(tune && tune.id, snapshotMatch)
  const parentName = tune && tune.name && String(tune.name).trim()
  const showParentSubtitle = !!(snapshotMatch && parentName && (
    snapshotMatch.matchKind === 'segment'
      ? parentName.toLowerCase() !== displayTitle.toLowerCase()
      : true
  ))

  if (!tune || !tune.id) return null

  const liveTune = (props.tunes && props.tunes[tune.id]) || tune

  const isCompact = props.isCompact
  const isPreview = props.isPreview
  const showRowExtras = props.showRowExtras
  const showStarToggle = props.showStarToggle
  const showFilterChips = props.showFilterChips !== false
  const selected = props.selected || {}
  const tuneStatus = props.tuneStatus || {}

  const filterChips = showFilterChips ? (
    <TuneListFilterChips
      books={tune.books}
      tags={tune.tags}
      currentTuneBook={props.currentTuneBook}
      tagFilter={props.tagFilter}
      onBookClick={props.onBookClick}
      onTagClick={props.onTagClick}
    />
  ) : null

  const composerLabel = snapshotMatch && snapshotMatch.composer
    ? snapshotMatch.composer
    : (tune.composer || '')

  const isNowPlaying = props.nowPlayingTuneId && tune.id === props.nowPlayingTuneId

  const playButtons = (
    <TuneListPlaybackButtons
      tune={tune}
      tunebook={props.tunebook}
      mediaControllerRef={props.mediaControllerRef}
      tunes={props.tunes}
      nowPlayingQueue={props.nowPlayingQueue}
      setNowPlayingQueue={props.setNowPlayingQueue}
      setQueuePlayConfirm={props.setQueuePlayConfirm}
      setCurrentTune={props.setCurrentTune}
      nowPlayingTuneId={props.nowPlayingTuneId}
      className="tune-list-item-play"
      buttonSize={showRowExtras ? 'lg' : undefined}
    />
  )

  return (
    <ListGroup.Item
      key={(tune.id || '') + '-' + tk + '-' + (snapshotMatch ? snapshotMatch.page : 'main')}
      className={'tune-list-item ' + ((tk % 2 === 0) ? 'even' : 'odd') + (isCompact ? ' tune-list-item-compact' : ' tune-list-item-detailed') + (isNowPlaying ? ' tune-list-item--now-playing' : '')}
      style={{ borderTop: '2px solid black', borderLeft: '2px solid black', borderRight: '2px solid black' }}
    >
      <div className="tune-list-item-row">
        {showRowExtras && (
          <CheckToggleButton
            className="tune-list-select-btn"
            checked={!!selected[tune.id]}
            size="lg"
            ariaLabel={selected[tune.id] ? 'Selected' : 'Not selected'}
            onClick={function(e) { props.onSelect(e, tune.id) }}
          />
        )}
        <div className="tune-list-item-title-block">
          <span className="tune-list-item-title">
            <Link
              className={'tune-list-title-link' + (isCompact ? ' tune-list-title-link--compact' : '')}
              to={linkTo}
              onClick={function() { props.setCurrentTune(tune.id); props.tunebook.utils.scrollTo('topofpage', 10) }}
            >
              <span className="tune-list-title-text">
                <span className="tune-list-title-name">{displayTitle}</span>
                {composerLabel ? (
                  <span className="tune-list-title-composer">
                    <span className="tune-list-title-sep" aria-hidden="true"> — </span>
                    {composerLabel}
                  </span>
                ) : null}
              </span>
              {snapshotMatch ? <span className="tune-list-title-badge">PDF</span> : null}
              {tune.type && !snapshotMatch ? (
                <span className="tune-list-title-badge">{String(tune.type).toLowerCase()}</span>
              ) : null}
            </Link>
          </span>
          {showParentSubtitle ? <div className="small text-muted px-1">in {parentName}</div> : null}
        </div>
        <div className="tune-list-item-meta">
          {isCompact ? playButtons : null}
          {showRowExtras ? (
            <>
              <span className="tune-list-item-icons">
                <span>{(tuneStatus[tune.id] && tuneStatus[tune.id].hasNotes) ? <Button variant="outline-primary" aria-label="Has music notation">{props.tunebook.icons.music}</Button> : null}</span>
                <span>{(tuneStatus[tune.id] && tuneStatus[tune.id].hasChords) ? <Button variant="outline-primary" aria-label="Has chords">{props.tunebook.icons.guitar}</Button> : null}</span>
                <span>{(tuneStatus[tune.id] && tuneStatus[tune.id].hasLyrics) ? <Button variant="outline-primary" aria-label="Has lyrics">{props.tunebook.icons.quillpen}</Button> : null}</span>
                <span>{(tuneStatus[tune.id] && tuneStatus[tune.id].hasLinks) ? <Button variant="outline-primary" aria-label="Has media links">{props.tunebook.icons.link}</Button> : null}</span>
              </span>
              <span className="tune-list-boost">
                <BoostSettingsModal
                  tunebook={props.tunebook}
                  value={tune.boost}
                  onChange={function(val) { tune.boost = val; props.tunebook.saveTune(tune); props.forceRefresh() }}
                  difficulty={tune.difficulty > 0 ? tune.difficulty : 0}
                  onChangeDifficulty={function(val) { tune.difficulty = val; props.tunebook.saveTune(tune); props.forceRefresh() }}
                />
              </span>
              {tune.tempo ? <Button className="tune-list-meta-chip" variant="outline-info">{tune.tempo}</Button> : ''}
              {tune.meter && <Button className="tune-list-meta-chip" variant="outline-success">{tune.meter}</Button>}
              {tune.key && <Button className="tune-list-meta-chip" variant="outline-success">{tune.key}</Button>}
            </>
          ) : null}
          {showStarToggle ? (
            <StarToggleButton
              className="tune-list-star-btn"
              tunebook={props.tunebook}
              tune={liveTune}
              forceRefresh={props.forceRefresh}
            />
          ) : null}
          {isCompact && filterChips ? <div className="tune-list-item-filter-chips tune-list-item-filter-chips--inline">{filterChips}</div> : null}
          {!isCompact ? playButtons : null}
        </div>
        {!isCompact && filterChips ? <div className="tune-list-item-filter-chips">{filterChips}</div> : null}
      </div>

      {isPreview && <Abc link={true} scale="0.7" abc={props.tunebook.abcTools.json2abc_cheatsheet(tune)} tunebook={props.tunebook} />}
      {isPreview && (
        <div>
          {getLyricLines(tune).slice(0, 5).map(function(line, lk) { return <div key={lk}>{line}</div> })}
        </div>
      )}
    </ListGroup.Item>
  )
}

export default memo(TuneListRow, function tuneListRowPropsEqual(prev, next) {
  const prevId = prev.row && prev.row.tune && prev.row.tune.id
  const nextId = next.row && next.row.tune && next.row.tune.id
  if (prevId !== nextId) return false
  if (prev.index !== next.index) return false
  if (prev.nowPlayingTuneId !== next.nowPlayingTuneId) return false
  if (prev.isCompact !== next.isCompact) return false
  if (prev.isPreview !== next.isPreview) return false
  if (prev.showRowExtras !== next.showRowExtras) return false
  if (prev.showStarToggle !== next.showStarToggle) return false
  if (prev.showFilterChips !== next.showFilterChips) return false
  if (prev.selected !== next.selected) return false
  if (prevId && (prev.tuneStatus && prev.tuneStatus[prevId]) !== (next.tuneStatus && next.tuneStatus[nextId])) return false
  return true
})
