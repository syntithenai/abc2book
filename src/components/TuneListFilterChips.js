import { Button } from 'react-bootstrap';
import { isMobilePlatform } from '../platformUtils';

/**
 * Book/tag filter chips in the tune list. Disabled on mobile platforms
 * regardless of viewport width; use CollectionNav or header selectors instead.
 * Pass readOnly to render non-interactive chips (e.g. single-tune metadata).
 */
export default function TuneListFilterChips(props) {
  const readOnly = !!props.readOnly;
  const mobilePlatform = !readOnly && isMobilePlatform();
  const chipTitle = mobilePlatform
    ? 'Filtering from the list is available on desktop'
    : undefined;

  if (!props.books || props.books.length === 0) {
    if (!props.tags || props.tags.length === 0) return null;
  }

  return (
    <span className="tune-list-filter-btns">
      {props.books && props.books.length > 0 && props.books.map(function(book) {
        if (!readOnly && props.currentTuneBook && props.currentTuneBook === book) return null;
        return (
          <Button
            as={readOnly ? 'span' : undefined}
            disabled={!readOnly && mobilePlatform}
            aria-disabled={!readOnly && mobilePlatform}
            title={chipTitle}
            onClick={readOnly ? undefined : function() {
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
        if (!readOnly && props.tagFilter && props.tagFilter.indexOf(tag) !== -1) return null;
        return (
          <Button
            as={readOnly ? 'span' : undefined}
            disabled={!readOnly && mobilePlatform}
            aria-disabled={!readOnly && mobilePlatform}
            title={chipTitle}
            key={tag}
            variant="info"
            className="tune-list-filter-chip"
            onClick={readOnly ? undefined : function() {
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
