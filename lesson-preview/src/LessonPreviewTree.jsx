function TreeIcon(props) {
  const kind = props.kind
  const open = props.open
  if (kind === 'lesson') {
    return (
      <span className="fm-tree-icon fm-tree-icon--file" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="14" height="14" focusable="false">
          <path d="M3 1.5h5.5L12 5v9.5H3V1.5z" fill="none" stroke="currentColor" strokeWidth="1.1" />
          <path d="M8.5 1.5V5H12" fill="none" stroke="currentColor" strokeWidth="1.1" />
        </svg>
      </span>
    )
  }
  return (
    <span className={'fm-tree-icon fm-tree-icon--folder' + (open ? ' fm-tree-icon--folder-open' : '')} aria-hidden="true">
      <svg viewBox="0 0 16 16" width="14" height="14" focusable="false">
        {open ? (
          <path d="M1.5 4.5h5.2l1.3 1.5H14.5v8H1.5V4.5z" fill="currentColor" opacity="0.18" stroke="currentColor" strokeWidth="1.1" />
        ) : (
          <path d="M1.5 4.5h5.2l1.3 1.5H14.5v7H1.5V4.5z" fill="currentColor" opacity="0.18" stroke="currentColor" strokeWidth="1.1" />
        )}
        <path d="M1.5 3.5h5.2l1.3 1.5H14.5" fill="none" stroke="currentColor" strokeWidth="1.1" />
      </svg>
    </span>
  )
}

function TreeRow(props) {
  const node = props.node
  const depth = props.depth
  const isFolder = node.kind === 'folder'
  const isOpen = props.isOpen
  const isActive = !isFolder && node.lessonId === props.lessonId
  const isComplete = !isFolder && props.completeIds && props.completeIds.has(node.lessonId)

  function handleRowClick(e) {
    if (isFolder) {
      e.preventDefault()
      props.onToggle(node.id)
      return
    }
    if (typeof props.onSelect === 'function') props.onSelect(node.lessonId)
  }

  function handleToggleClick(e) {
    e.stopPropagation()
    props.onToggle(node.id)
  }

  return (
    <div
      className={
        'fm-tree-row'
        + (isActive ? ' fm-tree-row--active' : '')
        + (isComplete ? ' fm-tree-row--complete' : '')
        + (isFolder ? ' fm-tree-row--folder' : ' fm-tree-row--file')
      }
      style={{ '--fm-depth': depth }}
      data-testid={isFolder ? 'fm-tree-folder-' + node.id : 'lesson-preview-link-' + node.lessonId}
    >
      <span className="fm-tree-guides" aria-hidden="true" />
      {isFolder ? (
        <button
          type="button"
          className={'fm-tree-chevron' + (isOpen ? ' fm-tree-chevron--open' : '')}
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Collapse' : 'Expand'}
          onClick={handleToggleClick}
        >
          <svg viewBox="0 0 10 10" width="10" height="10" focusable="false">
            <path d="M3 1.5 7.5 5 3 8.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      ) : (
        <span className="fm-tree-chevron fm-tree-chevron--spacer" aria-hidden="true" />
      )}
      <TreeIcon kind={node.kind} open={isOpen} />
      <button type="button" className="fm-tree-label" onClick={handleRowClick}>
        {isComplete ? <span className="fm-tree-complete-mark" aria-hidden="true">✓</span> : null}
        <span className="fm-tree-label-text">{node.label}</span>
        {!isFolder && node.tier && typeof node.tier === 'string' ? (
          <span className="fm-tree-tier">{node.tier}</span>
        ) : null}
      </button>
    </div>
  )
}

function TreeBranch(props) {
  const node = props.node
  const isOpen = props.isOpen(node.id)
  const hasChildren = node.children && node.children.length

  return (
    <div className="fm-tree-branch" role="treeitem" aria-expanded={node.kind === 'folder' ? isOpen : undefined}>
      <TreeRow
        node={node}
        depth={props.depth}
        lessonId={props.lessonId}
        completeIds={props.completeIds}
        isOpen={isOpen}
        onToggle={props.onToggle}
        onSelect={props.onSelect}
      />
      {node.kind === 'folder' && isOpen && hasChildren ? (
        <div className="fm-tree-children" role="group">
          {node.children.map(function(child) {
            return (
              <TreeBranch
                key={child.id}
                node={child}
                depth={props.depth + 1}
                lessonId={props.lessonId}
                completeIds={props.completeIds}
                isOpen={props.isOpen}
                onToggle={props.onToggle}
                onSelect={props.onSelect}
              />
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export default function LessonPreviewTree(props) {
  const nodes = props.nodes || []
  const isOpen = props.isOpen || function() { return false }
  return (
    <div className="fm-tree" role="tree" aria-label="Lesson index">
      {nodes.map(function(node) {
        return (
          <TreeBranch
            key={node.id}
            node={node}
            depth={0}
            lessonId={props.lessonId}
            completeIds={props.completeIds}
            isOpen={isOpen}
            onToggle={props.onToggle}
            onSelect={props.onSelect}
          />
        )
      })}
    </div>
  )
}
