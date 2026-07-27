import { useCallback, useEffect, useState } from 'react'
import { Button, ButtonGroup, ListGroup, Pagination, Spinner } from 'react-bootstrap'
import {
  createMusicCollectionMovePlan,
  fetchMusicCollectionDuplicates,
  setMusicCollectionTriage,
} from '../../musicCollectionCuratorClient'
import { mediaSearchPathStyle } from '../../mediaLinkSearchDisplay'
import MusicCollectionStreamPlayer from '../MusicCollectionStreamPlayer'

const PAGE_SIZE = 25

export default function CollectionCuratorDuplicates(props) {
  const [groups, setGroups] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async function() {
    setBusy(true)
    try {
      const body = await fetchMusicCollectionDuplicates({
        phase: props.phase,
        groupType: 'songKey',
        limit: PAGE_SIZE,
        offset: offset,
        accessToken: props.token,
      })
      setGroups(body.groups || [])
      setTotal(body.total || 0)
    } catch (e) {
      props.onError(e && e.message ? e.message : 'Could not load duplicates')
    } finally {
      setBusy(false)
    }
  }, [props.phase, props.token, props.onError, offset])

  useEffect(function() {
    load()
  }, [load])

  useEffect(function() {
    setOffset(0)
  }, [props.phase])

  async function confirmKeeper(group) {
    const keeperId = group.keeperId
    const losers = (group.members || []).filter(function(m) { return m.id !== keeperId })
    try {
      await setMusicCollectionTriage({ entryId: keeperId, status: 'keep', accessToken: props.token })
      for (let i = 0; i < losers.length; i++) {
        await setMusicCollectionTriage({ entryId: losers[i].id, status: 'cull', accessToken: props.token })
      }
      props.onMessage('Keeper confirmed for ' + (group.key || 'group'))
      await load()
    } catch (e) {
      props.onError(e && e.message ? e.message : 'Could not update group')
    }
  }

  async function planQuarantine() {
    try {
      const result = await createMusicCollectionMovePlan({
        type: 'duplicates',
        phase: props.phase,
        accessToken: props.token,
      })
      props.onMessage('Duplicate quarantine plan #' + result.planId + ' (' + (result.plan && result.plan.moveCount || 0) + ' moves)')
    } catch (e) {
      props.onError(e && e.message ? e.message : 'Move plan failed')
    }
  }

  const page = Math.floor(offset / PAGE_SIZE) + 1
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div>
      <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-2">
        <div className="small text-muted">{total} duplicate groups (same artist + title)</div>
        <Button size="sm" variant="outline-secondary" onClick={planQuarantine}>Plan duplicate quarantine</Button>
      </div>
      {busy ? <Spinner animation="border" size="sm" className="mb-2" /> : null}
      <ListGroup>
        {groups.map(function(group, index) {
          return (
            <ListGroup.Item key={(group.key || index) + ''}>
              <div className="d-flex flex-wrap gap-2 justify-content-between align-items-start mb-2">
                <div>
                  <div className="fw-semibold">{group.key}</div>
                  <div className="small text-muted">{group.size} copies · suggested keeper {group.keeperId}</div>
                </div>
                <ButtonGroup size="sm">
                  <Button variant="outline-primary" onClick={function() { confirmKeeper(group) }}>Confirm keeper</Button>
                </ButtonGroup>
              </div>
              {(group.members || []).map(function(member) {
                return (
                  <div key={member.id} className="border-top pt-2 mt-2">
                    <div className="small fw-semibold text-truncate">
                      {member.keeper ? '★ ' : ''}{member.title || 'Track'} — {member.artist || 'Unknown'}
                    </div>
                    <div className="small text-muted">
                      plays {member.playCount || 0} · {member.bitrate || '—'} kbps · BPM {member.bpm || '—'}
                    </div>
                    <div className="small text-truncate" style={mediaSearchPathStyle}>{member.path}</div>
                    <MusicCollectionStreamPlayer path={member.path} token={props.token} />
                  </div>
                )
              })}
            </ListGroup.Item>
          )
        })}
      </ListGroup>
      {pageCount > 1 ? (
        <Pagination className="mt-3 justify-content-center">
          <Pagination.Prev disabled={offset <= 0} onClick={function() { setOffset(Math.max(0, offset - PAGE_SIZE)) }} />
          <Pagination.Item active>{page} / {pageCount}</Pagination.Item>
          <Pagination.Next disabled={offset + PAGE_SIZE >= total} onClick={function() { setOffset(offset + PAGE_SIZE) }} />
        </Pagination>
      ) : null}
    </div>
  )
}
