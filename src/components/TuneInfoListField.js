import TuneChipListField from './TuneChipListField'

/** Multi-value ABC info header field (Origin, Source book, Notes, etc.). */
export default function TuneInfoListField(props) {
  return (
    <TuneChipListField
      value={props.value}
      onChange={props.onChange}
      controlId={props.controlId || 'info-list'}
      className={props.className}
      label={props.label != null ? props.label : ''}
      placeholder={props.placeholder || 'Type a value and press Enter'}
      addLabel={props.addLabel || 'Add'}
      musicBrainzSuggest={false}
    />
  )
}
