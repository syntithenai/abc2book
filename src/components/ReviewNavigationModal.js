import {useState, useEffect} from 'react'
import {Button, Modal, ListGroup} from 'react-bootstrap'
import {Link} from 'react-router-dom'

function ReviewNavigationModal(props) {
  const [show, setShow] = useState(false);
  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);
  const [items, setItems] = useState([])
  
  //function countReviewItems() {
      //var count = 0
      //if (props.reviewItems) {
        //Object.values(props.reviewItems).forEach(function(item) {
          //count += item.length  
        //})
      //}
      //return count
  //}
  
  //function flattenItems() {
    //var final = {}
    //if (props.reviewItems) {
      //Object.values(props.reviewItems).map(function(reviewBand) {
        //reviewBand.map(function(itemId) {
          //final[itemId] = props.tunebook.tunes[itemId].name
        //})
      //})
    //}
    //setItems(final)
  //}
  //useEffect(function() {
    //flattenItems()
  //},[props.reviewItems])
  
  return (
    <>
      <Link to={"/review/" + props.tunebook.utils.previousNumber(props.currentReviewItem, (props.reviewItems ? props.reviewItems.length : 1))} ><Button variant="primary" >{props.tunebook.icons.arrowlefts}</Button></Link>
      <Button  variant="primary" onClick={handleShow}>
        {props.tunebook.icons.filelist}
      </Button>
      <Link to={"/review/" + props.tunebook.utils.nextNumber(props.currentReviewItem, (props.reviewItems ? props.reviewItems.length : 1))} ><Button variant="primary" >{props.tunebook.icons.arrowrights}</Button></Link>
      
      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Select a review tune</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <ListGroup>
            {Array.isArray(props.reviewItems) && props.reviewItems.map(function(item,ik) {
              return <Link to={"/review/" + ik}  onClick={handleClose} ><ListGroup.Item>{item.name}</ListGroup.Item></Link>
            })}
          </ListGroup>
        </Modal.Body>
      </Modal>
    </>
  );
}
export default ReviewNavigationModal