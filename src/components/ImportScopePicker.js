import { Button, ListGroup, Badge } from 'react-bootstrap'
import {
  booksForTune,
  countTunesInBook,
  tuneIdsForSet,
  tuneIdsForPlaylist,
} from '../shareTunebookUtils'

function optionLabel(title, subtitle, recommended) {
  return (
    <div className="import-scope-option">
      <div>
        <strong>{title}</strong>
        {recommended ? <Badge bg="success" className="ms-2">Suggested</Badge> : null}
      </div>
      {subtitle ? <div className="text-muted small">{subtitle}</div> : null}
    </div>
  )
}

function setImportSubtitle(setRecord, tunes) {
  const tuneIds = tuneIdsForSet(setRecord)
  if (tuneIds.length === 0) return 'Set only (no tunes in this set)'
  const found = tuneIds.filter(function(id) { return tunes && tunes[id] }).length
  if (found === tuneIds.length) {
    return 'Imports set and ' + tuneIds.length + ' tune(s)'
  }
  return 'Imports set and ' + found + ' of ' + tuneIds.length + ' tune(s) found in shared book'
}

function playlistImportSubtitle(playlistRecord, tunes) {
  const tuneIds = tuneIdsForPlaylist(playlistRecord)
  if (tuneIds.length === 0) return 'Playlist only (no tunes in this playlist)'
  const found = tuneIds.filter(function(id) { return tunes && tunes[id] }).length
  if (found === tuneIds.length) {
    return 'Imports playlist and ' + tuneIds.length + ' tune(s)'
  }
  return 'Imports playlist and ' + found + ' of ' + tuneIds.length + ' tune(s) found in shared book'
}

function countTunesWithTag(tunes, tagName) {
  if (!tunes || !tagName) return 0
  return Object.values(tunes).filter(function(tune) {
    return tune && Array.isArray(tune.tags) && tune.tags.indexOf(tagName) !== -1
  }).length
}

function wholeSongbookOption(tunes, sets, playlists, recommended) {
  const tuneList = Object.values(tunes).filter(function(t) { return t && t.id })
  const setCount = Object.keys(sets).length
  const playlistCount = Object.keys(playlists).length
  let subtitle = tuneList.length + ' tune(s)'
  if (setCount) subtitle += ', ' + setCount + ' set(s)'
  if (playlistCount) subtitle += ', ' + playlistCount + ' playlist(s)'
  return {
    id: 'all',
    scope: 'all',
    recommended: !!recommended,
    title: 'Import whole songbook',
    subtitle: subtitle,
  }
}

export function buildImportScopeOptions(preview, context) {
  const tunes = preview && preview.tunes ? preview.tunes : {}
  const sets = preview && preview.sets ? preview.sets : {}
  const playlists = preview && preview.playlists ? preview.playlists : {}
  const ctx = context || {}
  const options = []

  if (ctx.scopeHint === 'tag' && ctx.tagName) {
    options.push({
      id: 'tag:' + ctx.tagName,
      scope: 'tag',
      tagName: ctx.tagName,
      recommended: true,
      title: 'Import tag: ' + ctx.tagName,
      subtitle: countTunesWithTag(tunes, ctx.tagName) + ' tune(s)',
    })
    options.push(wholeSongbookOption(tunes, sets, playlists, false))
    return options
  }

  if (ctx.scopeHint === 'playlist' && ctx.playlistId) {
    const playlistRecord = playlists[ctx.playlistId]
    if (playlistRecord) {
      options.push({
        id: 'playlist:' + ctx.playlistId,
        scope: 'playlist',
        playlistId: ctx.playlistId,
        recommended: true,
        title: 'Import playlist: ' + (playlistRecord.name || ctx.playlistId),
        subtitle: playlistImportSubtitle(playlistRecord, tunes),
      })
    }
    options.push(wholeSongbookOption(tunes, sets, playlists, !playlistRecord))
    return options
  }

  if (ctx.scopeHint === 'set' && ctx.setId) {
    const setRecord = sets[ctx.setId]
    if (setRecord) {
      options.push({
        id: 'set:' + ctx.setId,
        scope: 'set',
        setId: ctx.setId,
        recommended: true,
        title: 'Import set: ' + (setRecord.name || ctx.setId),
        subtitle: setImportSubtitle(setRecord, tunes),
      })
    }
    options.push(wholeSongbookOption(tunes, sets, playlists, !setRecord))
    return options
  }

  if (ctx.tuneId && tunes[ctx.tuneId]) {
    const tune = tunes[ctx.tuneId]
    options.push({
      id: 'tune:' + ctx.tuneId,
      scope: 'tune',
      tuneId: ctx.tuneId,
      recommended: ctx.scopeHint === 'tune',
      title: 'Import this tune',
      subtitle: tune.name || ctx.tuneId,
    })
    booksForTune(tunes, ctx.tuneId).forEach(function(bookName) {
      options.push({
        id: 'book:' + bookName,
        scope: 'book',
        bookName: bookName,
        recommended: ctx.scopeHint === 'book' && ctx.bookName === bookName,
        title: 'Import book: ' + bookName,
        subtitle: countTunesInBook(tunes, bookName) + ' tune(s)',
      })
    })
  }

  if (ctx.bookName && !options.some(function(o) { return o.scope === 'book' && o.bookName === ctx.bookName })) {
    options.push({
      id: 'book:' + ctx.bookName,
      scope: 'book',
      bookName: ctx.bookName,
      recommended: ctx.scopeHint === 'book',
      title: 'Import book: ' + ctx.bookName,
      subtitle: countTunesInBook(tunes, ctx.bookName) + ' tune(s)',
    })
  }

  Object.keys(sets).sort().forEach(function(setId) {
    const setRecord = sets[setId]
    options.push({
      id: 'set:' + setId,
      scope: 'set',
      setId: setId,
      recommended: false,
      title: 'Import set: ' + (setRecord.name || setId),
      subtitle: setImportSubtitle(setRecord, tunes),
    })
  })

  Object.keys(playlists).sort().forEach(function(playlistId) {
    const playlistRecord = playlists[playlistId]
    options.push({
      id: 'playlist:' + playlistId,
      scope: 'playlist',
      playlistId: playlistId,
      recommended: false,
      title: 'Import playlist: ' + (playlistRecord.name || playlistId),
      subtitle: playlistImportSubtitle(playlistRecord, tunes),
    })
  })

  options.push(wholeSongbookOption(tunes, sets, playlists, ctx.scopeHint === 'all'))

  return options
}

export default function ImportScopePicker({ preview, context, busy, onSelect, onCancel }) {
  const options = buildImportScopeOptions(preview, context)

  return (
    <div className="import-scope-picker">
      <p>Choose what to import from this shared tunebook:</p>
      <ListGroup className="mb-3">
        {options.map(function(option) {
          return (
            <ListGroup.Item
              key={option.id}
              action
              disabled={busy}
              onClick={function() { onSelect(option) }}
            >
              {optionLabel(option.title, option.subtitle, option.recommended)}
            </ListGroup.Item>
          )
        })}
      </ListGroup>
      <Button variant="secondary" disabled={busy} onClick={onCancel}>Cancel</Button>
    </div>
  )
}
