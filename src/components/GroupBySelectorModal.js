import {useState} from 'react'
import {Button, Modal, ListGroup, Form} from 'react-bootstrap'
import { FormLabelWithHelp } from './FormFieldHelp'
import { SEARCH_FIELD_HELP } from '../formFieldHelpText'
import { useResponsiveModalProps } from '../useResponsiveModalProps'

function GroupBySelectorModal(props) {
  const [show, setShow] = useState(false);
  const responsiveModalProps = useResponsiveModalProps();
  const options = {boost:'confidence',difficulty: 'difficulty', key: 'key',tuning: 'tuning', meter:'meter',  rhythm:'rhythm',composer:'artist', books: 'books', tags: 'tags', tuneStatus: 'tune status', tempoRange: 'tempo range', isBlocked: 'is blocked'} //, tags: 'tags'}
  const handleClose = () => setShow(false);
  const handleShow = (e) => {
    setShow(true);
  }
  return (
    <>
      <Button className="tune-search-layout-btn" style={{color:'black', fontWeight:'bold'}} onClick={handleShow}>
        {props.tunebook.icons.stack} {props.value && options[props.value] ? options[props.value] : ''}
      </Button>

      <Modal show={show} onHide={handleClose} {...responsiveModalProps}>
        <Modal.Header closeButton>
          <Modal.Title>List Layout</Modal.Title>
          
        </Modal.Header>
        <Modal.Body>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:'0.5em'}}>
            <FormLabelWithHelp label="Show preview?" helpBody={SEARCH_FIELD_HELP.showPreview.body} helpTitle={SEARCH_FIELD_HELP.showPreview.title} />
            <Form.Check
              type="switch"
              id="list-layout-show-preview"
              label=""
              checked={props.showPreviewInList ? true : false}
              onChange={function() {
                props.setShowPreviewInList(!props.showPreviewInList)
              }}
            />
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Modal.Title style={{width:'100%'}} >Group By</Modal.Title>
          <ListGroup  style={{clear:'both', width: '100%'}}>
          
            <ListGroup.Item  style={{fontSize:'1.5em'}} key={'first'} className='odd'  onClick={function(e) {props.onChange(''); handleClose()}} >No Grouping</ListGroup.Item>
            <>
            {Object.keys(options).map(function(option,tk) {
              return <ListGroup.Item  style={{fontSize:'1.5em', border: (props.value && props.value == options[option]) ? '2px solid black' : '' }} key={tk} className={(tk%2 === 0) ? 'even': 'odd'} onClick={function(e) {props.onChange(option); handleClose()}} > {options[option]} </ListGroup.Item>
            })}
            </>
          </ListGroup>
        </Modal.Footer>
      </Modal>
    </>
  );
}
export default GroupBySelectorModal
