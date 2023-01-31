import {useState} from 'react'
import {Button, Modal, ListGroup, Badge} from 'react-bootstrap'

function TagsSelectorModal(props) {
    
  const [show, setShow] = useState(false);
  const [selectedTags, setSelectedTags] = useState(false);
  const [filter, setFilter] = useState('');
  const [options, setOptions] = useState(props.defaultOptions());
  const handleClose = () => {
      setShow(false);
      if (props.handleClose) props.handleClose()
  }
  const handleShow = () => setShow(true);
  //console.log(props,options)
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
  
  
    function newTag(tag) {
        //console.log('new tag',tag)
        if(tag && tag.trim()) {
            props.tunebook.indexes.addTagToIndex(tag); 
            var newValue = Array.isArray(props.value) ? props.value : []
            newValue.push(tag)
            var uniqueTagsSelected = props.tunebook.utils.uniquifyArray(newValue)
            setFilter('')
            setOptions(props.defaultOptions())
                props.onChange(uniqueTagsSelected)
                props.forceRefresh()
           
        }
    }
    
    function selectTag(tag) {
        //console.log('sel tag',tag)
      var newValue = Array.isArray(props.value) ? props.value : []
      newValue.push(tag)
      var uniqueTagsSelected = props.tunebook.utils.uniquifyArray(newValue)
      setFilter('')
      setOptions(props.defaultOptions())
            props.onChange(uniqueTagsSelected)
            props.forceRefresh()
    }
    
    function deselectTag(tag) {
        //console.log('desel tag',tag)
      var uniqueTagsSelected = props.value.filter(function(selectedTag) {
        if (selectedTag === tag) {
          return false
        } else {
          return true
        }
      })
             props.onChange(uniqueTagsSelected)
            props.forceRefresh()
    }
    
   
    
  var sortedOptions = Object.keys(options)
    sortedOptions.sort(function (a,b) {if (a > b) return 1; else return -1})
  return (
    <>
     
       <Button onClick={handleShow} style={{position:'relative', float:'left', marginLeft:'0.1em', width:'2.6em', height:'2.37em'}} variant="info" >
        <span  style={{position:'absolute', top:'1px', left:'1.3em', opacity: 0.9, fontSize:'0.5em'}} >{props.tunebook.icons.tag}</span> 
        <Badge style={{position:'absolute', top:'26px', left:'1.4em',  fontSize:'0.5em'}} >{props.value ? props.value.length : 0}</Badge>
      </Button>
     
      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          {<Modal.Title>Edit Tags</Modal.Title>}
          
        </Modal.Header>
        <Modal.Body  >
          <Button onClick={function() {
              handleClose()
            }} variant="success" style={{float:'right', marginBottom:'0.3em'}}>OK</Button>
          <div>{Array.isArray(props.value) && props.value.map(function(selectedTag) {
              return <Button key={selectedTag} style={{marginRight:'0.2em'}} variant="info" onClick={function(e) {deselectTag(selectedTag)}} >{props.tunebook.icons.closecircle}&nbsp;{selectedTag}</Button>
            })}</div>
            
          <input type='search' value={filter} onChange={filterChange} onFocus={function() {props.setBlockKeyboardShortcuts(true)}} onBlur={function() {props.setBlockKeyboardShortcuts(false)}}  />
          <Button key="newtag" onClick={function() {newTag(filter)}}  >New Tag</Button>
        </Modal.Body>
        <Modal.Footer>
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
export default TagsSelectorModal
