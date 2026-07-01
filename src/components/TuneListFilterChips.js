import { Button } from 'react-bootstrap';
import { isMobilePlatform } from '../platformUtils';

/**
 * Book/tag filter chips in the tune list. Disabled on mobile platforms
 * regardless of viewport width; use CollectionNav or header selectors instead.
 */
export default function TuneListFilterChips(props) {
  const mobilePlatform = isMobilePlatform();
  const chipTitle = mobilePlatform
    ? 'Filtering from the list is available on desktop'
    : undefined;

  if (!props.books || props.books.length === 0) {
    if (!props.tags || props.tags.length === 0) return null;
  }

  return (
    <span className="tune-list-filter-btns">
      {props.books && props.books.length > 0 && props.books.map(function(book) {
        if (props.currentTuneBook && props.currentTuneBook === book) return null;
        return (
          <Button
            disabled={mobilePlatform}
            aria-disabled={mobilePlatform}
            title={chipTitle}
            onClick={function() {
              if (!mobilePlatform) {
                props.onBookClick(book);
              }
            }}
            key={book}
            variant="primary"
            className="tune-list-filter-chip"
          >
            {book}
          </Button>
        );
      })}
      {Array.isArray(props.tags) && props.tags.length > 0 && props.tags.map(function(tag) {
        if (props.tagFilter && props.tagFilter.indexOf(tag) !== -1) return null;
        return (
          <Button
            disabled={mobilePlatform}
            aria-disabled={mobilePlatform}
            title={chipTitle}
            key={tag}
            variant="info"
            className="tune-list-filter-chip"
            onClick={function() {
              if (!mobilePlatform) {
                props.onTagClick(tag);
              }
            }}
          >
            {tag}
          </Button>
        );
      })}
    </span>
  );
}
