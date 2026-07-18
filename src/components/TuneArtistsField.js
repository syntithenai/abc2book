import TuneChipListField from './TuneChipListField'

export default function TuneArtistsField(props) {
  return (
    <TuneChipListField
      value={props.value}
      onChange={props.onChange}
      controlId={props.controlId || 'artists'}
      className={props.className}
      label={props.label != null ? props.label : 'Artists'}
      placeholder={props.placeholder || 'Type an artist name and press Enter'}
      addLabel="Add artist"
      musicBrainzSuggest={props.musicBrainzSuggest !== false}
      searchResults={props.searchResults}
      searchResultCandidates={props.searchResultCandidates}
      onOpenSearchResults={props.onOpenSearchResults}
      loading={props.loading}
      endAppend={props.endAppend}
      onSelectItem={props.onSelectItem}
    />
  )
}
