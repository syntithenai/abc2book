import {Tabs, Tab, Modal, Button} from 'react-bootstrap'
import {Link} from 'react-router-dom'


export default function ImportWarningDialog(props) {
console.log(props.importResults)
function handleClose() {
  props.closeWarning()
}

return <Modal.Dialog 
  show="true" onHide={handleClose}
  backdrop="static"
  style={{minWidth:'95%'}} 
  keyboard="false"  >
      <Modal.Header closeButton >
        <Modal.Title>Import</Modal.Title>
      </Modal.Header>
      {!props.importResults && <Modal.Body><h1>Import Failed</h1></Modal.Body>}
      {props.importResults && <Modal.Body>
        {(Object.keys(props.importResults.inserts).length > 0) || (Object.keys(props.importResults.updates).length > 0) && <p>To import these tunes</p>}
         {Object.keys(props.importResults.updates).length ?<div><b>{Object.keys(props.importResults.updates).length}</b> items will be updated.</div>: ''}
         {Object.keys(props.importResults.skippedUpdates).length ?<div><b>{Object.keys(props.importResults.skippedUpdates).length}</b> items are up to date.</div>: ''}
         {Object.keys(props.importResults.inserts).length ? <div><b>{Object.keys(props.importResults.inserts).length}</b> items will be inserted.</div>: ''}
         {Object.keys(props.importResults.localUpdates).length ?<div><b>{Object.keys(props.importResults.localUpdates).length}</b> locally changed items will be skipped.</div>: ''}
         {Object.keys(props.importResults.localUpdates).length ?<div><b>{Object.keys(props.importResults.localUpdates).length}</b> duplicate items will be skipped.</div>: ''}
        
        
        <div style={{marginTop:'1em', marginBottom:'1em'}} >
        
          &nbsp;{(Object.keys(props.importResults.inserts).length > 0) || (Object.keys(props.importResults.updates).length > 0) ? <Button variant="success" onClick={function() {props.tunebook.applyImport()}} >Import</Button> : null}
          
          &nbsp;{(Object.keys(props.importResults.duplicates).length > 0) ? <Button variant="warning" onClick={function() {props.tunebook.applyImport(true)}} >Import With Duplicates</Button> : null}
          
          &nbsp;<Link to="/tunes"><Button variant="danger" onClick={function() {
            props.setImportResults(null)
            props.closeWarning()
            
          }} >Cancel</Button></Link>
          
          
        </div>
        <Tabs>
          <Tab eventKey="inserts" title="Inserted" >
            {Object.values(props.importResults.inserts).map(function(v,k) {
              return <div key={k} >{v.name}</div>
            })}
          </Tab>
          <Tab eventKey="updates" title="Updated" >
          {Object.values(props.importResults.updates).map(function(v,k) {
              return <div key={k} >{v.name}</div>
            })}
          </Tab>
          <Tab eventKey="localUpdates" title="Local Updates" >
          {Object.values(props.importResults.localUpdates).map(function(v,k) {
              return <div key={k} >{v.name}</div>
            })}
          </Tab>
          <Tab eventKey="skippedUpdates" title="Skipped Updates" >
          {Object.values(props.importResults.skippedUpdates).map(function(v,k) {
              return <div key={k} >{v.name}</div>
            })}
          </Tab>
          <Tab eventKey="duplicates" title="Duplicates" >
          {Object.values(props.importResults.duplicates).map(function(v,k) {
              return <div key={k} >{v.name}</div>
            })}
          </Tab>
         
        </Tabs>
      </Modal.Body>}

      
    </Modal.Dialog>
}
