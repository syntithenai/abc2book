import {useState} from 'react'
import {Button, Modal, ListGroup, Badge} from 'react-bootstrap'

function TagsSearchSelectorModal(props) {
     //console.log(props)
     //console.log(props.defaultOptions())
  const [show, setShow] = useState(false);
  const [selectedTags, setSelectedTags] = useState(Array.isArray(props.value) ? props.value : []);
  const [filter, setFilter] = useState('');
  const [options, setOptions] = useState(props.defaultOptions())
 
  const handleClose = () => {
      setShow(false);
      if (props.handleClose) props.handleClose()
  }
  const handleShow = () => setShow(true);
  
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
    
    var sortedOptions = Object.keys(options).filter(function(a) {
          // filter to tags in search results
          if (!props.tagCollation) {
              return true
          } else {
              if (props.tagCollation[a]) {
                  return true
              } else {
                return false
              }
          }
    });
    sortedOptions.sort(function (a,b) {if (a > b) return 1; else return -1})
  return (
    <>
     
       <Button onClick={handleShow} variant="info" >
        <span>{props.tunebook.icons.tag} {Array.isArray(props.value) ?  props.value.join(",") : ''}</span> 
      </Button>
     
      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Filter Tags </Modal.Title>
          
        </Modal.Header>
        <Modal.Body >
        
        <div style={{width:'100%', borderBottom:'1px solid black'}} ><Button style={{}} onClick={function() {setSelectedTags([]); props.onChange([]) ;handleClose()}} variant="warning" style={{ marginBottom:'0.3em'}}>Reset Search</Button></div>
          <Button onClick={function() {handleClose()}} variant="danger" style={{float:'right', marginBottom:'0.3em'}}>Cancel</Button>
          <Button onClick={function() {props.onChange(selectedTags); handleClose()}} variant="success" style={{float:'right', marginBottom:'0.3em'}}>Search</Button>
     
       
          <div>{Array.isArray(selectedTags) && selectedTags.map(function(selectedTag) {
              return <Button key={selectedTag} style={{marginRight:'0.2em'}} variant="info" onClick={function(e) {deselectTag(selectedTag)}} >{props.tunebook.icons.closecircle}&nbsp;{selectedTag}</Button>
            })}</div>
            
          <input type='search' value={filter} onChange={filterChange}  onFocus={function() {props.setBlockKeyboardShortcuts(true)}} onBlur={function() {props.setBlockKeyboardShortcuts(false)}}  />
          {(Array.isArray(sortedOptions) && sortedOptions.length === 0) && <Button onClick={function() {selectTag(filter)} } >Set</Button>}
        </Modal.Body>
        <Modal.Footer  >
          <ListGroup  style={{clear:'both', width: '100%'}}>
            {sortedOptions.map(function(option,tk) {
              return <ListGroup.Item  key={tk} className={(tk%2 === 0) ? 'even': 'odd'} onClick={function(e) {selectTag(option)}} >{options[option]}</ListGroup.Item>
            })}
          </ListGroup>
        </Modal.Footer>
      </Modal>
    </>
  );
}
export default TagsSearchSelectorModal
