import {useState, useEffect} from 'react'
import {Button, Modal, ListGroup, Badge} from 'react-bootstrap'
import { useResponsiveModalProps } from '../useResponsiveModalProps'
import VoiceFillInput from './VoiceFillInput'

function TagsSelectorModal(props) {
    
  const [show, setShow] = useState(false);
  const responsiveModalProps = useResponsiveModalProps();
  const [selectedTags, setSelectedTags] = useState(false);
  const [filter, setFilter] = useState('');
  const [options, setOptions] = useState(props.defaultOptions());
  const handleClose = () => {
      setShow(false);
      if (props.handleClose) props.handleClose()
  }
  const handleShow = () => setShow(true);

  useEffect(function() {
    if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(show)
    return function() {
      if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(false)
    }
  }, [show, props.setBlockKeyboardShortcuts]);
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
     
       <Button onClick={handleShow} className="tune-meta-modal-btn" aria-label="Tags" variant="info" >
        <span className="tune-meta-modal-icon" >{props.tunebook.icons.tag}</span>
        <Badge bg="secondary" className="tune-meta-modal-badge" >{props.value ? props.value.length : 0}</Badge>
      </Button>
      
        
     
      <Modal show={show} onHide={handleClose} {...responsiveModalProps}>
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
            
          <VoiceFillInput
            layout="wrap"
            useFormControl={false}
            type="search"
            value={filter}
            onChange={filterChange}
            onFocus={function() {if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(true)}}
            onBlur={function() {if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(false)}}
            setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
            token={props.token}
            fieldKind="search"
          />
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
