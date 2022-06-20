import {useState, useEffect} from 'react'
import {Button, Modal, ListGroup} from 'react-bootstrap'
import {Link} from 'react-router-dom'

function ReviewNavigationModal(props) {
  const [show, setShow] = useState(false);
  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);
  const [items, setItems] = useState([])
  const [filter, setFilter] = useState([])
  
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
  
  var prevNum = props.currentReviewItem > 0 ? props.currentReviewItem - 1 : null
  var nextNum = (props.currentReviewItem + 1) 
  if (nextNum > props.reviewItems.length) nextNum = null
  //props.tunebook.utils.nextNumber(props.currentReviewItem, (props.reviewItems ? props.reviewItems.length : 0))
  
  var lookups = {}
  props.reviewItems.forEach(function(tune,tk) {
    lookups[tune.id] =  tk
  })
  return (
    <>
      {prevNum ? <Link to={"/review/" + props.tunebook.utils.previousNumber(props.currentReviewItem, (props.reviewItems ? props.reviewItems.length : 1))} ><Button variant="primary" >{props.tunebook.icons.arrowlefts}</Button></Link> : null}
      {!prevNum ? <Button variant="primary" >{props.tunebook.icons.arrowlefts}</Button> : null}  
      <Button  variant="primary" onClick={handleShow}>
        {props.tunebook.icons.filelist}
      </Button>
      {nextNum ? <Link to={"/review/" + props.tunebook.utils.nextNumber(props.currentReviewItem, (props.reviewItems ? props.reviewItems.length : 1))} ><Button variant="primary" >{props.tunebook.icons.arrowrights}</Button></Link> : null}
      {!nextNum ? <Button variant="primary" >{props.tunebook.icons.arrowrights}</Button> : null}
      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Select a review tune</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <input type="search" value={filter} onChange={function(e) {setFilter(e.target.value)}}  />
          <ListGroup>
            {Array.isArray(props.reviewItems) && props.reviewItems.filter(function(item) {
                if (!filter.trim() || item.name.toLowerCase().indexOf(filter.trim().toLowerCase()) !== -1) return true
                else return false
              }).map(function(item,ik) {
              return <Link key={ik} to={"/review/" + lookups[item.id]}  onClick={handleClose} ><ListGroup.Item className={(ik%2 === 0) ? 'even': 'odd'} >{item.name}</ListGroup.Item></Link>
            })}
          </ListGroup>
        </Modal.Body>
      </Modal>
    </>
  );
}
export default ReviewNavigationModal
