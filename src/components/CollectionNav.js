import { Link } from 'react-router-dom'
import { Button, Badge } from 'react-bootstrap'
import { BOOKS_PAGE_SECTIONS } from '../recentTunes'

export default function CollectionNav(props) {
  const variant = props.variant || 'outline-secondary'
  const sections = [
    {
      id: BOOKS_PAGE_SECTIONS.books,
      label: 'books',
      icon: props.tunebook.icons.book,
      count: props.tbCount,
      alwaysShowCount: true,
    },
    {
      id: BOOKS_PAGE_SECTIONS.tags,
      label: 'tags',
      icon: props.tunebook.icons.tag,
      count: props.tagCount,
      alwaysShowCount: true,
    },
    {
      id: BOOKS_PAGE_SECTIONS.genres,
      label: 'genres',
      icon: props.tunebook.icons.genre,
      count: props.genreCount,
      alwaysShowCount: true,
    },
    {
      id: BOOKS_PAGE_SECTIONS.artists,
      label: 'artists',
      icon: props.tunebook.icons.artist,
      count: props.artistCount,
      alwaysShowCount: true,
    },
    {
      id: BOOKS_PAGE_SECTIONS.filters,
      label: 'filters',
      icon: props.tunebook.icons.filter,
      count: props.savedFilterCount,
      alwaysShowCount: false,
    },
    {
      id: BOOKS_PAGE_SECTIONS.recent,
      label: 'recent',
      icon: props.tunebook.icons.recent,
    },
  ]

  function handleClick(sectionId) {
    if (typeof props.onSectionClick === 'function') props.onSectionClick(sectionId)
  }

  function renderCount(section) {
    if (section.count == null) return null
    if (!section.alwaysShowCount && section.count <= 0) return null
    return <Badge bg="secondary">{section.count}</Badge>
  }

  function renderButton(section) {
    const content = (
      <>
        {section.icon}
        {renderCount(section)}
      </>
    )

    if (props.linkToBooks) {
      return (
        <Link
          key={section.id}
          to="/books"
          className="collection-nav-item"
          onClick={function() { handleClick(section.id) }}
          title={section.label}
          aria-label={section.label}
        >
          <Button variant={variant} size="sm" title={section.label} aria-label={section.label}>{content}</Button>
        </Link>
      )
    }

    return (
      <Button
        key={section.id}
        className="collection-nav-item"
        variant={variant}
        size="sm"
        title={section.label}
        aria-label={section.label}
        onClick={function() { handleClick(section.id) }}
      >
        {content}
      </Button>
    )
  }

  return (
    <nav className={'collection-nav' + (props.className ? ' ' + props.className : '')} aria-label="Collection shortcuts">
      {sections.map(renderButton)}
      {props.showGenerate ? (
        <Button
          className="collection-nav-item"
          variant={variant}
          size="sm"
          title="generate"
          aria-label="generate"
          onClick={props.onGenerate}
        >
          {props.tunebook.icons.wizard}
        </Button>
      ) : null}
    </nav>
  )
}
