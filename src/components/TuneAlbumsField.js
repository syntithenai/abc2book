import TuneChipListField from './TuneChipListField'

export default function TuneAlbumsField(props) {
  return (
    <TuneChipListField
      value={props.value}
      onChange={props.onChange}
      controlId={props.controlId || 'albums'}
      className={props.className}
      label={props.label != null ? props.label : 'Albums'}
      placeholder={props.placeholder || 'Type an album and press Enter'}
      addLabel="Add album"
      musicBrainzSuggest={false}
      searchResults={props.searchResults || []}
      searchResultCandidates={props.searchResultCandidates}
      onOpenSearchResults={props.onOpenSearchResults}
      loading={props.loading}
      endAppend={props.endAppend}
    />
  )
}
