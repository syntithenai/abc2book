import {useState} from 'react'
import {Button, Modal, ListGroup} from 'react-bootstrap'
import { useResponsiveModalProps } from '../useResponsiveModalProps'
import { GROUP_BY_TUNE_STATUS, GROUP_BY_TUNE_STATUS_DETAILED } from '../tuneListFilter'

function GroupBySelectorModal(props) {
  const [show, setShow] = useState(false);
  const responsiveModalProps = useResponsiveModalProps();
  const options = {
    boost: 'confidence',
    difficulty: 'difficulty',
    key: 'key',
    tuning: 'tuning',
    meter: 'meter',
    rhythm: 'rhythm',
    composer: 'artist',
    books: 'books',
    tags: 'tags',
    [GROUP_BY_TUNE_STATUS]: 'tune status',
    [GROUP_BY_TUNE_STATUS_DETAILED]: 'detailed tune status',
    tempoRange: 'tempo range',
  }
  const handleClose = () => setShow(false);
  const handleShow = (e) => {
    setShow(true);
  }
  return (
    <>
      <Button className="tune-search-layout-btn" style={{color:'black', fontWeight:'bold'}} onClick={handleShow}>
        {props.tunebook.icons.stack}
        {props.hideSelection
          ? <span className="tune-search-filters-btn-label"> Group by</span>
          : (props.value && options[props.value] ? ' ' + options[props.value] : '')}
      </Button>

      <Modal show={show} onHide={handleClose} {...responsiveModalProps}>
        <Modal.Header closeButton>
          <Modal.Title>Group By</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <ListGroup  style={{clear:'both', width: '100%'}}>
            <ListGroup.Item  style={{fontSize:'1.5em'}} key={'first'} className='odd'  onClick={function(e) {props.onChange(''); handleClose()}} >No Grouping</ListGroup.Item>
            <>
            {Object.keys(options).map(function(option,tk) {
              return <ListGroup.Item  style={{fontSize:'1.5em', border: (props.value && props.value == option) ? '2px solid black' : '' }} key={tk} className={(tk%2 === 0) ? 'even': 'odd'} onClick={function(e) {props.onChange(option); handleClose()}} > {options[option]} </ListGroup.Item>
            })}
            </>
          </ListGroup>
        </Modal.Body>
      </Modal>
    </>
  );
}
export default GroupBySelectorModal
