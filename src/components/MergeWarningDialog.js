import {Tabs, Tab, Modal, Button} from 'react-bootstrap'

export default function MergeWarningDialog(props) {

return <Modal.Dialog 
  backdrop="static"
  style={{minWidth:'95%'}} 
  keyboard={false} onHide={props.closeWarning} >
      <Modal.Header closeButton>
        <Modal.Title>Update Warning</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <p>Changes made on another device have been detected. </p>
        <p>To merge the changes </p>
         {Object.keys(props.sheetUpdateResults.localUpdates).length ?<div><b>{Object.keys(props.sheetUpdateResults.localUpdates).length}</b> items updated locally will be saved</div>: ''}
         {Object.keys(props.sheetUpdateResults.inserts).length ? <div><b>{Object.keys(props.sheetUpdateResults.inserts).length}</b> items will be inserted</div>: ''}
        {Object.keys(props.sheetUpdateResults.updates).length ?<div><b>{Object.keys(props.sheetUpdateResults.updates).length}</b> items will be updated</div>: ''}
        {Object.keys(props.sheetUpdateResults.deletes).length ?<div><b>{Object.keys(props.sheetUpdateResults.deletes).length}</b> new items will be saved</div>: ''}
       
        <div style={{marginTop:'1em', marginBottom:'1em'}} >
          <Button variant="danger" onClick={props.closeWarning} >Logout</Button>
          &nbsp;{Object.keys(props.sheetUpdateResults.localUpdates).length > 0 && <Button variant="warning" onClick={function() {props.overrideTuneBook(props.sheetUpdateResults.fullSheet)}} >Discard Local Changes</Button>}
          &nbsp;<Button variant="success" onClick={props.acceptChanges} >Merge</Button>
          
        </div>
        <Tabs>
          <Tab eventKey="inserts" title="Inserted" >
            {Object.values(props.sheetUpdateResults.inserts).map(function(v,k) {
              return <div key={k} >{v.name}</div>
            })}
          </Tab>
          <Tab eventKey="updates" title="Updated" >
          {Object.values(props.sheetUpdateResults.updates).map(function(v,k) {
              return <div key={k} >{v.name}</div>
            })}
          </Tab>
          <Tab eventKey="deletes" title="New tunes" >
          {Object.values(props.sheetUpdateResults.deletes).map(function(v,k) {
              return <div key={k} >{v.name}</div>
            })}
          </Tab>
          <Tab eventKey="local" title="Local Updates" >
          {Object.values(props.sheetUpdateResults.localUpdates).map(function(v,k) {
              return <div key={k} >{v.name}</div>
            })}
          </Tab>
        </Tabs>
      </Modal.Body>

      
    </Modal.Dialog>
}
