import YourFilters from '../components/YourFilters'
import { useDocumentTitle } from '../pageTitle'

export default function FiltersPage(props) {
    useDocumentTitle('Filters')
    return <div style={{padding:'1em'}}>
        <h4>Your Filters</h4>
    <YourFilters {...props} setGroupBy={props.setGroupBy} />
    </div>
}
