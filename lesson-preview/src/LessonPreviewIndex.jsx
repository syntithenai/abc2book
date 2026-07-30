import { useEffect, useMemo, useState } from 'react'
import { isLessonContentComplete } from './lessonPreviewCompleteStore'
import LessonPreviewTree from './LessonPreviewTree'
import {
  buildPreviewTreeModel,
  collectLessonNodes,
  findTreePathToLesson,
  lessonMatchesTreeFilter,
} from './lessonPreviewTreeModel'

function filterPreviewTree(nodes, options) {
  const filter = options.filter
  const showComplete = options.showComplete
  const lessonId = options.lessonId
  const completeIds = options.completeIds

  function walk(treeNodes, ancestors) {
    return (treeNodes || []).map(function(node) {
      if (node.kind === 'lesson') {
        if (!showComplete && completeIds.has(node.lessonId) && node.lessonId !== lessonId) return null
        if (filter && !lessonMatchesTreeFilter(node, filter, ancestors)) return null
        return node
      }
      const children = walk(node.children, ancestors.concat(node))
      if (!children.length) return null
      return Object.assign({}, node, { children: children })
    }).filter(Boolean)
  }

  return walk(nodes, [])
}

function collectFolderIds(nodes, out) {
  ;(nodes || []).forEach(function(node) {
    if (node.kind === 'folder') {
      out.push(node.id)
      collectFolderIds(node.children, out)
    }
  })
  return out
}

export default function LessonPreviewIndex(props) {
  const manifest = props.manifest
  const lessonId = props.lessonId
  const onSelect = props.onSelect
  const showComplete = props.showComplete
  const completeRevision = props.completeRevision
  const [filter, setFilter] = useState('')
  const [expanded, setExpanded] = useState({})

  const fullTree = useMemo(function() {
    return manifest ? buildPreviewTreeModel(manifest) : []
  }, [manifest])

  const completeIds = useMemo(function() {
    void completeRevision
    const ids = new Set()
    collectLessonNodes(fullTree, []).forEach(function(node) {
      if (node.lessonId && isLessonContentComplete(node.lessonId)) ids.add(node.lessonId)
    })
    return ids
  }, [fullTree, completeRevision])

  const visibleTree = useMemo(function() {
    return filterPreviewTree(fullTree, {
      filter: filter,
      showComplete: showComplete,
      lessonId: lessonId,
      completeIds: completeIds,
    })
  }, [fullTree, filter, showComplete, lessonId, completeIds])

  useEffect(function() {
    if (!lessonId || !fullTree.length) return
    const path = findTreePathToLesson(fullTree, lessonId)
    if (!path || !path.length) return
    setExpanded(function(prev) {
      const next = Object.assign({}, prev)
      path.forEach(function(id) {
        if (id.indexOf('folder:') === 0) next[id] = true
      })
      return next
    })
  }, [lessonId, fullTree])

  useEffect(function() {
    if (!filter.trim()) return
    const ids = collectFolderIds(visibleTree, [])
    setExpanded(function(prev) {
      const next = Object.assign({}, prev)
      ids.forEach(function(id) { next[id] = true })
      return next
    })
  }, [filter, visibleTree])

  function isOpen(nodeId) {
    return !!expanded[nodeId]
  }

  function handleToggle(nodeId) {
    setExpanded(function(prev) {
      const next = Object.assign({}, prev)
      next[nodeId] = !next[nodeId]
      return next
    })
  }

  if (!manifest) return null

  return (
    <div className="lesson-preview-index">
      <h1 className="lessons-sidebar-title">Lessons</h1>
      <div className="lesson-preview-index-controls">
        <button
          type="button"
          className={
            'btn btn-sm lesson-preview-show-complete-btn'
            + (showComplete ? ' btn-outline-secondary' : ' btn-secondary')
          }
          data-testid="lesson-preview-toggle-complete"
          onClick={function() {
            if (typeof props.onToggleShowComplete === 'function') {
              props.onToggleShowComplete()
            }
          }}
        >
          {showComplete ? 'Hide complete' : 'Show complete'}
        </button>
      </div>
      <input
        type="search"
        className="form-control form-control-sm lesson-preview-filter"
        placeholder="Filter lessons…"
        value={filter}
        onChange={function(e) { setFilter(e.target.value) }}
        data-testid="lesson-preview-filter"
      />
      <div className="lesson-preview-tree-panel">
        {visibleTree.length ? (
          <LessonPreviewTree
            nodes={visibleTree}
            lessonId={lessonId}
            completeIds={completeIds}
            isOpen={isOpen}
            onToggle={handleToggle}
            onSelect={onSelect}
          />
        ) : (
          <p className="text-muted small lesson-preview-tree-empty">No lessons match.</p>
        )}
      </div>
    </div>
  )
}
