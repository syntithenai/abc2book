import {useState, useEffect} from 'react'
import {Button, Modal, ListGroup, Badge, ButtonGroup} from 'react-bootstrap'

function TagsSearchSelectorModal(props) {
  const [show, setShow] = useState(false);
  const [selectedTags, setSelectedTags] = useState(Array.isArray(props.value) ? props.value : []);
  const [filter, setFilter] = useState('');
  const [options, setOptions] = useState(props.defaultOptions())

  useEffect(function() {
    setSelectedTags(Array.isArray(props.value) ? props.value : [])
  }, [props.value])
 
  const handleClose = () => {
      setShow(false);
      if (props.handleClose) props.handleClose()
  }
  const handleShow = () => {
      setFilter('')
      setOptions(props.defaultOptions())
      setShow(true)
  };
  
  var filterChangeTimeout = null
  function filterChange(e) {
    setFilter(e.target.value.toLowerCase())
    if (e.target.value.trim() === '') {
      setOptions(props.defaultOptions())
    } else {
      if (filterChangeTimeout) clearTimeout(filterChangeTimeout) 
      filterChangeTimeout = setTimeout(function() {
        setOptions(props.searchOptions(e.target.value))
      },500)
    }
  } 
  
    function selectTag(tag) {
      var newValue = Array.isArray(selectedTags) ? selectedTags : []
      newValue.push(tag)
      var uniqueTagsSelected = props.tunebook.utils.uniquifyArray(newValue)
      setFilter('')
      setOptions(props.defaultOptions())
            setSelectedTags(uniqueTagsSelected)
            props.onChange(uniqueTagsSelected)
            handleClose()
      }
    
    function deselectTag(tag) {
      var uniqueTagsSelected = selectedTags.filter(function(selectedTag) {
        if (selectedTag === tag) {
          return false
        } else {
          return true
        }
      })
      setSelectedTags(uniqueTagsSelected)
    }
    
    var sortedOptions = Object.keys(options);
    sortedOptions.sort(function (a,b) {if (a > b) return 1; else return -1})
  const hasActiveTags = Array.isArray(props.value) && props.value.length > 0
  const hideSelection = !!props.hideSelection

  function clearTagFilter(e) {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    setSelectedTags([])
    props.onChange([])
    props.forceRefresh()
  }

  return (
    <>
      <ButtonGroup>
        <Button onClick={handleShow} variant="info" >
          <span>
            {props.tunebook.icons.tag}
            {hideSelection
              ? <span className="tune-search-filters-btn-label"> Tag</span>
              : (Array.isArray(props.value) ? ' ' + props.value.map(function(v) { return String(v).toLowerCase() }).join(",") : '')}
          </span>
        </Button>
        {!hideSelection && hasActiveTags ? (
          <Button variant="info" title="Clear tag filter" onClick={clearTagFilter}>
            {props.tunebook.icons.closecircle}
          </Button>
        ) : null}
      </ButtonGroup>
     
      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Filter Tags </Modal.Title>
          
        </Modal.Header>
        <Modal.Body >
        
        <div style={{width:'100%', borderBottom:'1px solid black'}} ><Button style={{marginBottom:'0.3em'}} onClick={function() {setSelectedTags([]); props.onChange([]) ;handleClose()}} variant="warning">Reset Search</Button></div>
          <Button onClick={function() {handleClose()}} variant="danger" style={{float:'right', marginBottom:'0.3em'}}>Cancel</Button>
          <Button onClick={function() {props.onChange(selectedTags); handleClose()}} variant="success" style={{float:'right', marginBottom:'0.3em'}}>Search</Button>
     
       
          <div>{Array.isArray(selectedTags) && selectedTags.map(function(selectedTag) {
              return <Button key={selectedTag} style={{marginRight:'0.2em'}} variant="info" onClick={function(e) {deselectTag(selectedTag)}} >{props.tunebook.icons.closecircle}&nbsp;{String(selectedTag).toLowerCase()}</Button>
            })}</div>
            
          <input type='search' value={filter} onChange={filterChange}  onFocus={function() {if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(true)}} onBlur={function() {if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(false)}}  />
          {(Array.isArray(sortedOptions) && sortedOptions.length === 0) && <Button onClick={function() {selectTag(filter)} } >Set</Button>}
        </Modal.Body>
        <Modal.Footer  >
          <ListGroup  style={{clear:'both', width: '100%'}}>
            {sortedOptions.map(function(option,tk) {
              return <ListGroup.Item  key={tk} className={(tk%2 === 0) ? 'even': 'odd'} onClick={function(e) {selectTag(option)}} >{String(options[option]).toLowerCase()}</ListGroup.Item>
            })}
          </ListGroup>
        </Modal.Footer>
      </Modal>
    </>
  );
}
export default TagsSearchSelectorModal
