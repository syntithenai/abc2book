import { useCallback, useEffect, useState } from 'react'
import { Spinner } from 'react-bootstrap'
import { fetchMusicCollectionTree } from '../musicCollectionCuratorClient'
import { formatMusicCollectionBrowseError } from '../musicCollectionBrowseAccess'

function TreeFolderRow(props) {
  const folder = props.folder || {}
  const path = String(folder.path || '')
  const name = String(folder.name || path.split('/').pop() || path)
  const open = props.open
  const active = props.selectedPath === path

  return (
    <div className="mc-folder-tree-row" style={{ paddingLeft: (props.depth * 14) + 'px' }}>
      <button
        type="button"
        className={'mc-folder-tree-toggle' + (open ? ' mc-folder-tree-toggle--open' : '')}
        aria-expanded={open}
        aria-label={open ? 'Collapse folder' : 'Expand folder'}
        onClick={function(e) {
          e.stopPropagation()
          props.onToggle(path)
        }}
      >
        ▶
      </button>
      <button
        type="button"
        className={'mc-folder-tree-label' + (active ? ' mc-folder-tree-label--active' : '')}
        onClick={function() { props.onSelect(path) }}
      >
        <span className="mc-folder-tree-name">{name}</span>
        <span className="mc-folder-tree-count">{folder.trackCount || 0}</span>
      </button>
    </div>
  )
}

function TreeBranch(props) {
  const path = props.path
  const node = props.nodes[path] || { folders: [], busy: false, loaded: false }

  return (
    <div className="mc-folder-tree-children">
      {node.busy ? <Spinner animation="border" size="sm" className="ms-3 my-1" /> : null}
      {(node.folders || []).map(function(folder) {
        const childPath = folder.path
        const childOpen = props.expanded.has(childPath)
        return (
          <div key={childPath}>
            <TreeFolderRow
              folder={folder}
              depth={props.depth + 1}
              open={childOpen}
              selectedPath={props.selectedPath}
              onToggle={props.onToggle}
              onSelect={props.onSelect}
            />
            {childOpen ? (
              <TreeBranch
                path={childPath}
                depth={props.depth + 1}
                nodes={props.nodes}
                expanded={props.expanded}
                selectedPath={props.selectedPath}
                onToggle={props.onToggle}
                onSelect={props.onSelect}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

export default function MusicCollectionFolderTree(props) {
  const [nodes, setNodes] = useState({ '': { folders: [], tracks: [], busy: false, loaded: false } })
  const [expanded, setExpanded] = useState(new Set())
  const [error, setError] = useState('')

  const loadNode = useCallback(async function(prefix) {
    const key = prefix || ''
    setNodes(function(prev) {
      const next = Object.assign({}, prev)
      next[key] = Object.assign({}, next[key] || {}, { busy: true })
      return next
    })
    try {
      const body = await fetchMusicCollectionTree({
        prefix: prefix,
        query: props.query,
        accessToken: props.token,
      })
      setNodes(function(prev) {
        const next = Object.assign({}, prev)
        next[key] = {
          folders: body.folders || [],
          tracks: body.tracks || [],
          busy: false,
          loaded: true,
        }
        return next
      })
    } catch (e) {
      setError(formatMusicCollectionBrowseError(e))
      setNodes(function(prev) {
        const next = Object.assign({}, prev)
        next[key] = Object.assign({}, next[key] || {}, { busy: false, loaded: true })
        return next
      })
    }
  }, [props.query, props.token])

  useEffect(function() {
    if (props.rootData) {
      setNodes({
        '': {
          folders: props.rootData.folders || [],
          tracks: props.rootData.tracks || [],
          busy: false,
          loaded: true,
        },
      })
    } else {
      setNodes({ '': { folders: [], tracks: [], busy: false, loaded: false } })
    }
    setExpanded(new Set())
    if (!props.rootData) loadNode('')
  }, [loadNode, props.rootData])

  function toggleFolder(path) {
    const willOpen = !expanded.has(path)
    setExpanded(function(prev) {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
    if (willOpen) {
      const key = path || ''
      const node = nodes[key]
      if (!node || !node.loaded) loadNode(path)
    }
  }

  function selectFolder(path) {
    if (typeof props.onSelectFolder === 'function') props.onSelectFolder(path)
    if (!expanded.has(path)) toggleFolder(path)
  }

  const root = nodes[''] || { folders: [], busy: false }

  return (
    <div className="mc-folder-tree" role="tree">
      {error ? <div className="small text-danger mb-2">{error}</div> : null}
      {root.busy && !root.folders.length ? <Spinner animation="border" size="sm" /> : null}
      {(root.folders || []).map(function(folder) {
        const childPath = folder.path
        const childOpen = expanded.has(childPath)
        return (
          <div key={childPath}>
            <TreeFolderRow
              folder={folder}
              depth={0}
              open={childOpen}
              selectedPath={props.selectedPath || ''}
              onToggle={toggleFolder}
              onSelect={selectFolder}
            />
            {childOpen ? (
              <TreeBranch
                path={childPath}
                depth={0}
                nodes={nodes}
                expanded={expanded}
                selectedPath={props.selectedPath || ''}
                onToggle={toggleFolder}
                onSelect={selectFolder}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
