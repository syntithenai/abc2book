import { Link } from 'react-router-dom'
import { Button } from 'react-bootstrap'
import { ListGroup } from 'react-bootstrap'
import Abc from './Abc'
import BoostSettingsModal from './BoostSettingsModal'
import TuneListFilterChips from './TuneListFilterChips'
import { getLyricLines } from '../wLinesUtils'
import {
  buildSnapshotTuneLink,
  displayTitleForSearchRow,
} from '../pdfSnapshotIndex'

export default function TuneListRow(props) {
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

  const isCompact = props.isCompact
  const isPreview = props.isPreview
  const showRowExtras = props.showRowExtras
  const showChips = props.showChips
  const selected = props.selected || {}
  const tuneStatus = props.tuneStatus || {}

  return (
    <ListGroup.Item
      key={(tune.id || '') + '-' + tk + '-' + (snapshotMatch ? snapshotMatch.page : 'main')}
      className={'tune-list-item ' + ((tk % 2 === 0) ? 'even' : 'odd') + (isCompact ? ' tune-list-item-compact' : '')}
      style={{ borderTop: '2px solid black', borderLeft: '2px solid black', borderRight: '2px solid black' }}
    >
      <div className="tune-list-item-row">
        {showRowExtras && (
          <>
            {(selected[tune.id]) && (
              <Button className="tune-list-select-btn" variant="success" size="lg" aria-label="Selected" onClick={function(e) { props.onSelect(e, tune.id) }}>
                {props.tunebook.icons.check}
              </Button>
            )}
            {(!selected[tune.id]) && (
              <Button className="tune-list-select-btn" variant="secondary" size="lg" aria-label="Not selected" onClick={function(e) { props.onSelect(e, tune.id) }}>
                {props.tunebook.icons.check}
              </Button>
            )}
          </>
        )}
        <div className="tune-list-item-title-block">
          <span className="tune-list-item-title">
            <Link style={{ textDecoration: 'none', color: 'black' }} to={linkTo} onClick={function() { props.setCurrentTune(tune.id); props.tunebook.utils.scrollTo('topofpage', 10) }}>
              <Button variant="primary" size="lg">
                {displayTitle}
                {snapshotMatch ? <b>&nbsp;&nbsp;&nbsp;(PDF)</b> : null}
                {tune.type && !snapshotMatch ? <b>&nbsp;&nbsp;&nbsp;({tune.type.toLowerCase()})</b> : null}
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                <span style={{ fontSize: '0.5em' }}>
                  {snapshotMatch && snapshotMatch.composer ? ' - ' + snapshotMatch.composer : (tune.composer ? ' - ' + tune.composer : '')}
                </span>
              </Button>
            </Link>
          </span>
          {showParentSubtitle ? <div className="small text-muted px-1">in {parentName}</div> : null}
          {showChips ? (
            <TuneListFilterChips
              books={tune.books}
              tags={tune.tags}
              currentTuneBook={props.currentTuneBook}
              tagFilter={props.tagFilter}
              onBookClick={props.onBookClick}
              onTagClick={props.onTagClick}
            />
          ) : null}
        </div>
        {showRowExtras ? (
          <div className="tune-list-item-meta">
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
          </div>
        ) : null}
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
