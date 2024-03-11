import {useState, useEffect} from 'react'
import {Button, Modal, Badge} from 'react-bootstrap'
import LinksEditor from './LinksEditor'


export default function LinksEditorModal(props) {
    var {tunebook, tune, icon, onChange, forceRefresh} = props
  const [show, setShow] = useState(false);
  var [links, setLinks] = useState(props.tune && Array.isArray(props.tune.links) ? JSON.stringify(props.tune.links) : '[]')
  
  
  const handleClose = () => {
      setShow(false);
      onChange(JSON.parse(links)) 
  }
  const handleShow = () => {
      setShow(true);
  }
  
  //useEffect(function() {
      ////console.log('tune change a', props.tune , props.tune ?  props.tune.name + JSON.stringify(props.tune.links) : 'notune')
      //setLinks(props.tune && Array.isArray(props.tune.links) ? JSON.stringify(props.tune.links) : '[]')
  //},[props.tune])

  //useEffect(function() {
      ////console.log('tune change b', props.tune , props.tune ?  props.tune.name +  JSON.stringify(props.tune.links) : 'notune')
      //setLinks(props.tune && Array.isArray(props.tune.links) ? JSON.stringify(props.tune.links) : '[]')
  //},[JSON.stringify(props.tune.links)])

    useEffect(function() {
        //console.log('tune change boot',props.tune ,  props.tune ?  props.tune.name +  JSON.stringify(props.tune.links): 'notune')
      setLinks(props.tune && Array.isArray(props.tune.links) ? JSON.stringify(props.tune.links) : '[]')
  },[props.tune])

  return (
    <>
        
      <Button style={{position:'relative', float:'left', marginLeft:'0.1em', width:'2.6em', height:'2.37em'}} variant="warning"   onClick={function() {
          handleShow()
        }}><span  style={{position:'absolute', top:'1px', left:'1.3em', opacity: 0.9, fontSize:'0.5em'}}>{tunebook.icons.link} </span><Badge size="sm" style={{position:'absolute', top:'26px', left:'1.4em',  fontSize:'0.5em'}} >{JSON.parse(links).length}</Badge></Button>

      <Modal show={show} onHide={handleClose}>
        <Modal.Header closeButton>
          <Modal.Title>Links</Modal.Title>
        </Modal.Header>
        <Modal.Body>
            <div  >
                <LinksEditor mediaController={props.mediaController} onChange={function(links) {
                        setLinks(JSON.stringify(links))
                    }}  tunebook={tunebook} links={JSON.parse(links)} tune={tune} handleClose={handleClose} />
            </div>
         
        </Modal.Body>
        
      </Modal>
    </>
  );
}
