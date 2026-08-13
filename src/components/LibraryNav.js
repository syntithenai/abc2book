import { Link } from 'react-router-dom'
import { Button, Badge } from 'react-bootstrap'

export const LIBRARY_BROWSE_MODES = {
  folders: 'folders',
  artists: 'artists',
  albums: 'albums',
  genres: 'genres',
}

export default function LibraryNav(props) {
  const variant = props.variant || 'outline-secondary'
  const activeMode = props.activeMode || LIBRARY_BROWSE_MODES.folders
  const sections = [
    {
      id: LIBRARY_BROWSE_MODES.folders,
      label: 'Folders',
      icon: props.tunebook && props.tunebook.icons ? props.tunebook.icons.folderopen : null,
      count: props.folderCount,
    },
    {
      id: LIBRARY_BROWSE_MODES.artists,
      label: 'Artists',
      icon: props.tunebook && props.tunebook.icons ? props.tunebook.icons.artist : null,
      count: props.artistCount,
    },
    {
      id: LIBRARY_BROWSE_MODES.albums,
      label: 'Albums',
      icon: props.tunebook && props.tunebook.icons ? props.tunebook.icons.album : null,
      count: props.albumCount,
    },
    {
      id: LIBRARY_BROWSE_MODES.genres,
      label: 'Genres',
      icon: props.tunebook && props.tunebook.icons ? props.tunebook.icons.genre : null,
      count: props.genreCount,
    },
  ]

  return (
    <nav className={'collection-nav library-page-nav' + (props.className ? ' ' + props.className : '')} aria-label="Library browse">
      {sections.map(function(section) {
        const active = activeMode === section.id
        return (
          <Button
            key={section.id}
            className={'collection-nav-item' + (active ? ' library-nav-item--active' : '')}
            variant={active ? 'secondary' : variant}
            size="sm"
            title={section.label}
            aria-label={section.label}
            aria-current={active ? 'page' : undefined}
            onClick={function() {
              if (typeof props.onModeChange === 'function') props.onModeChange(section.id)
            }}
          >
            {section.icon}
            <span className="library-nav-label">{section.label}</span>
            {section.count != null ? <Badge bg="secondary">{section.count}</Badge> : null}
          </Button>
        )
      })}
      <Button
        as={Link}
        to="/books"
        className="collection-nav-item library-nav-books-link"
        variant={variant}
        size="sm"
        title="Back to books"
        aria-label="Back to books"
      >
        {props.tunebook && props.tunebook.icons ? props.tunebook.icons.book : null}
      </Button>
    </nav>
  )
}
