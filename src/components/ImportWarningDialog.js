import {Tabs, Tab, Modal, Button, ListGroup, Container, Col, Row} from 'react-bootstrap'
import {Link} from 'react-router-dom'


export default function ImportWarningDialog(props) {
//console.log(props.importResults)

  function handleClose(e) {
    props.closeWarning()
  }

  return <Modal.Dialog  show="true" onHide={handleClose}
    backdrop="static"
    style={{minWidth:'95%'}} 
    keyboard="false"  >
        <Modal.Header  >
          <Modal.Title>Import</Modal.Title>
        </Modal.Header>
        {!props.importResults && <Modal.Body><h1>Import Failed</h1></Modal.Body>}
        {props.importResults && <Modal.Body>
          {(Object.keys(props.importResults.inserts).length > 0) || (Object.keys(props.importResults.updates).length > 0) && <p>To import these tunes</p>}
           {Object.keys(props.importResults.updates).length ?<div><b>{Object.keys(props.importResults.updates).length}</b> items will be updated.</div>: ''}
           {Object.keys(props.importResults.skippedUpdates).length ?<div><b>{Object.keys(props.importResults.skippedUpdates).length}</b> items are up to date.</div>: ''}
           {Object.keys(props.importResults.inserts).length ? <div><b>{Object.keys(props.importResults.inserts).length}</b> items will be inserted.</div>: ''}
           {Object.keys(props.importResults.localUpdates).length ?<div><b>{Object.keys(props.importResults.localUpdates).length}</b> locally changed items will be skipped.</div>: ''}
           {Object.keys(props.importResults.duplicates).length ?<div><b>{Object.keys(props.importResults.duplicates).length}</b> duplicate items will be skipped.</div>: ''}
          
          
          <div style={{marginTop:'1em', marginBottom:'1em'}} >
          
            &nbsp;{(Object.keys(props.importResults.inserts).length > 0) || (Object.keys(props.importResults.updates).length > 0) ? <Button variant="success" onClick={function() {props.tunebook.applyImport()}} >Import</Button> : null}
            
            &nbsp;{(Object.keys(props.importResults.duplicates).length > 0) ? <Button variant="warning" onClick={function() {props.tunebook.applyImport(true)}} >Import With Duplicates</Button> : null}
            
            &nbsp;{(Object.keys(props.importResults.localUpdates).length > 0) ? <Button variant="warning" onClick={function() {props.tunebook.applyImport(false,true)}} >Discard Local Changes</Button> : null}
            
            &nbsp;{(Object.keys(props.importResults.localUpdates).length > 0 && Object.keys(props.importResults.duplicates).length > 0) ? <Button variant="warning" onClick={function() {props.tunebook.applyImport(true,true)}} >Import Duplicates and Discard Local Changes</Button> : null}
            
            &nbsp;
            {(Object.keys(props.importResults.updates).length === 0 && Object.keys(props.importResults.inserts).length === 0) && <Link to="/tunes"><Button variant="success" onClick={function() {
              props.setImportResults(null)
              props.closeWarning()
              
            }} >OK</Button></Link>}
            {(Object.keys(props.importResults.updates).length > 0 || Object.keys(props.importResults.inserts).length > 0) && <Link to="/tunes"><Button variant="danger" onClick={function() {
              props.setImportResults(null)
              props.closeWarning()
              
            }} >Cancel</Button></Link>}
            
            
          </div>
          <Tabs>
            <Tab eventKey="inserts" title="Inserted" >
              <ListGroup>
              {Object.values(props.importResults.inserts).map(function(v,k) {
                return <ListGroup.Item className={k%2==0 ? 'even':'odd'} key={k} >
                   <Container><Row>
                     <Col xs='3' > &nbsp;
                        <span >{(props.importResults.tuneStatus.inserts[k] && props.importResults.tuneStatus.inserts[k].hasNotes) ? <Button variant="outline-primary">{props.tunebook.icons.music}</Button> : null}</span>
                        <span>{(props.importResults.tuneStatus.inserts[k] && props.importResults.tuneStatus.inserts[k].hasChords) ? <Button variant="outline-primary">{props.tunebook.icons.guitar}</Button> : null}</span>
                        <span>{(props.importResults.tuneStatus.inserts[k] && props.importResults.tuneStatus.inserts[k].hasLyrics) ? <Button variant="outline-primary">{props.tunebook.icons.words}</Button> : null}</span>
                    </Col>
                    <Col xs='9'  >{v.name} </Col>
                  </Row></Container> 
                </ListGroup.Item>
              })}
              </ListGroup>
            </Tab>
            <Tab eventKey="updates" title="Updated" >
            <ListGroup>
              {Object.values(props.importResults.updates).map(function(v,k) {
                return <ListGroup.Item className={k%2==0 ? 'even':'odd'} key={k} >
                   <Container><Row>
                     <Col xs='3' > &nbsp;
                        <span >{(props.importResults.tuneStatus.updates[k] && props.importResults.tuneStatus.updates[k].hasNotes) ? <Button>{props.tunebook.icons.music}</Button> : null}</span>
                        <span>{(props.importResults.tuneStatus.updates[k] && props.importResults.tuneStatus.updates[k].hasChords) ? <Button>{props.tunebook.icons.guitar}</Button> : null}</span>
                        <span>{(props.importResults.tuneStatus.updates[k] && props.importResults.tuneStatus.updates[k].hasLyrics) ? <Button>{props.tunebook.icons.words}</Button> : null}</span>
                    </Col>
                    <Col xs='9'  >{v.name} </Col>
                  </Row></Container> 
                </ListGroup.Item>
              })}
              </ListGroup>
            </Tab>
            <Tab eventKey="localUpdates" title="Local Updates" >
            <ListGroup>
              {Object.values(props.importResults.localUpdates).map(function(v,k) {
                return <ListGroup.Item className={k%2==0 ? 'even':'odd'} key={k} >
                   <Container><Row>
                     <Col xs='3' > &nbsp;
                        <span >{(props.importResults.tuneStatus.localUpdates[k] && props.importResults.tuneStatus.localUpdates[k].hasNotes) ? <Button>{props.tunebook.icons.music}</Button> : null}</span>
                        <span>{(props.importResults.tuneStatus.localUpdates[k] && props.importResults.tuneStatus.localUpdates[k].hasChords) ? <Button>{props.tunebook.icons.guitar}</Button> : null}</span>
                        <span>{(props.importResults.tuneStatus.localUpdates[k] && props.importResults.tuneStatus.localUpdates[k].hasLyrics) ? <Button>{props.tunebook.icons.words}</Button> : null}</span>
                    </Col>
                    <Col xs='9'  >{v.name} </Col>
                  </Row></Container> 
                </ListGroup.Item>
              })}
              </ListGroup>
            </Tab>
            <Tab eventKey="skippedUpdates" title="Skipped Updates" >
           <ListGroup>
              {Object.values(props.importResults.skippedUpdates).map(function(v,k) {
                return <ListGroup.Item className={k%2==0 ? 'even':'odd'} key={k} >
                   <Container><Row>
                     <Col xs='3' > &nbsp;
                        <span >{(props.importResults.tuneStatus.skippedUpdates[k] && props.importResults.tuneStatus.skippedUpdates[k].hasNotes) ? <Button>{props.tunebook.icons.music}</Button> : null}</span>
                        <span>{(props.importResults.tuneStatus.skippedUpdates[k] && props.importResults.tuneStatus.skippedUpdates[k].hasChords) ? <Button>{props.tunebook.icons.guitar}</Button> : null}</span>
                        <span>{(props.importResults.tuneStatus.skippedUpdates[k] && props.importResults.tuneStatus.skippedUpdates[k].hasLyrics) ? <Button>{props.tunebook.icons.words}</Button> : null}</span>
                    </Col>
                    <Col xs='9'  >{v.name} </Col>
                  </Row></Container> 
                </ListGroup.Item>
              })}
              </ListGroup>
             </Tab>
            <Tab eventKey="duplicates" title="Duplicates" >
              <ListGroup>
                {Object.values(props.importResults.duplicates).map(function(v,k) {
                  return <ListGroup.Item className={k%2==0 ? 'even':'odd'} key={k} >
                     <Container><Row>
                       <Col xs='3' > &nbsp;
                          <span >{(props.importResults.tuneStatus.duplicates[k] && props.importResults.tuneStatus.duplicates[k].hasNotes) ? <Button>{props.tunebook.icons.music}</Button> : null}</span>
                          <span>{(props.importResults.tuneStatus.duplicates[k] && props.importResults.tuneStatus.duplicates[k].hasChords) ? <Button>{props.tunebook.icons.guitar}</Button> : null}</span>
                          <span>{(props.importResults.tuneStatus.duplicates[k] && props.importResults.tuneStatus.duplicates[k].hasLyrics) ? <Button>{props.tunebook.icons.words}</Button> : null}</span>
                      </Col>
                      <Col xs='9'  >{v.name} </Col>
                    </Row></Container> 
                  </ListGroup.Item>
                })}
                </ListGroup>
            </Tab>
           
          </Tabs>
        </Modal.Body>}

        
      </Modal.Dialog>
}
