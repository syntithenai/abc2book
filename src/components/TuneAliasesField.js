import TuneChipListField from './TuneChipListField'

export default function TuneAliasesField(props) {
  return (
    <TuneChipListField
      value={props.value}
      onChange={props.onChange}
      controlId={props.controlId || 'aliases'}
      className={props.className}
      label={props.label != null ? props.label : 'Aliases'}
      placeholder={props.placeholder || 'Type an alternate title and press Enter'}
      addLabel="Add alias"
      musicBrainzSuggest={false}
      endAppend={props.endAppend}
    />
  )
}
