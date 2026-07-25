import TuneChipListField from './TuneChipListField'
import { getMusicGenreList } from '../musicGenreOptions'

export default function TuneGenresField(props) {
  return (
    <TuneChipListField
      value={props.value}
      onChange={props.onChange}
      controlId={props.controlId || 'genres'}
      className={props.className}
      label={props.label != null ? props.label : 'Genres'}
      placeholder={props.placeholder || 'Type a genre and press Enter'}
      addLabel="Add genre"
      musicBrainzSuggest={false}
      searchResults={props.searchResults != null ? props.searchResults : getMusicGenreList()}
      searchResultCandidates={props.searchResultCandidates}
      onOpenSearchResults={props.onOpenSearchResults}
      loading={props.loading}
      endAppend={props.endAppend}
    />
  )
}
