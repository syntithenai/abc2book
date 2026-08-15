import {useState, cloneElement, isValidElement} from 'react'
import {Button, Modal, ListGroup} from 'react-bootstrap'
import { useResponsiveModalProps } from '../useResponsiveModalProps'
import VoiceFillInput from './VoiceFillInput'

function BookSelectorModal(props) {
  const [show, setShow] = useState(false);
  const responsiveModalProps = useResponsiveModalProps();
  const [filter, setFilter] = useState(props.value);
  const [options, setOptions] = useState(function() {
    return typeof props.defaultOptions === 'function' ? props.defaultOptions() : {}
  });
  const handleClose = () => setShow(false);
  const handleShow = (e) => {
    setShow(true);
    filterChange('')
  }
  
  var filterChangeTimeout = null
  function filterChange(value) {
    setFilter(value.toLowerCase())
    if (value.trim() === '') {
      setOptions(typeof props.defaultOptions === 'function' ? props.defaultOptions() : {})
    } else {
      if (filterChangeTimeout) clearTimeout(filterChangeTimeout) 
      filterChangeTimeout = setTimeout(function() {
        setOptions(typeof props.searchOptions === 'function' ? props.searchOptions(value) : {})
      },500)
    }
  } 
  
    function newBook(filter) {
        if(filter && filter.trim()) {
            props.tunebook.indexes.addBookToIndex(filter); 
            props.onChange(filter); 
            setFilter('')
            props.forceRefresh()
        }
    }
    
     const [imageIsHidden, setImageIsHidden] = useState({})
    function hideImage(key) {
        var v = imageIsHidden
        v[key] = true
        setImageIsHidden(v)
        
    }
    
    var sortedOptions = Object.keys(options)
    sortedOptions.sort(function (a,b) {if (a > b) return 1; else return -1})

    function renderTrigger() {
      if (!props.triggerElement) return null
      if (isValidElement(props.triggerElement)) {
        return cloneElement(props.triggerElement, {
          onClick: function(e) {
            if (props.triggerElement.props.onClick) {
              props.triggerElement.props.onClick(e)
            }
            handleShow(e)
          },
        })
      }
      return <span onClick={handleShow}>{props.triggerElement}</span>
    }

  return (
    <>
      {renderTrigger()}

      <Modal show={show} onHide={handleClose} {...responsiveModalProps}>
        <Modal.Header closeButton>
          <Modal.Title style={{width:'100%'}}>{props.title}
          
          <Button style={{float:'right'}} variant="danger" onClick={function() {props.onChange(''); handleClose()}} >Clear</Button>
          </Modal.Title>
          
        </Modal.Header>
        <Modal.Body>
          <VoiceFillInput
            layout="wrap"
            useFormControl={false}
            type="search"
            value={filter}
            onChange={function(e) { filterChange(e.target.value) }}
            onFocus={function() {if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(true)}}
            onBlur={function() {if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(false)}}
            setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
            token={props.token}
            fieldKind="search"
          />
          {(props.allowNew !== false)  && <Button key="newbook" onClick={function() {newBook(filter); handleClose()}}  >New Book</Button>}
        </Modal.Body>
        <Modal.Footer>
          <ListGroup  style={{clear:'both', width: '100%'}}>
            {sortedOptions.map(function(option,tk) {
              return <ListGroup.Item  style={{fontSize:'1.5em'}} key={tk} className={(tk%2 === 0) ? 'even': 'odd'} onClick={function(e) {props.onChange(option); filterChange(''); handleClose()}} >{!imageIsHidden[tk] && <img alt="" style={{height:'50px'}} src={"/book_images/"+options[option].replaceAll(" ","")+".jpeg"} onError={function() {hideImage(tk)}} />} {options[option]}</ListGroup.Item>
            })}
          </ListGroup>
        </Modal.Footer>
      </Modal>
    </>
  );
}
export default BookSelectorModal
