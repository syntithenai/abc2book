import './SearchListSectionHeader.css'

export default function SearchListSectionHeader(props) {
  const label = String(props.label || 'Media Sources').trim() || 'Media Sources'
  return (
    <div className="search-list-section-header" role="separator" aria-label={label}>
      <span className="search-list-section-header-label">{label}</span>
    </div>
  )
}
